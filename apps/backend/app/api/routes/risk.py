from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import RiskDetailView, RiskExposureView, RiskView
from app.services.dashboard_data import list_risk_exposure_views, list_risk_views
from app.services.operator_console import get_risk_detail


router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("/latest", response_model=list[RiskView])
def latest_risk(session: Session = Depends(get_session)) -> list[RiskView]:
    return list_risk_views(session)


@router.get("/exposure", response_model=list[RiskExposureView])
def risk_exposure(session: Session = Depends(get_session)) -> list[RiskExposureView]:
    return list_risk_exposure_views(session)


@router.get("/{risk_report_id}", response_model=RiskDetailView)
def risk_detail(risk_report_id: str, session: Session = Depends(get_session)) -> RiskDetailView:
    payload = get_risk_detail(session, risk_report_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Risk report not found.")
    return payload
