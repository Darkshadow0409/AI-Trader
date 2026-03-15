from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import AlertEnvelope
from app.services.operator_console import list_alerts


router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertEnvelope])
def alerts(session: Session = Depends(get_session)) -> list[AlertEnvelope]:
    return list_alerts(session)
