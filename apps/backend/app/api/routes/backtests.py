from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import BacktestDetailView, BacktestListView, BacktestRunRequest
from app.strategy_lab.service import backtest_detail_view, backtest_list_view, get_backtest, list_backtests, run_backtest


router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.get("", response_model=list[BacktestListView])
def backtests(session: Session = Depends(get_session)) -> list[BacktestListView]:
    rows = list_backtests(session)
    return [backtest_list_view(session, row) for row in rows]


@router.get("/{run_id}", response_model=BacktestDetailView)
def backtest_detail(run_id: int, session: Session = Depends(get_session)) -> BacktestDetailView:
    row = get_backtest(session, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Backtest run not found.")
    return backtest_detail_view(session, row)


@router.post("/run", response_model=BacktestDetailView)
def create_backtest(request: BacktestRunRequest, session: Session = Depends(get_session)) -> BacktestDetailView:
    row = run_backtest(session, request)
    return backtest_detail_view(session, row)
