from __future__ import annotations

import polars as pl


def add_atr_volatility(frame: pl.DataFrame) -> pl.DataFrame:
    previous_close = pl.col("close").shift(1).over("symbol")
    true_range = pl.max_horizontal(
        pl.col("high") - pl.col("low"),
        (pl.col("high") - previous_close).abs(),
        (pl.col("low") - previous_close).abs(),
    )
    return frame.with_columns(true_range.alias("true_range")).with_columns(
        [
            pl.col("true_range").rolling_mean(window_size=14).over("symbol").alias("atr_14"),
        ]
    ).with_columns(
        [
            (pl.col("atr_14") / pl.col("close")).alias("atr_pct"),
        ]
    )

