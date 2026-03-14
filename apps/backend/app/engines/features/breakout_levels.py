from __future__ import annotations

import polars as pl


def add_breakout_levels(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.with_columns(
        [
            pl.col("high").rolling_max(window_size=20).shift(1).over("symbol").alias("breakout_high_20"),
            pl.col("low").rolling_min(window_size=20).shift(1).over("symbol").alias("breakout_low_20"),
        ]
    ).with_columns(
        [
            (pl.col("close") / pl.col("breakout_high_20") - 1).alias("breakout_distance"),
        ]
    )

