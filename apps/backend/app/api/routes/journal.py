from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import JournalReviewView
from app.services.dashboard_data import list_journal_reviews


router = APIRouter(prefix="/journal", tags=["journal"])


@router.get("", response_model=list[JournalReviewView])
def journal() -> list[JournalReviewView]:
    return list_journal_reviews()
