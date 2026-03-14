from __future__ import annotations

from typing import SupportsFloat, cast


def rank_signals(signals: list[dict[str, object]]) -> list[dict[str, object]]:
    def rank_key(item: dict[str, object]) -> float:
        score = float(cast(SupportsFloat, item["score"]))
        uncertainty = float(cast(SupportsFloat, item["uncertainty"]))
        raw_quality = item["data_quality"]
        quality = 0.95 if raw_quality == "live" else 0.82 if raw_quality == "hybrid" else 0.72
        return score * quality - uncertainty * 25

    return sorted(signals, key=rank_key, reverse=True)
