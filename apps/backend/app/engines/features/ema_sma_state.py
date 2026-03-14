from __future__ import annotations

import polars as pl


def add_ema_sma_state(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.with_columns(
        [
            pl.col("close").ewm_mean(span=20).over("symbol").alias("ema_20"),
            pl.col("close").rolling_mean(window_size=50).over("symbol").alias("sma_50"),
        ]
    ).with_columns(
        [
            (pl.col("close") / pl.col("ema_20") - 1).alias("close_vs_ema20"),
            (pl.col("ema_20") / pl.col("sma_50") - 1).alias("ema_vs_sma50"),
            pl.when((pl.col("close") > pl.col("ema_20")) & (pl.col("ema_20") > pl.col("sma_50")))
            .then(pl.lit("uptrend"))
            .otherwise(pl.lit("mixed"))
            .alias("trend_state"),
        ]
    )

