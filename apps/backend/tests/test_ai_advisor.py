from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.services.pipeline import seed_and_refresh
from app.services import ai_advisor as ai_advisor_service
from app.services import openai_oauth
from app.services.openai_oauth import OAuthConnection, PendingOAuthFlow


def test_ai_status_reports_oauth_not_configured_without_token() -> None:
    seed_and_refresh()
    client = TestClient(app)

    response = client.get("/api/ai/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "openai"
    assert payload["auth_mode"] == "oauth"
    assert payload["status"] == "oauth_not_configured"
    assert payload["connected"] is False
    assert "oauth_enabled" in payload
    assert "guidance" in payload


def test_ai_advisor_returns_local_advisory_fallback_without_token() -> None:
    seed_and_refresh()
    client = TestClient(app)

    response = client.post(
        "/api/ai/advisor",
        json={
            "query": "What matters most for oil right now?",
            "symbol": "USOUSD",
            "timeframe": "1d",
            "active_tab": "ai_desk",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "WTI"
    assert payload["timeframe"] == "1d"
    assert payload["provider_status"]["status"] == "oauth_not_configured"
    assert payload["market_data_mode"] in {"fixture", "public_live", "broker_live"}
    assert payload["final_answer"]
    assert payload["data_truth_note"]
    assert payload["context_snapshot"]["selected_instrument"] == "USOUSD"
    assert payload["context_snapshot"]["active_workspace"] == "AI Desk"
    assert payload["context_snapshot"]["watchlist_board"]
    assert payload["market_view"]
    assert payload["why_it_matters_now"]
    assert payload["key_levels"]
    assert payload["catalysts"]
    assert payload["invalidation"]
    assert payload["risk_frame"]
    assert payload["related_markets"]
    assert payload["next_actions"]
    assert len(payload["agent_results"]) == 4
    assert {row["agent"] for row in payload["agent_results"]} == {
        "Research Agent",
        "News Agent",
        "Risk Analysis Agent",
        "Sentiment Agent",
    }
    assert "USOUSD" in payload["context_summary"]
    assert any("USOUSD" in item for item in payload["risk_frame"])
    assert any(step["workspace"] == "watchlist" for step in payload["next_actions"])


def test_ai_oauth_start_is_explicit_when_not_configured() -> None:
    seed_and_refresh()
    client = TestClient(app)

    response = client.get("/api/ai/oauth/start", follow_redirects=False)

    assert response.status_code == 503
    assert "OpenAI OAuth is not configured" in response.json()["detail"]


def test_ai_status_reports_expired_session_calmly(monkeypatch) -> None:
    seed_and_refresh()
    client = TestClient(app)

    monkeypatch.setattr(
        ai_advisor_service,
        "current_oauth_connection",
        lambda request: OAuthConnection(
            access_token=None,
            connected_account="operator@example.com",
            warning="Your OpenAI session expired or was revoked. Reconnect to continue authenticated advisory runs.",
            session_expires_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5),
            oauth_enabled=True,
            status="session_expired",
        ),
    )

    response = client.get("/api/ai/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "session_expired"
    assert payload["connected"] is False
    assert "expired or was revoked" in payload["guidance"]
    assert "expired or was revoked" in payload["warning"]


def test_ai_oauth_callback_denied_message_is_user_safe() -> None:
    seed_and_refresh()
    client = TestClient(app)

    openai_oauth._PENDING["test-denied"] = PendingOAuthFlow(
        state="test-denied",
        session_id="session-denied",
        code_verifier="verifier",
        return_to="http://127.0.0.1:5173",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )

    response = client.get("/api/ai/oauth/callback?state=test-denied&error=access_denied&error_description=User%20denied")

    assert response.status_code == 200
    assert "OpenAI connection was canceled before it could be attached to this desk." in response.text
    assert "User denied" not in response.text


def test_ai_oauth_callback_bad_credentials_message_is_user_safe(monkeypatch) -> None:
    seed_and_refresh()
    client = TestClient(app)

    openai_oauth._PENDING["test-bad-creds"] = PendingOAuthFlow(
        state="test-bad-creds",
        session_id="session-bad-creds",
        code_verifier="verifier",
        return_to="http://127.0.0.1:5173",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )

    request = openai_oauth.httpx.Request("POST", "https://auth0.openai.com/oauth/token")
    response = openai_oauth.httpx.Response(401, request=request)

    def raise_http_error(url: str, data: dict[str, str]) -> dict[str, object]:
        raise openai_oauth.httpx.HTTPStatusError("401 Client Error", request=request, response=response)

    monkeypatch.setattr(openai_oauth, "_form_post", raise_http_error)

    callback = client.get("/api/ai/oauth/callback?state=test-bad-creds&code=test-code")

    assert callback.status_code == 200
    assert "OpenAI rejected the current login exchange. Check the OAuth app settings or reconnect." in callback.text
    assert "401 Client Error" not in callback.text


def test_ai_oauth_callback_connects_when_oauth_is_configured(monkeypatch) -> None:
    seed_and_refresh()
    client = TestClient(app)

    monkeypatch.setattr(openai_oauth, "oauth_enabled", lambda: True)
    monkeypatch.setattr(
        openai_oauth,
        "_form_post",
        lambda url, data: {
            "access_token": "test-access-token",
            "refresh_token": "test-refresh-token",
            "expires_in": 3600,
        },
    )
    monkeypatch.setattr(openai_oauth, "_fetch_userinfo", lambda access_token: {"email": "operator@example.com"})

    openai_oauth._PENDING["test-connected"] = PendingOAuthFlow(
        state="test-connected",
        session_id="session-connected",
        code_verifier="verifier",
        return_to="http://127.0.0.1:5173",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )

    callback = client.get("/api/ai/oauth/callback?state=test-connected&code=test-code")

    assert callback.status_code == 200
    assert '"status": "connected"' in callback.text

    status = client.get("/api/ai/status", cookies=callback.cookies)

    assert status.status_code == 200
    payload = status.json()
    assert payload["status"] == "connected"
    assert payload["connected"] is True
    assert payload["connected_account"] == "operator@example.com"
