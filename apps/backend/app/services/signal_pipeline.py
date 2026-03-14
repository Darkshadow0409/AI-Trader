from __future__ import annotations

from typing import Any

from app.engines.signals.event_driven import build_event_signal
from app.engines.signals.signal_ranker import rank_signals
from app.engines.signals.trend_following import build_trend_breakout_signal


def generate_signals(
    latest_features: list[dict[str, Any]],
    correlations: dict[str, float],
    next_event: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    corr = correlations.get("btc_eth_corr", 0.0)
    for feature in latest_features:
        trend_signal = build_trend_breakout_signal(feature, corr)
        if trend_signal:
            signals.append(trend_signal)
        event_signal = build_event_signal(feature, next_event)
        if event_signal:
            signals.append(event_signal)
    return rank_signals(signals)

