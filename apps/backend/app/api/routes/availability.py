from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import AvailabilityStatusView, PaperStateExportView
from app.services.availability import availability_status, paper_state_export


router = APIRouter(prefix="/availability", tags=["availability"])


@router.get("/status", response_model=AvailabilityStatusView)
def status(session: Session = Depends(get_session)) -> AvailabilityStatusView:
    return availability_status(session)


@router.get("/paper-state-export", response_model=PaperStateExportView)
def export_paper_state(
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
) -> PaperStateExportView:
    return paper_state_export(session, limit=limit)
