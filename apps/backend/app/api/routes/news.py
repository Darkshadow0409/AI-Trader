from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import NewsView
from app.services.dashboard_data import list_news_views


router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=list[NewsView])
def list_news(session: Session = Depends(get_session)) -> list[NewsView]:
    return list_news_views(session)
