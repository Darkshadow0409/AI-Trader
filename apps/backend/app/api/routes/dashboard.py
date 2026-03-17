from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import AssetContextView, DeskSummaryView, HomeOperatorSummaryView, RibbonView
from app.services.dashboard_data import asset_context, dashboard_ribbon
from app.services.operator_desk import desk_summary
from app.services.ui_summaries import home_operator_summary


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=RibbonView)
def overview(session: Session = Depends(get_session)) -> RibbonView:
    return dashboard_ribbon(session)


@router.get("/desk", response_model=DeskSummaryView)
def desk(session: Session = Depends(get_session)) -> DeskSummaryView:
    return desk_summary(session)


@router.get("/home-summary", response_model=HomeOperatorSummaryView)
def home_summary(session: Session = Depends(get_session)) -> HomeOperatorSummaryView:
    return home_operator_summary(session)


@router.get("/assets/{symbol}", response_model=AssetContextView)
def asset_detail(symbol: str, session: Session = Depends(get_session)) -> AssetContextView:
    payload = asset_context(session, symbol.upper())
    if payload.research is None and payload.latest_signal is None and payload.latest_risk is None:
        raise HTTPException(status_code=404, detail="Asset context not found.")
    return payload
