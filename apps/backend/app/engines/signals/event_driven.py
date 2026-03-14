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
    score = max(22.0, impact_weight - max(hours_to_event, 0.0) * 0.12)
    direction = "neutral" if next_event["impact"] == "high" else "long"
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
        "feature_snapshot": feature,
    }
