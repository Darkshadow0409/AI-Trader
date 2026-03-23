from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import isfinite

import polars as pl

from app.services.feature_pipeline import build_feature_frame
from app.services.sample_data import generate_sample_ohlcv


SEEDED_SYMBOLS = ("BTC", "ETH", "WTI", "GOLD", "SILVER", "DXY", "US10Y")
CORE_COLUMNS = {
    "return_1",
    "return_5",
    "ema_20",
    "sma_50",
    "breakout_high_20",
    "breakout_low_20",
    "breakout_distance",
    "atr_14",
    "atr_pct",
    "volume_avg_20",
    "relative_volume",
    "higher_high",
    "higher_low",
    "structure_score",
    "hours_to_event",
    "trend_state",
}


def test_feature_pipeline_creates_core_columns_and_limits_warmup_nans() -> None:
    bars: list[dict[str, object]] = []
    for symbol in SEEDED_SYMBOLS:
        bars.extend(generate_sample_ohlcv(symbol))

    frame, correlations = build_feature_frame(
        bars,
        datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=12),
    )

    assert CORE_COLUMNS.issubset(set(frame.columns))
    assert set(frame["symbol"].unique().to_list()) == set(SEEDED_SYMBOLS)
    assert "btc_eth_corr" in correlations
    assert -1.0 <= correlations["btc_eth_corr"] <= 1.0

    mature = frame.sort(["symbol", "timestamp"]).group_by("symbol", maintain_order=True).tail(100)
    for column in CORE_COLUMNS - {"trend_state"}:
        values = mature.get_column(column).drop_nulls().to_list()
        assert len(values) == mature.height
        assert all(isfinite(float(value)) for value in values)
    assert mature.get_column("trend_state").null_count() == 0


def test_feature_pipeline_latest_rows_cover_seeded_assets() -> None:
    bars: list[dict[str, object]] = []
    for symbol in SEEDED_SYMBOLS:
        bars.extend(generate_sample_ohlcv(symbol))

    frame, _ = build_feature_frame(bars, datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=6))
    latest = frame.sort(["symbol", "timestamp"]).group_by("symbol", maintain_order=True).tail(1)

    assert latest.height == len(SEEDED_SYMBOLS)
    assert set(latest["symbol"].to_list()) == set(SEEDED_SYMBOLS)
    assert latest.select(pl.col("hours_to_event").is_not_null().all()).item() is True


def test_feature_pipeline_handles_duplicate_symbol_timestamps_without_crashing() -> None:
    bars: list[dict[str, object]] = []
    for symbol in ("BTC", "ETH"):
        generated = generate_sample_ohlcv(symbol)
        bars.extend(generated)
        duplicate = dict(generated[-1])
        duplicate["return_1"] = duplicate.get("return_1", 0.0)
        bars.append(duplicate)

    frame, correlations = build_feature_frame(
        bars,
        datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=4),
    )

    assert frame.height >= len(bars)
    assert "btc_eth_corr" in correlations
    assert -1.0 <= correlations["btc_eth_corr"] <= 1.0
