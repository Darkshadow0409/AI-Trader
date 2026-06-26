from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import AIBrainQueryRequest, AIBrainResponseView
from app.services.ai_brain import run_ai_brain_query


router = APIRouter(prefix="/ai-brain", tags=["ai-brain"])


@router.post("/query", response_model=AIBrainResponseView)
def query(payload: AIBrainQueryRequest, session: Session = Depends(get_session)) -> AIBrainResponseView:
    return run_ai_brain_query(session, query=payload.query, symbol=payload.symbol, timeframe=payload.timeframe)
