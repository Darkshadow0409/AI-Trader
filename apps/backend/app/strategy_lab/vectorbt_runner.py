from __future__ import annotations

from math import isnan
from typing import Any

import pandas as pd

from app.strategy_lab.simulator import run_manual_backtest


def run_vectorbt_research(
    frame: pd.DataFrame,
    fees_bps: float,
    slippage_bps: float,
    order_size_pct: float = 1.0,
) -> dict[str, Any]:
    close_key = "close" if "close" in frame.columns else "Close"
    entry_key = "entry_signal" if "entry_signal" in frame.columns else "Entry"
    exit_key = "exit_signal" if "exit_signal" in frame.columns else "Exit"
    try:
        import vectorbt as vbt  # type: ignore

        portfolio = vbt.Portfolio.from_signals(
            frame[close_key],
            entries=frame[entry_key],
            exits=frame[exit_key],
            fees=fees_bps / 10000,
            slippage=slippage_bps / 10000,
            init_cash=100000.0,
            freq="1D",
        )
        value = portfolio.value()
        equity_curve = [
            {"timestamp": pd.Timestamp(index).isoformat(), "equity": round(float(amount), 2)}
            for index, amount in value.items()
        ]
        trades_df = portfolio.trades.records_readable
        trades: list[dict[str, Any]] = []
        for trade in trades_df.to_dict("records"):
            entry_price = float(trade.get("Avg Entry Price", 0.0) or 0.0)
            exit_price = float(trade.get("Avg Exit Price", 0.0) or 0.0)
            pnl_pct = ((exit_price / entry_price) - 1) * 100 if entry_price else 0.0
            trades.append(
                {
                    "entry_time": pd.Timestamp(trade.get("Entry Timestamp")).isoformat(),
                    "exit_time": pd.Timestamp(trade.get("Exit Timestamp")).isoformat(),
                    "side": "long",
                    "entry_price": round(entry_price, 4),
                    "exit_price": round(exit_price, 4),
                    "pnl_pct": round(pnl_pct, 4),
                }
            )
        sharpe = float(portfolio.sharpe_ratio())
        if isnan(sharpe):
            sharpe = 0.0
        metrics = {
            "net_return_pct": round(float(portfolio.total_return()) * 100, 2),
            "max_drawdown_pct": round(float(portfolio.max_drawdown()) * 100, 2),
            "trade_count": int(portfolio.trades.count()),
            "sharpe_ratio": round(sharpe, 2),
        }
        return {"engine": "vectorbt", "metrics": metrics, "equity_curve": equity_curve, "trades": trades}
    except Exception:
        manual = run_manual_backtest(frame, fees_bps=fees_bps, slippage_bps=slippage_bps, order_size_pct=order_size_pct)
        return {"engine": "vectorbt-fallback", **manual}
