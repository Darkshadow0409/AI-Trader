from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import PolymarketHunterView, PolymarketMarketView
from app.services.polymarket import polymarket_hunter, polymarket_market_detail


router = APIRouter(prefix="/polymarket", tags=["polymarket"])


@router.get("/hunter", response_model=PolymarketHunterView)
def hunter(
    q: str = Query(default=""),
    tag: str = Query(default=""),
    sort: str = Query(default="relevance"),
    limit: int = Query(default=30, ge=1, le=100),
) -> PolymarketHunterView:
    return polymarket_hunter(query=q, tag=tag, sort=sort, limit=limit)


@router.get("/markets/{market_id}", response_model=PolymarketMarketView)
def market_detail(market_id: str) -> PolymarketMarketView:
    payload = polymarket_market_detail(market_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Polymarket market not found.")
    return payload
