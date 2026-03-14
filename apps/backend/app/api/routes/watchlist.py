from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.core.database import get_session
from app.models.entities import WatchlistItem
from app.models.schemas import WatchlistView


router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistView])
def list_watchlist(session: Session = Depends(get_session)) -> list[WatchlistView]:
    rows = session.exec(select(WatchlistItem).order_by(desc(WatchlistItem.last_signal_score))).all()
    return [
        WatchlistView(
            symbol=row.symbol,
            label=row.label,
            thesis=row.thesis,
            priority=row.priority,
            status=row.status,
            last_signal_score=row.last_signal_score,
            updated_at=row.updated_at,
            freshness_minutes=max(0, int((naive_utc_now() - row.updated_at).total_seconds() // 60)),
        )
        for row in rows
    ]
