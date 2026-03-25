from __future__ import annotations

from datetime import datetime

import polars as pl

from app.engines.features.atr_volatility import add_atr_volatility
from app.engines.features.breakout_levels import add_breakout_levels
from app.engines.features.cross_asset_correlation import latest_cross_asset_correlation
from app.engines.features.ema_sma_state import add_ema_sma_state
from app.engines.features.event_proximity import add_event_proximity
from app.engines.features.market_structure import add_market_structure
from app.engines.features.relative_volume import add_relative_volume
from app.engines.features.returns import add_returns


def build_feature_frame(
    bars: list[dict[str, object]],
    next_event_time: datetime | None,
) -> tuple[pl.DataFrame, dict[str, float]]:
    frame = pl.DataFrame(bars).sort(["symbol", "timestamp"])
    frame = add_returns(frame)
    frame = add_ema_sma_state(frame)
    frame = add_breakout_levels(frame)
    frame = add_atr_volatility(frame)
    frame = add_relative_volume(frame)
    frame = add_market_structure(frame)
    frame = add_event_proximity(frame, next_event_time)
    frame = frame.with_columns(
        [
            ((pl.col("close") / pl.col("close").shift(14).over("symbol")) - 1).fill_null(0.0).alias("return_14"),
            ((pl.col("close") / pl.col("close").shift(20).over("symbol")) - 1).fill_null(0.0).alias("return_20"),
            ((pl.col("ema_20") / pl.col("ema_20").shift(3).over("symbol")) - 1).fill_null(0.0).alias("ema_slope_3"),
            (((pl.col("close") / pl.col("ema_20")) - 1) * 100).fill_null(0.0).alias("vwap_distance_proxy"),
            (((pl.col("close") - pl.col("breakout_low_20")) / (pl.col("breakout_high_20") - pl.col("breakout_low_20"))).clip(0, 1))
            .fill_null(0.5)
            .alias("range_position"),
            (pl.col("atr_pct").rolling_mean(window_size=30).over("symbol")).fill_null(pl.col("atr_pct")).alias("atr_pct_mean_30"),
            (pl.col("atr_pct").rolling_min(window_size=20).over("symbol")).fill_null(pl.col("atr_pct")).alias("atr_pct_floor_20"),
            (pl.col("atr_pct").rolling_max(window_size=20).over("symbol")).fill_null(pl.col("atr_pct")).alias("atr_pct_ceiling_20"),
            (pl.col("relative_volume").rolling_mean(window_size=10).over("symbol")).fill_null(pl.col("relative_volume")).alias("relative_volume_10"),
        ]
    ).with_columns(
        [
            ((pl.col("return_14") * 2500) + 50).clip(0, 100).alias("rsi_14_proxy"),
            (pl.col("ema_vs_sma50").abs() * 3200).clip(0, 100).alias("adx_proxy"),
            (((pl.col("atr_pct") - pl.col("atr_pct_floor_20")) / (pl.col("atr_pct_ceiling_20") - pl.col("atr_pct_floor_20") + 1e-6)) * 100)
            .clip(0, 100)
            .fill_null(50)
            .alias("realized_vol_percentile"),
            (1 - (pl.col("atr_pct") / (pl.col("atr_pct_mean_30") + 1e-6))).clip(-1, 1).fill_null(0.0).alias("compression_score"),
        ]
    ).with_columns(
        [
            (
                (pl.col("relative_volume") >= 1.1)
                & (pl.col("compression_score") >= 0.15)
                & (pl.col("realized_vol_percentile") <= 55)
            ).alias("squeeze_ready"),
            (
                (pl.col("trend_state") == "uptrend")
                & (pl.col("close_vs_ema20") > -0.01)
                & (pl.col("close_vs_ema20") < 0.012)
            ).alias("pullback_long_ready"),
            (
                (pl.col("trend_state") == "mixed")
                & (pl.col("range_position") <= 0.22)
                & (pl.col("rsi_14_proxy") <= 42)
            ).alias("range_reversion_long_ready"),
            (
                (pl.col("trend_state") == "mixed")
                & (pl.col("range_position") >= 0.78)
                & (pl.col("rsi_14_proxy") >= 58)
            ).alias("range_reversion_short_ready"),
            (
                ((pl.col("breakout_distance") > 0.0012) | (pl.col("breakout_distance") < -0.0012))
                & (pl.col("relative_volume") >= 1.05)
            ).alias("breakout_active"),
        ]
    )
    correlations = latest_cross_asset_correlation(frame)
    return frame, correlations
