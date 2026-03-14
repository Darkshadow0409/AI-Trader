from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import SignalView
from app.services.dashboard_data import list_high_risk_signal_views, list_signal_views


router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=list[SignalView])
def list_signals(session: Session = Depends(get_session)) -> list[SignalView]:
    return list_signal_views(session)


@router.get("/high-risk", response_model=list[SignalView])
def list_high_risk_signals(session: Session = Depends(get_session)) -> list[SignalView]:
    return list_high_risk_signal_views(session)
