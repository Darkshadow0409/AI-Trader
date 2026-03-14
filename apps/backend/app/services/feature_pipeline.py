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
    correlations = latest_cross_asset_correlation(frame)
    return frame, correlations

