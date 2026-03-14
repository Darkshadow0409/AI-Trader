from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, desc, select

from app.core.database import get_session
from app.models.entities import MarketBar
from app.models.schemas import BarView


router = APIRouter(prefix="/market", tags=["market"])


@router.get("/bars/{symbol}", response_model=list[BarView])
def bars(symbol: str, session: Session = Depends(get_session)) -> list[BarView]:
    rows = session.exec(
        select(MarketBar)
        .where(MarketBar.symbol == symbol.upper())
        .order_by(desc(MarketBar.timestamp))
        .limit(120)
    ).all()
    ordered = list(reversed(rows))
    return [BarView.model_validate(row.model_dump()) for row in ordered]
