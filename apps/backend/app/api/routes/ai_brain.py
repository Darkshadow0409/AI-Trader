from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import (
    AIBrainHistoryDetailView,
    AIBrainHistoryItemView,
    AIBrainOperatorNoteCreateRequest,
    AIBrainOperatorNoteView,
    AIBrainQueryRequest,
    AIBrainResponseView,
)
from app.services.ai_brain import (
    create_ai_brain_note,
    get_ai_brain_history_detail,
    list_ai_brain_history,
    list_ai_brain_notes,
    run_ai_brain_query,
)


router = APIRouter(prefix="/ai-brain", tags=["ai-brain"])


@router.post("/query", response_model=AIBrainResponseView)
def query(payload: AIBrainQueryRequest, session: Session = Depends(get_session)) -> AIBrainResponseView:
    return run_ai_brain_query(session, query=payload.query, symbol=payload.symbol, timeframe=payload.timeframe)


@router.get("/history", response_model=list[AIBrainHistoryItemView])
def history(session: Session = Depends(get_session)) -> list[AIBrainHistoryItemView]:
    return list_ai_brain_history(session)


@router.get("/history/{audit_id}", response_model=AIBrainHistoryDetailView)
def history_detail(audit_id: str, session: Session = Depends(get_session)) -> AIBrainHistoryDetailView:
    detail = get_ai_brain_history_detail(session, audit_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="AI Brain audit record not found")
    return detail


@router.get("/history/{audit_id}/notes", response_model=list[AIBrainOperatorNoteView])
def history_notes(audit_id: str, session: Session = Depends(get_session)) -> list[AIBrainOperatorNoteView]:
    if get_ai_brain_history_detail(session, audit_id) is None:
        raise HTTPException(status_code=404, detail="AI Brain audit record not found")
    return list_ai_brain_notes(session, audit_id)


@router.post("/history/{audit_id}/notes", response_model=AIBrainOperatorNoteView)
def create_history_note(
    audit_id: str,
    payload: AIBrainOperatorNoteCreateRequest,
    session: Session = Depends(get_session),
) -> AIBrainOperatorNoteView:
    if not payload.note.strip():
        raise HTTPException(status_code=400, detail="Operator note is required")
    note = create_ai_brain_note(session, audit_id, payload.note, payload.status, payload.created_by)
    if note is None:
        raise HTTPException(status_code=404, detail="AI Brain audit record not found")
    return note
