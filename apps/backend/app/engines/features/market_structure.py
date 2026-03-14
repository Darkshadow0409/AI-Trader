from __future__ import annotations

import polars as pl


def add_market_structure(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.with_columns(
        [
            (pl.col("high") > pl.col("high").shift(1).over("symbol")).cast(pl.Int8).alias("higher_high"),
            (pl.col("low") > pl.col("low").shift(1).over("symbol")).cast(pl.Int8).alias("higher_low"),
        ]
    ).with_columns(
        [
            (pl.col("higher_high") + pl.col("higher_low")).alias("structure_score"),
        ]
    )

