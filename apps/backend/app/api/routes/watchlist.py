from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, desc, select

from app.core.database import get_session
from app.models.entities import WatchlistItem
from app.models.schemas import OpportunityHunterView, WatchlistSummaryView, WatchlistView
from app.services.market_identity import resolve_symbol, terminal_focus_priority
from app.services.market_views import list_watchlist_summaries, with_default_watchlist_items
from app.services.operator_console import list_opportunities


router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistView])
def list_watchlist(session: Session = Depends(get_session)) -> list[WatchlistView]:
    rows = with_default_watchlist_items(session.exec(select(WatchlistItem).order_by(desc(WatchlistItem.last_signal_score))).all())
    summary_by_symbol = {row.symbol: row for row in list_watchlist_summaries(session)}
    payload = [
        WatchlistView(
            symbol=row.symbol,
            label=row.label,
            thesis=row.thesis,
            priority=row.priority,
            status=row.status,
            last_signal_score=row.last_signal_score,
            updated_at=row.updated_at,
            freshness_minutes=summary_by_symbol.get(resolve_symbol(row.symbol)).freshness_minutes
            if summary_by_symbol.get(resolve_symbol(row.symbol)) is not None
            else 9999,
            freshness_state=summary_by_symbol.get(resolve_symbol(row.symbol)).freshness_state
            if summary_by_symbol.get(resolve_symbol(row.symbol)) is not None
            else "unknown",
        )
        for row in rows
    ]
    return sorted(payload, key=lambda row: (terminal_focus_priority(row.symbol), row.priority, -row.last_signal_score))


@router.get("/opportunity-hunter", response_model=OpportunityHunterView)
def opportunity_hunter(session: Session = Depends(get_session)) -> OpportunityHunterView:
    return list_opportunities(session)


@router.get("/summary", response_model=list[WatchlistSummaryView])
def watchlist_summary(session: Session = Depends(get_session)) -> list[WatchlistSummaryView]:
    return list_watchlist_summaries(session)
