from __future__ import annotations

from typing import Any

import pandas as pd

from app.strategy_lab.simulator import run_manual_backtest


def run_backtesting_validation(
    frame: pd.DataFrame,
    fees_bps: float,
    slippage_bps: float,
    order_size_pct: float = 1.0,
) -> dict[str, Any]:
    open_key = "open" if "open" in frame.columns else "Open"
    high_key = "high" if "high" in frame.columns else "High"
    low_key = "low" if "low" in frame.columns else "Low"
    close_key = "close" if "close" in frame.columns else "Close"
    volume_key = "volume" if "volume" in frame.columns else "Volume"
    entry_key = "entry_signal" if "entry_signal" in frame.columns else "Entry"
    exit_key = "exit_signal" if "exit_signal" in frame.columns else "Exit"
    try:
        from backtesting import Backtest, Strategy  # type: ignore

        data = frame[[open_key, high_key, low_key, close_key, volume_key]].rename(
            columns={open_key: "Open", high_key: "High", low_key: "Low", close_key: "Close", volume_key: "Volume"}
        )
        if "timestamp" in frame.columns:
            data.index = pd.DatetimeIndex(frame["timestamp"])
        elif frame.index.name is not None:
            data.index = pd.DatetimeIndex(frame.index)
        entry_signal = frame[entry_key].astype(bool).tolist()
        exit_signal = frame[exit_key].astype(bool).tolist()

        class SignalStrategy(Strategy):
            def init(self) -> None:
                self.entry_signal = self.I(lambda: entry_signal)
                self.exit_signal = self.I(lambda: exit_signal)

            def next(self) -> None:
                if not self.position and bool(self.entry_signal[-1]):
                    self.buy(size=order_size_pct)
                elif self.position and bool(self.exit_signal[-1]):
                    self.position.close()

        backtest = Backtest(
            data,
            SignalStrategy,
            cash=100000.0,
            commission=(fees_bps + slippage_bps) / 10000,
            trade_on_close=True,
            exclusive_orders=True,
        )
        stats = backtest.run()
        equity_curve = [
            {"timestamp": index.isoformat(), "equity": round(float(value), 2)}
            for index, value in stats["_equity_curve"]["Equity"].items()
        ]
        trades = []
        for _, trade in stats["_trades"].iterrows():
            entry_price = float(trade["EntryPrice"])
            exit_price = float(trade["ExitPrice"])
            pnl_pct = ((exit_price / entry_price) - 1) * 100 if entry_price else 0.0
            trades.append(
                {
                    "entry_time": pd.Timestamp(trade["EntryTime"]).isoformat(),
                    "exit_time": pd.Timestamp(trade["ExitTime"]).isoformat(),
                    "side": "long",
                    "entry_price": round(entry_price, 4),
                    "exit_price": round(exit_price, 4),
                    "pnl_pct": round(pnl_pct, 4),
                }
            )
        metrics = {
            "net_return_pct": round(float(stats["Return [%]"]), 2),
            "max_drawdown_pct": round(float(stats["Max. Drawdown [%]"]), 2),
            "trade_count": int(stats["# Trades"]),
            "sharpe_ratio": round(float(stats["Sharpe Ratio"] or 0.0), 2),
        }
        return {"engine": "backtesting.py", "metrics": metrics, "equity_curve": equity_curve, "trades": trades}
    except Exception:
        manual = run_manual_backtest(frame, fees_bps=fees_bps, slippage_bps=slippage_bps, order_size_pct=order_size_pct)
        return {"engine": "backtesting.py-fallback", **manual}
