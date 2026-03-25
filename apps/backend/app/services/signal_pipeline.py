from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from app.engines.signals.event_driven import build_event_signal
from app.engines.signals.signal_ranker import rank_signals
from app.engines.signals.trend_following import (
    build_cross_asset_divergence_signal,
    build_pullback_continuation_signal,
    build_range_reversion_signal,
    build_squeeze_expansion_signal,
    build_trend_breakout_signal,
)


def _timestamp_iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value or "")


def _build_signal_id(signal: dict[str, Any]) -> str:
    feature = signal.get("feature_snapshot", {})
    stable_key = "|".join(
        [
            str(signal.get("symbol", "")),
            str(signal.get("signal_type", "")),
            str(signal.get("direction", "")),
            _timestamp_iso(signal.get("timestamp")),
            _timestamp_iso(feature.get("timestamp")),
            str(feature.get("close", "")),
            str(signal.get("data_quality", "")),
        ]
    )
    return f"sig_{uuid5(NAMESPACE_URL, stable_key).hex}"


def generate_signals(
    latest_features: list[dict[str, Any]],
    correlations: dict[str, float],
    next_event: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    corr = correlations.get("btc_eth_corr", 0.0)
    for feature in latest_features:
        for builder in (
            lambda row: build_trend_breakout_signal(row, corr),
            lambda row: build_pullback_continuation_signal(row, corr),
            lambda row: build_squeeze_expansion_signal(row, corr),
            build_range_reversion_signal,
            lambda row: build_cross_asset_divergence_signal(row, corr),
            lambda row: build_event_signal(row, next_event),
        ):
            signal = builder(feature)
            if signal:
                signals.append(signal)
    ranked = rank_signals(signals)
    for signal in ranked:
        signal["signal_id"] = _build_signal_id(signal)
    return ranked
