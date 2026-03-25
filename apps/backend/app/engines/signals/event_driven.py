from __future__ import annotations

from typing import Any


def build_event_signal(feature: dict[str, Any], next_event: dict[str, Any] | None) -> dict[str, Any] | None:
    if not next_event:
        return None
    hours_to_event = feature.get("hours_to_event")
    if hours_to_event is None:
        return None
    hours_to_event = float(hours_to_event)
    if hours_to_event > 72 or hours_to_event < -12:
        return None
    impact_weight = {"high": 28.0, "medium": 18.0, "low": 10.0}.get(next_event["impact"], 10.0)
    rel_volume = float(feature.get("relative_volume") or 0.0)
    breakout_distance = float(feature.get("breakout_distance") or 0.0)
    score = max(24.0, impact_weight - max(hours_to_event, 0.0) * 0.12 + min(rel_volume * 4, 10.0) + min(abs(breakout_distance) * 4000, 8.0))
    direction = "neutral" if next_event["impact"] == "high" else "long" if breakout_distance >= 0 else "short"
    close = float(feature.get("close") or 0.0)
    atr = max(float(feature.get("atr_14") or 0.0), close * 0.006)
    stop_price = round(close - atr * 1.1, 4) if direction != "short" else round(close + atr * 1.1, 4)
    target_base = round(close + atr * 1.25, 4) if direction != "short" else round(close - atr * 1.25, 4)
    target_stretch = round(close + atr * 2.0, 4) if direction != "short" else round(close - atr * 2.0, 4)
    thesis = (
        f"{next_event['title']} is within {hours_to_event:.1f}h. Reduce conviction and treat "
        "breakouts as event-sensitive until the release clears."
    )
    return {
        "symbol": feature["symbol"],
        "signal_type": "event_driven",
        "direction": direction,
        "score": round(score, 2),
        "thesis": thesis,
        "timestamp": feature.get("timestamp"),
        "uncertainty": 0.42 if next_event["impact"] == "high" else 0.33,
        "data_quality": str(feature.get("data_quality") or "fixture"),
        "feature_snapshot": {
            **feature,
            "setup_family": "macro_event_reaction",
            "setup_status": "candidate" if next_event["impact"] == "high" else "actionable",
            "entry_zone": {
                "low": round(close - atr * 0.55, 4),
                "high": round(close + atr * 0.55, 4),
            },
            "stop_price": stop_price,
            "target_base": target_base,
            "target_stretch": target_stretch,
            "holding_window": "15m to 8h",
            "expected_r_multiple": round(abs((target_base - close) / max(abs(close - stop_price), 1e-6)), 2),
            "why_now": [
                f"{next_event['title']} is within {hours_to_event:.1f}h.",
                f"Volume is {rel_volume:.2f}x and breakout impulse is {breakout_distance * 100:.2f}%.",
            ],
            "why_not_now": [
                "High-impact releases can invalidate setups quickly.",
                "Wait for post-news stabilization before treating the setup as executable.",
            ],
            "regime": "macro_event_reaction",
            "trigger_timeframe": "1m / 5m stabilization",
            "freshness_state": str(feature.get("freshness_state") or "unknown"),
            "entry_reference": close,
        },
    }
