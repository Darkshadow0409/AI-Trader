from __future__ import annotations

import base64
import hashlib
import html
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import RLock
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from app.core.settings import get_settings


COOKIE_NAME = "ai_trader_openai_session"
STATE_TTL = timedelta(minutes=15)
SESSION_TTL = timedelta(hours=12)
REFRESH_SKEW = timedelta(minutes=2)


@dataclass
class PendingOAuthFlow:
    state: str
    session_id: str
    code_verifier: str
    return_to: str
    created_at: datetime


@dataclass
class OAuthSession:
    session_id: str
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    connected_account: str | None
    created_at: datetime
    updated_at: datetime
    warning: str | None = None
    status: str = "connected"


@dataclass
class OAuthConnection:
    access_token: str | None
    connected_account: str | None
    warning: str | None
    session_expires_at: datetime | None
    oauth_enabled: bool
    status: str


_LOCK = RLock()
_PENDING: dict[str, PendingOAuthFlow] = {}
_SESSIONS: dict[str, OAuthSession] = {}


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def oauth_enabled() -> bool:
    settings = get_settings()
    return bool(settings.openai_oauth_client_id and settings.openai_oauth_client_secret)


def _oauth_origin_safe(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost"}


def _sanitize_return_to(request: Request, return_to: str | None) -> str:
    candidate = (return_to or request.headers.get("origin") or get_settings().frontend_origin).strip()
    if not _oauth_origin_safe(candidate):
        return get_settings().frontend_origin
    return candidate.rstrip("/")


def _redirect_uri(request: Request) -> str:
    return f"{str(request.base_url).rstrip('/')}/api/ai/oauth/callback"


def oauth_callback_url(request: Request) -> str:
    return _redirect_uri(request)


def _code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _cleanup_expired() -> None:
    now = _utc_now()
    with _LOCK:
        for state, pending in list(_PENDING.items()):
            if now - pending.created_at > STATE_TTL:
                _PENDING.pop(state, None)
        for session_id, session in list(_SESSIONS.items()):
            if session.expires_at and now - session.expires_at > SESSION_TTL:
                _SESSIONS.pop(session_id, None)


def _session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=int(SESSION_TTL.total_seconds()),
        path="/",
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def _form_post(url: str, data: dict[str, str]) -> dict[str, object]:
    with httpx.Client(timeout=20.0) as client:
        response = client.post(
            url,
            headers={"Accept": "application/json"},
            data=data,
        )
    response.raise_for_status()
    return response.json()


def _fetch_userinfo(access_token: str) -> dict[str, object]:
    settings = get_settings()
    with httpx.Client(timeout=15.0) as client:
        response = client.get(
            settings.openai_oauth_userinfo_url,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {access_token}",
            },
        )
    response.raise_for_status()
    return response.json()


def _friendly_oauth_refresh_warning(error: httpx.HTTPError) -> tuple[str, str]:
    if isinstance(error, httpx.TimeoutException):
        return (
            "auth_unavailable",
            "OpenAI could not refresh the saved session right now. Reconnect or keep using the local advisory brief.",
        )
    if isinstance(error, httpx.HTTPStatusError):
        if error.response.status_code in {400, 401, 403}:
            return (
                "session_expired",
                "Your OpenAI session expired or was revoked. Reconnect to continue authenticated advisory runs.",
            )
        if error.response.status_code == 429:
            return (
                "auth_unavailable",
                "OpenAI rate-limited the saved session refresh. Retry later or keep using the local advisory brief.",
            )
        if error.response.status_code >= 500:
            return (
                "auth_unavailable",
                "OpenAI could not refresh the saved session right now. Reconnect or keep using the local advisory brief.",
            )
    return (
        "auth_unavailable",
        "OpenAI could not refresh the saved session right now. Reconnect or keep using the local advisory brief.",
    )


def _friendly_oauth_popup_error(error: str | None, description: str | None = None) -> str:
    if error in {"access_denied", "login_required", "consent_required"}:
        return "OpenAI connection was canceled before it could be attached to this desk."
    if error in {"invalid_request", "invalid_scope", "unauthorized_client"}:
        return "OpenAI OAuth is configured incorrectly on this backend. Check the client settings and callback URL."
    if description and description.strip():
        return "OpenAI could not complete the connection. Reconnect or keep using the local advisory brief."
    return "OpenAI could not complete the connection. Reconnect or keep using the local advisory brief."


def _friendly_oauth_exchange_warning(error: httpx.HTTPError) -> str:
    if isinstance(error, httpx.TimeoutException):
        return "OpenAI did not finish the connection in time. Retry the login flow or keep using the local advisory brief."
    if isinstance(error, httpx.HTTPStatusError):
        if error.response.status_code in {400, 401, 403}:
            return "OpenAI rejected the current login exchange. Check the OAuth app settings or reconnect."
        if error.response.status_code == 429:
            return "OpenAI rate-limited the connection flow. Retry shortly or keep using the local advisory brief."
        if error.response.status_code >= 500:
            return "OpenAI is unavailable for login right now. Retry shortly or keep using the local advisory brief."
    return "OpenAI could not complete the connection. Reconnect or keep using the local advisory brief."


def _connected_account(userinfo: dict[str, object]) -> str | None:
    for key in ("email", "name", "nickname"):
        value = userinfo.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _store_session(session_id: str, token_payload: dict[str, object], userinfo: dict[str, object], warning: str | None = None) -> OAuthSession:
    now = _utc_now()
    expires_in = int(token_payload.get("expires_in", 0) or 0)
    expires_at = now + timedelta(seconds=expires_in) if expires_in > 0 else None
    oauth_session = OAuthSession(
        session_id=session_id,
        access_token=str(token_payload["access_token"]),
        refresh_token=str(token_payload["refresh_token"]) if token_payload.get("refresh_token") else None,
        expires_at=expires_at,
        connected_account=_connected_account(userinfo),
        created_at=now,
        updated_at=now,
        warning=warning,
        status="connected",
    )
    with _LOCK:
        _SESSIONS[session_id] = oauth_session
    return oauth_session


def _refresh_session(session_id: str, session: OAuthSession) -> OAuthSession | None:
    settings = get_settings()
    if not session.refresh_token or not oauth_enabled():
        return None
    try:
        token_payload = _form_post(
            settings.openai_oauth_token_url,
            {
                "grant_type": "refresh_token",
                "refresh_token": session.refresh_token,
                "client_id": settings.openai_oauth_client_id,
                "client_secret": settings.openai_oauth_client_secret,
            },
        )
        userinfo = _fetch_userinfo(str(token_payload["access_token"]))
    except httpx.HTTPError as exc:
        status, warning = _friendly_oauth_refresh_warning(exc)
        with _LOCK:
            stale = _SESSIONS.get(session_id)
            if stale:
                stale.warning = warning
                stale.status = status
                stale.access_token = ""
                stale.expires_at = _utc_now() - timedelta(seconds=1)
                stale.updated_at = _utc_now()
        return None
    return _store_session(session_id, token_payload, userinfo)


def current_oauth_connection(request: Request) -> OAuthConnection:
    _cleanup_expired()
    session_id = request.cookies.get(COOKIE_NAME)
    if not session_id:
        enabled = oauth_enabled()
        return OAuthConnection(None, None, None, None, enabled, "auth_required" if enabled else "oauth_not_configured")
    with _LOCK:
        session = _SESSIONS.get(session_id)
    if not session:
        enabled = oauth_enabled()
        return OAuthConnection(None, None, None, None, enabled, "auth_required" if enabled else "oauth_not_configured")
    if session.expires_at and _utc_now() >= session.expires_at - REFRESH_SKEW:
        refreshed = _refresh_session(session_id, session)
        if refreshed:
            session = refreshed
    if not session.access_token:
        session_state = session.status
        if session_state == "connected" and session.expires_at and _utc_now() >= session.expires_at:
            session_state = "session_expired"
        return OAuthConnection(None, session.connected_account, session.warning, session.expires_at, oauth_enabled(), session_state)
    return OAuthConnection(session.access_token, session.connected_account, session.warning, session.expires_at, oauth_enabled(), session.status)


def start_oauth_flow(request: Request, return_to: str | None = None) -> Response:
    if not oauth_enabled():
        raise HTTPException(status_code=503, detail="OpenAI OAuth is not configured. Set AI_TRADER_OPENAI_OAUTH_CLIENT_ID and AI_TRADER_OPENAI_OAUTH_CLIENT_SECRET.")
    settings = get_settings()
    session_id = request.cookies.get(COOKIE_NAME) or secrets.token_urlsafe(24)
    state = secrets.token_urlsafe(24)
    code_verifier = secrets.token_urlsafe(72)
    safe_return_to = _sanitize_return_to(request, return_to)
    with _LOCK:
        _PENDING[state] = PendingOAuthFlow(
            state=state,
            session_id=session_id,
            code_verifier=code_verifier,
            return_to=safe_return_to,
            created_at=_utc_now(),
        )
    authorize_params = {
        "audience": settings.openai_oauth_audience,
        "client_id": settings.openai_oauth_client_id,
        "redirect_uri": _redirect_uri(request),
        "scope": settings.openai_oauth_scopes,
        "response_type": "code",
        "response_mode": "query",
        "state": state,
        "code_challenge": _code_challenge(code_verifier),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    authorize_url = f"{settings.openai_oauth_authorize_url}?{urlencode(authorize_params)}"
    response = RedirectResponse(authorize_url, status_code=302)
    _session_cookie(response, session_id)
    return response


def _popup_html(return_to: str, payload: dict[str, str]) -> HTMLResponse:
    message = json.dumps(payload).replace("<", "\\u003c")
    safe_return_to = html.escape(return_to)
    target = json.dumps(return_to).replace("<", "\\u003c")
    content = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OpenAI Connection</title>
  </head>
  <body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#0f131a;color:#f4f6fb;">
    <p>Completing OpenAI connection…</p>
    <script>
      const target = {target};
      const payload = {message};
      if (window.opener) {{
        window.opener.postMessage(payload, target);
        window.close();
      }} else {{
        window.location.assign(target);
      }}
    </script>
    <noscript>
      <p>Authentication completed. Return to <a href="{safe_return_to}">{safe_return_to}</a>.</p>
    </noscript>
  </body>
</html>"""
    return HTMLResponse(content)


def complete_oauth_flow(
    request: Request,
    *,
    code: str | None,
    state: str | None,
    error: str | None,
    error_description: str | None,
) -> Response:
    _cleanup_expired()
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state.")
    with _LOCK:
        pending = _PENDING.pop(state, None)
    if not pending:
        raise HTTPException(status_code=400, detail="Unknown or expired OAuth state.")

    if error:
        response = _popup_html(
            pending.return_to,
            {
                "type": "ai-oauth",
                "status": "error",
                "message": _friendly_oauth_popup_error(error, error_description),
            },
        )
        _session_cookie(response, pending.session_id)
        return response
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth authorization code.")

    settings = get_settings()
    try:
        token_payload = _form_post(
            settings.openai_oauth_token_url,
            {
                "grant_type": "authorization_code",
                "client_id": settings.openai_oauth_client_id,
                "client_secret": settings.openai_oauth_client_secret,
                "code": code,
                "code_verifier": pending.code_verifier,
                "redirect_uri": _redirect_uri(request),
            },
        )
        userinfo = _fetch_userinfo(str(token_payload["access_token"]))
        session = _store_session(pending.session_id, token_payload, userinfo)
        response = _popup_html(
            pending.return_to,
            {
                "type": "ai-oauth",
                "status": "connected",
                "account": session.connected_account or "OpenAI user",
            },
        )
        _session_cookie(response, pending.session_id)
        return response
    except httpx.HTTPError as exc:
        response = _popup_html(
            pending.return_to,
            {
                "type": "ai-oauth",
                "status": "error",
                "message": _friendly_oauth_exchange_warning(exc),
            },
        )
        _session_cookie(response, pending.session_id)
        return response


def disconnect_oauth(request: Request) -> JSONResponse:
    session_id = request.cookies.get(COOKIE_NAME)
    revoked = False
    if session_id:
        with _LOCK:
            session = _SESSIONS.pop(session_id, None)
        if session and session.refresh_token and oauth_enabled():
            settings = get_settings()
            try:
                _form_post(
                    settings.openai_oauth_revoke_url,
                    {
                        "client_id": settings.openai_oauth_client_id,
                        "client_secret": settings.openai_oauth_client_secret,
                        "token": session.refresh_token,
                    },
                )
                revoked = True
            except httpx.HTTPError:
                revoked = False
    response = JSONResponse({"status": "disconnected", "revoked": revoked})
    _clear_cookie(response)
    return response
