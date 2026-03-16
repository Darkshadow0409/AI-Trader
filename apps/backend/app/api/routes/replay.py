from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import ReplayView, ScenarioStressSummaryView
from app.services.replay_engine import replay_view, scenario_stress_summary


router = APIRouter(prefix="/replay", tags=["replay"])


@router.get("", response_model=ReplayView)
def replay(
    symbol: str = "BTC",
    signal_id: str | None = None,
    trade_id: str | None = None,
    event_window_minutes: int = 180,
    session: Session = Depends(get_session),
) -> ReplayView:
    return replay_view(
        session,
        symbol=symbol.upper(),
        signal_id=signal_id,
        trade_id=trade_id,
        event_window_minutes=event_window_minutes,
    )


@router.get("/scenario-stress", response_model=ScenarioStressSummaryView)
def replay_scenario_stress(
    symbol: str | None = None,
    signal_id: str | None = None,
    trade_id: str | None = None,
    session: Session = Depends(get_session),
) -> ScenarioStressSummaryView:
    return scenario_stress_summary(
        session,
        symbol=symbol.upper() if symbol else None,
        signal_id=signal_id,
        trade_id=trade_id,
    )
