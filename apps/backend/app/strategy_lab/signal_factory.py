from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

from app.strategy_lab.spec_dsl import StrategySpec


def prepare_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(rows).copy()
    frame["timestamp"] = pd.to_datetime(frame["timestamp"])
    frame = frame.sort_values("timestamp").set_index("timestamp")
    return frame[["open", "high", "low", "close", "volume"]].rename(
        columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"}
    )


def _apply_common_indicators(frame: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
    frame = frame.copy()
    ema_fast = int(params.get("ema_fast", 20))
    sma_slow = int(params.get("sma_slow", 50))
    atr_window = int(params.get("atr_window", 14))
    rv_window = int(params.get("rv_window", 20))
    frame["ema_fast"] = frame["Close"].ewm(span=ema_fast, adjust=False).mean()
    frame["sma_slow"] = frame["Close"].rolling(sma_slow).mean()
    frame["rv"] = frame["Volume"] / frame["Volume"].rolling(rv_window).mean()
    prev_close = frame["Close"].shift(1)
    tr_components = pd.concat(
        [
            (frame["High"] - frame["Low"]).abs(),
            (frame["High"] - prev_close).abs(),
            (frame["Low"] - prev_close).abs(),
        ],
        axis=1,
    )
    frame["atr"] = tr_components.max(axis=1).rolling(atr_window).mean()
    frame["atr_pct"] = frame["atr"] / frame["Close"]
    atr_median = frame["atr_pct"].rolling(30).median().bfill()
    frame["regime"] = np.where(
        frame["Close"] > frame["sma_slow"],
        "trend",
        np.where(frame["atr_pct"] > atr_median, "high_vol", "range"),
    )
    return frame


def _event_mask(index: pd.DatetimeIndex, event_times: list[datetime], lookback_days: int) -> pd.Series:
    event_dates = [pd.Timestamp(event_time).normalize() for event_time in event_times]
    if not event_dates:
        return pd.Series(False, index=index)
    mask = pd.Series(False, index=index)
    for event_date in event_dates:
        delta_days = (index.normalize() - event_date).days
        mask = mask | ((delta_days >= 0) & (delta_days <= lookback_days))
    return mask


def build_signal_frame(
    base_frame: pd.DataFrame,
    spec: StrategySpec,
    params: dict[str, Any],
    event_times: list[datetime],
    activation_index: int,
    end_index: int | None = None,
) -> pd.DataFrame:
    frame = _apply_common_indicators(base_frame, params)
    breakout_window = int(params.get("breakout_window", 20))
    rv_threshold = float(params.get("rv_threshold", params.get("volume_threshold", 1.1)))
    atr_threshold = float(params.get("atr_threshold", 0.025))
    hold_bars = int(params.get("hold_bars", 5))
    event_lookback = int(params.get("event_lookback_days", 2))

    frame["breakout_high"] = frame["High"].rolling(breakout_window).max().shift(1)
    frame["breakout_low"] = frame["Low"].rolling(breakout_window).min().shift(1)

    if spec.template == "trend_breakout":
        raw_entry = (frame["Close"] > frame["breakout_high"]) & (frame["ema_fast"] > frame["sma_slow"]) & (frame["rv"] >= rv_threshold)
        raw_exit = (frame["Close"] < frame["ema_fast"]) | (frame["Close"] < frame["breakout_low"])
    elif spec.template == "vol_expansion":
        raw_entry = (frame["atr_pct"] >= atr_threshold) & (frame["Close"] > frame["ema_fast"]) & (frame["rv"] >= rv_threshold)
        raw_exit = (frame["atr_pct"] < atr_threshold * 0.8) | (frame["Close"] < frame["ema_fast"])
    else:
        recent_event = _event_mask(frame.index, event_times, event_lookback)
        raw_entry = recent_event & (frame["Close"] > frame["ema_fast"]) & (frame["rv"] >= rv_threshold)
        raw_exit = raw_entry.shift(hold_bars).fillna(False) | (frame["Close"] < frame["ema_fast"])

    frame["Entry"] = raw_entry.shift(1).fillna(False)
    frame["Exit"] = raw_exit.shift(1).fillna(False)
    frame.iloc[:activation_index, frame.columns.get_loc("Entry")] = False
    frame.iloc[:activation_index, frame.columns.get_loc("Exit")] = False
    if end_index is not None and end_index < len(frame):
        frame.iloc[end_index:, frame.columns.get_loc("Entry")] = False
        frame.iloc[end_index:, frame.columns.get_loc("Exit")] = False
    frame["Entry"] = frame["Entry"].fillna(False)
    frame["Exit"] = frame["Exit"].fillna(False)
    return frame.copy()
