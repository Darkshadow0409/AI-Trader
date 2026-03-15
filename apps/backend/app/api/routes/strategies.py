from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import StrategyDetailView, StrategyLifecycleUpdateRequest, StrategyListView
from app.strategy_lab.service import get_strategy, list_strategies, strategy_detail_view, strategy_list_view, transition_strategy_lifecycle


router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("", response_model=list[StrategyListView])
def strategies(session: Session = Depends(get_session)) -> list[StrategyListView]:
    rows = list_strategies(session)
    return [strategy_list_view(session, row) for row in rows]


@router.get("/{strategy_name}", response_model=StrategyDetailView)
def strategy_detail(strategy_name: str, session: Session = Depends(get_session)) -> StrategyDetailView:
    row = get_strategy(session, strategy_name)
    return strategy_detail_view(session, row)


@router.post("/{strategy_name}/lifecycle", response_model=StrategyDetailView)
def update_strategy_lifecycle(
    strategy_name: str,
    request: StrategyLifecycleUpdateRequest,
    session: Session = Depends(get_session),
) -> StrategyDetailView:
    row = transition_strategy_lifecycle(session, strategy_name, request)
    return strategy_detail_view(session, row)
