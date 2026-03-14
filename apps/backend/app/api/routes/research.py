from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import ResearchView
from app.services.dashboard_data import list_research_views


router = APIRouter(prefix="/research", tags=["research"])


@router.get("", response_model=list[ResearchView])
def research(session: Session = Depends(get_session)) -> list[ResearchView]:
    return list_research_views(session)
