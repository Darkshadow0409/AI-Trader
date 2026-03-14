from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import StrategyDetailView, StrategyListView
from app.strategy_lab.service import get_strategy, list_strategies


router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("", response_model=list[StrategyListView])
def strategies(session: Session = Depends(get_session)) -> list[StrategyListView]:
    rows = list_strategies(session)
    return [
        StrategyListView(
            name=row.name,
            version=row.version,
            template=row.template,
            description=row.description,
            underlying_symbol=row.underlying_symbol,
            tradable_symbol=row.tradable_symbol,
            timeframe=row.timeframe,
            warmup_bars=row.warmup_bars,
            fees_bps=row.fees_bps,
            slippage_bps=row.slippage_bps,
            proxy_grade=row.proxy_grade,
            promoted=row.promoted,
            tags=row.tags_json,
            validation=row.validation_json,
        )
        for row in rows
    ]


@router.get("/{strategy_name}", response_model=StrategyDetailView)
def strategy_detail(strategy_name: str, session: Session = Depends(get_session)) -> StrategyDetailView:
    row = get_strategy(session, strategy_name)
    return StrategyDetailView(
        name=row.name,
        version=row.version,
        template=row.template,
        description=row.description,
        underlying_symbol=row.underlying_symbol,
        tradable_symbol=row.tradable_symbol,
        timeframe=row.timeframe,
        warmup_bars=row.warmup_bars,
        fees_bps=row.fees_bps,
        slippage_bps=row.slippage_bps,
        proxy_grade=row.proxy_grade,
        promoted=row.promoted,
        tags=row.tags_json,
        validation=row.validation_json,
        search_space=row.search_space_json,
        spec=row.spec_json,
    )

