from __future__ import annotations

import polars as pl


def add_relative_volume(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.with_columns(
        [
            pl.col("volume").rolling_mean(window_size=20).over("symbol").alias("volume_avg_20"),
        ]
    ).with_columns(
        [
            (pl.col("volume") / pl.col("volume_avg_20")).alias("relative_volume"),
        ]
    )

