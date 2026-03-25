from __future__ import annotations

from datetime import UTC, timedelta
from math import cos, sin
from random import Random

from app.core.clock import naive_utc_now


ASSET_SEEDS: dict[str, tuple[float, float]] = {
    "BTC": (68000.0, 2400.0),
    "ETH": (3550.0, 150.0),
    "WTI": (78.0, 2.8),
    "GOLD": (2150.0, 30.0),
    "SILVER": (25.4, 0.9),
    "DXY": (103.0, 0.7),
    "US10Y": (4.18, 0.08),
}

ASSET_FIXTURE_PROFILES: dict[str, dict[str, float]] = {
    "BTC": {
        "drift": 0.00135,
        "seasonal_period": 8.5,
        "seasonal_scale": 0.022,
        "shock_scale": 0.058,
        "volume_base": 25000,
        "volume_period": 12.0,
        "volume_scale": 0.16,
    },
    "ETH": {
        "drift": 0.0009,
        "seasonal_period": 6.5,
        "seasonal_scale": 0.03,
        "shock_scale": 0.072,
        "volume_base": 148000,
        "volume_period": 9.0,
        "volume_scale": 0.21,
    },
    "WTI": {
        "drift": 0.00055,
        "seasonal_period": 10.0,
        "seasonal_scale": 0.026,
        "shock_scale": 0.048,
        "volume_base": 32000,
        "volume_period": 7.5,
        "volume_scale": 0.18,
    },
    "GOLD": {
        "drift": 0.00045,
        "seasonal_period": 12.0,
        "seasonal_scale": 0.018,
        "shock_scale": 0.03,
        "volume_base": 21000,
        "volume_period": 8.0,
        "volume_scale": 0.14,
    },
    "SILVER": {
        "drift": 0.0006,
        "seasonal_period": 8.5,
        "seasonal_scale": 0.022,
        "shock_scale": 0.044,
        "volume_base": 18000,
        "volume_period": 7.0,
        "volume_scale": 0.17,
    },
}

TIMEFRAME_STEPS: dict[str, tuple[timedelta, int]] = {
    "15m": (timedelta(minutes=15), 320),
    "1h": (timedelta(hours=1), 240),
    "4h": (timedelta(hours=4), 220),
    "1d": (timedelta(days=1), 220),
}


def _timeframe_params(timeframe: str, bars: int) -> tuple[timedelta, int]:
    step, default_bars = TIMEFRAME_STEPS.get(timeframe, TIMEFRAME_STEPS["1d"])
    return step, bars if bars > 0 else default_bars


def _timeframe_profile_scale(timeframe: str) -> dict[str, float]:
    if timeframe == "15m":
        return {"drift": 0.24, "seasonal": 0.72, "shock": 0.78, "volume": 0.62, "uncertainty": 0.26}
    if timeframe == "1h":
        return {"drift": 0.34, "seasonal": 0.82, "shock": 0.72, "volume": 0.72, "uncertainty": 0.25}
    if timeframe == "4h":
        return {"drift": 0.58, "seasonal": 0.92, "shock": 0.68, "volume": 0.84, "uncertainty": 0.24}
    return {"drift": 1.0, "seasonal": 1.0, "shock": 1.0, "volume": 1.0, "uncertainty": 0.28}


def generate_sample_ohlcv(symbol: str, bars: int = 0, timeframe: str = "1d") -> list[dict[str, object]]:
    base_price, amplitude = ASSET_SEEDS[symbol]
    timeframe = timeframe.lower()
    step, resolved_bars = _timeframe_params(timeframe, bars)
    scales = _timeframe_profile_scale(timeframe)
    profile = ASSET_FIXTURE_PROFILES.get(
        symbol,
        {
            "drift": 0.0003,
            "seasonal_period": 9.0,
            "seasonal_scale": 0.02,
            "shock_scale": 0.06,
            "volume_base": 7000,
            "volume_period": 13.0,
            "volume_scale": 0.15,
        },
    )
    rng = Random(f"{symbol}:{timeframe}")
    now = naive_utc_now().replace(tzinfo=None)
    start = now - (step * resolved_bars)
    close = base_price
    rows: list[dict[str, object]] = []
    for index in range(resolved_bars):
        ts = start + (step * index)
        intraday_bias = 1 + (cos(index / max(profile["seasonal_period"], 1.0)) * amplitude * 0.00012)
        drift = 1 + profile["drift"] * scales["drift"]
        seasonal = sin(index / profile["seasonal_period"]) * amplitude * profile["seasonal_scale"] * scales["seasonal"]
        shock = rng.uniform(-amplitude * profile["shock_scale"], amplitude * profile["shock_scale"]) * scales["shock"]
        close = max(0.1, close * drift + seasonal + shock)
        close *= intraday_bias
        spread = max(amplitude * 0.015 * scales["seasonal"], close * (0.008 if timeframe == "1d" else 0.0038))
        open_price = max(0.1, close - rng.uniform(-spread, spread))
        high = max(open_price, close) + rng.uniform(spread * 0.2, spread)
        low = min(open_price, close) - rng.uniform(spread * 0.2, spread)
        volume = max(
            1.0,
            profile["volume_base"]
            * scales["volume"]
            * (1 + sin(index / profile["volume_period"]) * profile["volume_scale"] + rng.uniform(-0.08, 0.12)),
        )
        rows.append(
            {
                "symbol": symbol,
                "timeframe": timeframe,
                "timestamp": ts,
                "open": round(open_price, 4),
                "high": round(high, 4),
                "low": round(low, 4),
                "close": round(close, 4),
                "volume": round(volume, 4),
                "source": "sample",
                "data_quality": "fixture",
                "uncertainty": scales["uncertainty"],
            }
        )
    return rows


def seed_watchlist() -> list[dict[str, object]]:
    now = naive_utc_now()
    return [
        {
            "symbol": "WTI",
            "label": "Oil / USOUSD",
            "thesis": "Primary energy board for inflation spillover, inventory, and geopolitics.",
            "priority": 1,
            "status": "active",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
        {
            "symbol": "GOLD",
            "label": "Gold / XAUUSD",
            "thesis": "Hard-asset macro hedge for dollar, yields, and policy repricing.",
            "priority": 2,
            "status": "active",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
        {
            "symbol": "SILVER",
            "label": "Silver / XAGUSD",
            "thesis": "Precious-metals beta with industrial-demand sensitivity.",
            "priority": 3,
            "status": "active",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
        {
            "symbol": "BTC",
            "label": "Bitcoin",
            "thesis": "Secondary crypto beta context after the commodity board is checked.",
            "priority": 4,
            "status": "active",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
        {
            "symbol": "ETH",
            "label": "Ethereum",
            "thesis": "Secondary crypto relative-strength check after commodities and macro catalysts.",
            "priority": 5,
            "status": "active",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
    ]
