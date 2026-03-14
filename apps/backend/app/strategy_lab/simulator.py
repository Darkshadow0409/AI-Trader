from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd


def run_manual_backtest(
    frame: pd.DataFrame,
    fees_bps: float,
    slippage_bps: float,
    order_size_pct: float = 1.0,
) -> dict[str, Any]:
    close_key = "close" if "close" in frame.columns else "Close"
    entry_key = "entry_signal" if "entry_signal" in frame.columns else "Entry"
    exit_key = "exit_signal" if "exit_signal" in frame.columns else "Exit"
    cash = 100000.0
    equity = cash
    position = 0.0
    entry_price = 0.0
    entry_time: datetime | None = None
    equity_curve: list[dict[str, Any]] = []
    trades: list[dict[str, Any]] = []
    fee_rate = (fees_bps + slippage_bps) / 10000

    for row in frame.itertuples():
        close = float(getattr(row, close_key))
        timestamp = pd.Timestamp(getattr(row, "timestamp", row.Index)).to_pydatetime()
        entry_signal = bool(getattr(row, entry_key))
        exit_signal = bool(getattr(row, exit_key))

        if position == 0.0 and entry_signal:
            deployed_cash = equity * order_size_pct
            position = deployed_cash * (1 - fee_rate) / close
            entry_price = close
            entry_time = timestamp
        elif position > 0.0 and exit_signal:
            gross_value = position * close
            realized_value = gross_value * (1 - fee_rate)
            pnl_pct = ((close / entry_price) - 1) * 100 if entry_price else 0.0
            equity = equity * (1 + pnl_pct / 100)
            trades.append(
                {
                    "entry_time": entry_time.isoformat() if entry_time else timestamp.isoformat(),
                    "exit_time": timestamp.isoformat(),
                    "side": "long",
                    "entry_price": round(entry_price, 4),
                    "exit_price": round(close, 4),
                    "pnl_pct": round(pnl_pct - (fees_bps + slippage_bps) / 10, 4),
                }
            )
            cash = realized_value + (equity * (1 - order_size_pct))
            equity = cash
            position = 0.0
            entry_price = 0.0
            entry_time = None

        mark_equity = equity if position == 0.0 else position * close + (equity * (1 - order_size_pct))
        equity_curve.append({"timestamp": timestamp.isoformat(), "equity": round(mark_equity, 2)})

    if not equity_curve:
        equity_curve = [{"timestamp": pd.Timestamp.utcnow().isoformat(), "equity": cash}]

    curve = pd.DataFrame(equity_curve)
    curve["drawdown"] = curve["equity"] / curve["equity"].cummax() - 1
    returns = curve["equity"].pct_change().fillna(0.0)
    sharpe = 0.0
    if returns.std() > 0:
        sharpe = (returns.mean() / returns.std()) * (252**0.5)
    metrics = {
        "net_return_pct": round((curve["equity"].iloc[-1] / curve["equity"].iloc[0] - 1) * 100, 2),
        "max_drawdown_pct": round(curve["drawdown"].min() * 100, 2),
        "trade_count": len(trades),
        "sharpe_ratio": round(float(sharpe), 2),
    }
    return {"metrics": metrics, "equity_curve": equity_curve, "trades": trades}
