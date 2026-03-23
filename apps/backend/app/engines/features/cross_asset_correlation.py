from __future__ import annotations

import polars as pl


def latest_cross_asset_correlation(frame: pl.DataFrame) -> dict[str, float]:
    required = {"timestamp", "symbol", "return_1"}
    if frame.is_empty() or not required.issubset(set(frame.columns)):
        return {"btc_eth_corr": 0.0}

    deduped = (
        frame.select(["timestamp", "symbol", "return_1"])
        .drop_nulls("return_1")
        .sort(["timestamp", "symbol"])
        .group_by(["timestamp", "symbol"], maintain_order=True)
        .agg(pl.col("return_1").last().alias("return_1"))
    )
    if deduped.is_empty():
        return {"btc_eth_corr": 0.0}

    piv = deduped.pivot(values="return_1", index="timestamp", on="symbol")
    metrics: dict[str, float] = {}
    if {"BTC", "ETH"}.issubset(set(piv.columns)):
        corr = piv.select(pl.corr("BTC", "ETH").alias("corr")).item()
        metrics["btc_eth_corr"] = round(float(corr or 0.0), 4)
    else:
        metrics["btc_eth_corr"] = 0.0
    return metrics
