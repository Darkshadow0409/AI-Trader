from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import JournalEntryCreateRequest, JournalEntryUpdateRequest, JournalReviewView
from app.services.operator_console import create_journal_entry, list_journal_entries, update_journal_entry


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
