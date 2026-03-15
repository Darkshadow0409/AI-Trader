from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import (
    JournalEntryCreateRequest,
    JournalEntryUpdateRequest,
    JournalReviewView,
    PaperTradeAnalyticsView,
    PaperTradeReviewRequest,
    PaperTradeReviewView,
)
from app.services.operator_console import create_journal_entry, list_journal_entries, update_journal_entry
from app.services.paper_trading import list_paper_trade_reviews, paper_trade_analytics, upsert_paper_trade_review


router = APIRouter(prefix="/journal", tags=["journal"])


@router.get("", response_model=list[JournalReviewView])
def journal(session: Session = Depends(get_session)) -> list[JournalReviewView]:
    return list_journal_entries(session)


@router.post("", response_model=JournalReviewView, status_code=status.HTTP_201_CREATED)
def create_journal(payload: JournalEntryCreateRequest, session: Session = Depends(get_session)) -> JournalReviewView:
    return create_journal_entry(session, payload)


@router.patch("/{journal_id}", response_model=JournalReviewView)
def update_journal(
    journal_id: str,
    payload: JournalEntryUpdateRequest,
    session: Session = Depends(get_session),
) -> JournalReviewView:
    updated = update_journal_entry(session, journal_id, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return updated


@router.get("/paper-trade-reviews", response_model=list[PaperTradeReviewView])
def paper_trade_reviews(session: Session = Depends(get_session)) -> list[PaperTradeReviewView]:
    return list_paper_trade_reviews(session)


@router.put("/paper-trades/{trade_id}/review", response_model=PaperTradeReviewView)
def upsert_trade_review(
    trade_id: str,
    payload: PaperTradeReviewRequest,
    session: Session = Depends(get_session),
) -> PaperTradeReviewView:
    review = upsert_paper_trade_review(session, trade_id, payload)
    if review is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    return review


@router.get("/paper-trades/analytics", response_model=PaperTradeAnalyticsView)
def paper_trade_review_analytics(session: Session = Depends(get_session)) -> PaperTradeAnalyticsView:
    return paper_trade_analytics(session)
