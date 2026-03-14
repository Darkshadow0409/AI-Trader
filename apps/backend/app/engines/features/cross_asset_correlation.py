from __future__ import annotations

import polars as pl


def latest_cross_asset_correlation(frame: pl.DataFrame) -> dict[str, float]:
    piv = frame.select(["timestamp", "symbol", "return_1"]).pivot(
        values="return_1", index="timestamp", on="symbol"
    )
    metrics: dict[str, float] = {}
    if {"BTC", "ETH"}.issubset(set(piv.columns)):
        corr = piv.select(pl.corr("BTC", "ETH").alias("corr")).item()
        metrics["btc_eth_corr"] = round(float(corr or 0.0), 4)
    else:
        metrics["btc_eth_corr"] = 0.0
    return metrics

