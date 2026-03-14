from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def build_trend_breakout_signal(feature: dict[str, Any], correlation: float) -> dict[str, Any] | None:
    breakout_distance = float(feature.get("breakout_distance") or 0.0)
    ema_vs_sma = float(feature.get("ema_vs_sma50") or 0.0)
    rel_volume = float(feature.get("relative_volume") or 0.0)
    atr_pct = float(feature.get("atr_pct") or 0.0)
    return_5 = float(feature.get("return_5") or 0.0)
    score = (
        min(max(breakout_distance * 600, 0.0), 40.0)
        + min(max(ema_vs_sma * 400, 0.0), 20.0)
        + min(rel_volume * 12.0, 20.0)
        + min(max(return_5 * 250, 0.0), 15.0)
        + min(max((0.08 - atr_pct) * 250, 0.0), 5.0)
    )
    if score < 40 or feature.get("trend_state") != "uptrend":
        return None
    uncertainty = max(0.12, 0.34 - min(score / 200, 0.18) + abs(correlation) * 0.05)
    return {
        "symbol": feature["symbol"],
        "signal_type": "trend_breakout",
        "direction": "long",
        "score": round(score, 2),
        "thesis": "Breakout above the 20-day range with aligned trend structure and supportive relative volume.",
        "timestamp": datetime.now(timezone.utc),
        "uncertainty": round(min(0.7, uncertainty), 3),
        "data_quality": str(feature.get("data_quality") or "fixture"),
        "feature_snapshot": feature,
    }
