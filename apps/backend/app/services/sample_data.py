from __future__ import annotations

from datetime import UTC, timedelta
from math import sin
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
}


def generate_sample_ohlcv(symbol: str, bars: int = 180) -> list[dict[str, object]]:
    base_price, amplitude = ASSET_SEEDS[symbol]
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
    rng = Random(symbol)
    start = naive_utc_now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=bars)
    close = base_price
    rows: list[dict[str, object]] = []
    for index in range(bars):
        ts = start + timedelta(days=index)
        drift = 1 + profile["drift"]
        seasonal = sin(index / profile["seasonal_period"]) * amplitude * profile["seasonal_scale"]
        shock = rng.uniform(-amplitude * profile["shock_scale"], amplitude * profile["shock_scale"])
        close = max(0.1, close * drift + seasonal + shock)
        spread = max(amplitude * 0.015, close * 0.008)
        open_price = max(0.1, close - rng.uniform(-spread, spread))
        high = max(open_price, close) + rng.uniform(spread * 0.2, spread)
        low = min(open_price, close) - rng.uniform(spread * 0.2, spread)
        volume = max(
            1.0,
            profile["volume_base"] * (1 + sin(index / profile["volume_period"]) * profile["volume_scale"] + rng.uniform(-0.08, 0.12)),
        )
        rows.append(
            {
                "symbol": symbol,
                "timeframe": "1d",
                "timestamp": ts,
                "open": round(open_price, 4),
                "high": round(high, 4),
                "low": round(low, 4),
                "close": round(close, 4),
                "volume": round(volume, 4),
                "source": "sample",
                "data_quality": "fixture",
                "uncertainty": 0.28,
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
