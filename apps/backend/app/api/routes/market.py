from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, desc, select

from app.core.database import get_session
from app.models.entities import MarketBar
from app.models.schemas import BarView, MarketChartView
from app.services.market_views import market_chart_view
from app.services.market_identity import resolve_symbol


router = APIRouter(prefix="/market", tags=["market"])


@router.get("/bars/{symbol}", response_model=list[BarView])
def bars(symbol: str, timeframe: str = Query(default="1d"), session: Session = Depends(get_session)) -> list[BarView]:
    canonical_symbol = resolve_symbol(symbol)
    rows = session.exec(
        select(MarketBar)
        .where(MarketBar.symbol == canonical_symbol)
        .where(MarketBar.timeframe == timeframe.lower())
        .order_by(desc(MarketBar.timestamp))
        .limit(120)
    ).all()
    ordered = list(reversed(rows))
    return [BarView.model_validate(row.model_dump()) for row in ordered]


@router.get("/chart/{symbol}", response_model=MarketChartView)
def chart(symbol: str, timeframe: str = Query(default="1d"), session: Session = Depends(get_session)) -> MarketChartView:
    return market_chart_view(session, symbol, timeframe)
