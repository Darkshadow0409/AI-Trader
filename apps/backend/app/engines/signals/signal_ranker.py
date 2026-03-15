from __future__ import annotations

from datetime import datetime
from typing import SupportsFloat, cast

from app.services.data_reality import build_data_reality, default_provenance


def _as_of(item: dict[str, object]) -> datetime | None:
    value = item.get("timestamp")
    return value if isinstance(value, datetime) else None


def rank_signals(signals: list[dict[str, object]]) -> list[dict[str, object]]:
    def rank_key(item: dict[str, object]) -> float:
        score = float(cast(SupportsFloat, item["score"]))
        uncertainty = float(cast(SupportsFloat, item["uncertainty"]))
        raw_quality = item["data_quality"]
        quality = 0.95 if raw_quality == "live" else 0.82 if raw_quality == "hybrid" else 0.72
        symbol = str(item.get("symbol", "BTC"))
        source_mode = "live" if raw_quality == "live" else "sample"
        reality = build_data_reality(
            default_provenance(symbol, source_mode=source_mode),
            as_of=_as_of(item),
            data_quality=str(raw_quality),
            source_mode=source_mode,
            features=cast(dict[str, object], item.get("feature_snapshot") or {}),
        )
        return score * quality - uncertainty * 25 - reality.ranking_penalty

    return sorted(signals, key=rank_key, reverse=True)
