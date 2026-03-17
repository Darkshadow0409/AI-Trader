from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import SignalDetailView, SignalsSummaryView, SignalView
from app.services.dashboard_data import list_high_risk_signal_views, list_signal_views
from app.services.operator_console import get_signal_detail
from app.services.ui_summaries import signals_summary


router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=list[SignalView])
def list_signals(session: Session = Depends(get_session)) -> list[SignalView]:
    return list_signal_views(session)


@router.get("/high-risk", response_model=list[SignalView])
def list_high_risk_signals(session: Session = Depends(get_session)) -> list[SignalView]:
    return list_high_risk_signal_views(session)


@router.get("/summary", response_model=SignalsSummaryView)
def summary(session: Session = Depends(get_session)) -> SignalsSummaryView:
    return signals_summary(session)


@router.get("/{signal_id}", response_model=SignalDetailView)
def signal_detail(signal_id: str, session: Session = Depends(get_session)) -> SignalDetailView:
    payload = get_signal_detail(session, signal_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Signal not found.")
    return payload
