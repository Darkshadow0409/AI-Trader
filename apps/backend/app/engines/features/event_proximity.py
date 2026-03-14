from __future__ import annotations

from datetime import datetime

import polars as pl


def add_event_proximity(frame: pl.DataFrame, next_event_time: datetime | None) -> pl.DataFrame:
    if not next_event_time:
        return frame.with_columns(pl.lit(None).alias("hours_to_event"))
    return frame.with_columns(
        (
            (pl.lit(next_event_time) - pl.col("timestamp"))
            .dt.total_seconds()
            .truediv(3600)
            .alias("hours_to_event")
        )
    )

