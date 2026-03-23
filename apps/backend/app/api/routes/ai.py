from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import AIAdvisorRequest, AIAdvisorResponseView, AIProviderStatusView
from app.services.ai_advisor import advisor_status, run_advisor
from app.services.openai_oauth import complete_oauth_flow, disconnect_oauth, start_oauth_flow


router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AIProviderStatusView)
def status(request: Request, x_openai_api_key: str | None = Header(default=None)) -> AIProviderStatusView:
    return advisor_status(request, x_openai_api_key)


@router.get("/oauth/start")
def oauth_start(request: Request, return_to: str | None = Query(default=None)):
    return start_oauth_flow(request, return_to=return_to)


@router.get("/oauth/callback")
def oauth_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
):
    return complete_oauth_flow(
        request,
        code=code,
        state=state,
        error=error,
        error_description=error_description,
    )


@router.post("/oauth/logout")
def oauth_logout(request: Request):
    return disconnect_oauth(request)


@router.post("/advisor", response_model=AIAdvisorResponseView)
def advisor(
    request: Request,
    payload: AIAdvisorRequest,
    session: Session = Depends(get_session),
    x_openai_api_key: str | None = Header(default=None),
) -> AIAdvisorResponseView:
    return run_advisor(
        session,
        request,
        query=payload.query,
        symbol=payload.symbol,
        timeframe=payload.timeframe,
        api_key=x_openai_api_key,
        model=payload.model,
        active_tab=payload.active_tab,
        selected_signal_id=payload.selected_signal_id,
        selected_risk_report_id=payload.selected_risk_report_id,
    )
