from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import BacktestDetailView, BacktestListView, BacktestRunRequest
from app.strategy_lab.service import get_backtest, list_backtests, run_backtest


router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.get("", response_model=list[BacktestListView])
def backtests(session: Session = Depends(get_session)) -> list[BacktestListView]:
    rows = list_backtests(session)
    return [
        BacktestListView(
            id=row.id or 0,
            strategy_name=row.strategy_name,
            engine=row.engine,
            status=row.status,
            symbol=row.symbol,
            timeframe=row.timeframe,
            created_at=row.created_at,
            proxy_grade=row.proxy_grade,
            promoted_candidate=row.promoted_candidate,
            search_method=row.search_method,
            robustness_score=row.robustness_score,
            net_return_pct=row.net_return_pct,
            sharpe_ratio=row.sharpe_ratio,
            max_drawdown_pct=row.max_drawdown_pct,
            trade_count=row.trade_count,
        )
        for row in rows
    ]


@router.get("/{run_id}", response_model=BacktestDetailView)
def backtest_detail(run_id: int, session: Session = Depends(get_session)) -> BacktestDetailView:
    row = get_backtest(session, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Backtest run not found.")
    return BacktestDetailView(
        id=row.id or 0,
        strategy_name=row.strategy_name,
        engine=row.engine,
        status=row.status,
        symbol=row.symbol,
        timeframe=row.timeframe,
        created_at=row.created_at,
        completed_at=row.completed_at,
        proxy_grade=row.proxy_grade,
        promoted_candidate=row.promoted_candidate,
        search_method=row.search_method,
        robustness_score=row.robustness_score,
        net_return_pct=row.net_return_pct,
        sharpe_ratio=row.sharpe_ratio,
        max_drawdown_pct=row.max_drawdown_pct,
        trade_count=row.trade_count,
        fees_bps=row.fees_bps,
        slippage_bps=row.slippage_bps,
        warmup_bars=row.warmup_bars,
        validation=row.validation_json,
        summary=row.summary_json,
        equity_curve=row.equity_curve_json,
        trades=row.trades_json,
        stability_heatmap=row.stability_heatmap_json,
        regime_summary=row.regime_summary_json,
        metadata=row.metadata_json,
    )


@router.post("/run", response_model=BacktestDetailView)
def create_backtest(request: BacktestRunRequest, session: Session = Depends(get_session)) -> BacktestDetailView:
    row = run_backtest(session, request)
    return BacktestDetailView(
        id=row.id or 0,
        strategy_name=row.strategy_name,
        engine=row.engine,
        status=row.status,
        symbol=row.symbol,
        timeframe=row.timeframe,
        created_at=row.created_at,
        completed_at=row.completed_at,
        proxy_grade=row.proxy_grade,
        promoted_candidate=row.promoted_candidate,
        search_method=row.search_method,
        robustness_score=row.robustness_score,
        net_return_pct=row.net_return_pct,
        sharpe_ratio=row.sharpe_ratio,
        max_drawdown_pct=row.max_drawdown_pct,
        trade_count=row.trade_count,
        fees_bps=row.fees_bps,
        slippage_bps=row.slippage_bps,
        warmup_bars=row.warmup_bars,
        validation=row.validation_json,
        summary=row.summary_json,
        equity_curve=row.equity_curve_json,
        trades=row.trades_json,
        stability_heatmap=row.stability_heatmap_json,
        regime_summary=row.regime_summary_json,
        metadata=row.metadata_json,
    )
