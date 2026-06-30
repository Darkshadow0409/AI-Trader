from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import (
    MarketEvidenceProviderDescriptor,
    MarketEvidenceProviderReadinessView,
    MarketEvidenceSnapshot,
)
from app.services.market_evidence import (
    list_market_evidence_providers,
    market_evidence_snapshot,
    provider_readiness_summary,
)


router = APIRouter(prefix="/market-evidence", tags=["market-evidence"])


@router.get("/providers", response_model=list[MarketEvidenceProviderDescriptor])
def providers() -> list[MarketEvidenceProviderDescriptor]:
    return list_market_evidence_providers()


@router.get("/provider-readiness", response_model=list[MarketEvidenceProviderReadinessView])
def provider_readiness(session: Session = Depends(get_session)) -> list[MarketEvidenceProviderReadinessView]:
    return provider_readiness_summary(session)


@router.get("/snapshot", response_model=MarketEvidenceSnapshot)
def snapshot(
    symbol: str = Query(default="USOUSD"),
    timeframe: str = Query(default="1d"),
    session: Session = Depends(get_session),
) -> MarketEvidenceSnapshot:
    return market_evidence_snapshot(session, symbol=symbol, timeframe=timeframe)
