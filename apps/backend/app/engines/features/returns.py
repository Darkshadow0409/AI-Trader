from __future__ import annotations

import polars as pl


def add_returns(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.with_columns(
        [
            pl.col("close").pct_change().over("symbol").alias("return_1"),
            pl.col("close").pct_change(5).over("symbol").alias("return_5"),
        ]
    )

