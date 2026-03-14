from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import RiskExposureView, RiskView
from app.services.dashboard_data import list_risk_exposure_views, list_risk_views


router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("/latest", response_model=list[RiskView])
def latest_risk(session: Session = Depends(get_session)) -> list[RiskView]:
    return list_risk_views(session)


@router.get("/exposure", response_model=list[RiskExposureView])
def risk_exposure(session: Session = Depends(get_session)) -> list[RiskExposureView]:
    return list_risk_exposure_views(session)
