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
    "DXY": (103.0, 0.7),
    "US10Y": (4.18, 0.08),
}


def generate_sample_ohlcv(symbol: str, bars: int = 180) -> list[dict[str, object]]:
    base_price, amplitude = ASSET_SEEDS[symbol]
    rng = Random(symbol)
    start = naive_utc_now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=bars)
    close = base_price
    rows: list[dict[str, object]] = []
    for index in range(bars):
        ts = start + timedelta(days=index)
        drift = 1 + (0.0012 if symbol in {"BTC", "ETH"} else 0.0003)
        seasonal = sin(index / 9.0) * amplitude * 0.02
        shock = rng.uniform(-amplitude * 0.06, amplitude * 0.06)
        close = max(0.1, close * drift + seasonal + shock)
        spread = max(amplitude * 0.015, close * 0.008)
        open_price = max(0.1, close - rng.uniform(-spread, spread))
        high = max(open_price, close) + rng.uniform(spread * 0.2, spread)
        low = min(open_price, close) - rng.uniform(spread * 0.2, spread)
        volume_base = 25000 if symbol == "BTC" else 140000 if symbol == "ETH" else 7000
        volume = max(1.0, volume_base * (1 + sin(index / 13.0) * 0.15 + rng.uniform(-0.08, 0.12)))
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
            "symbol": "BTC",
            "label": "Bitcoin",
            "thesis": "Primary crypto beta with improving daily trend.",
            "priority": 1,
            "status": "active",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
        {
            "symbol": "ETH",
            "label": "Ethereum",
            "thesis": "Relative-strength candidate if BTC trend holds.",
            "priority": 2,
            "status": "active",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
        {
            "symbol": "WTI",
            "label": "WTI crude context",
            "thesis": "Oil proxy for inflation spillover and macro context.",
            "priority": 3,
            "status": "context",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
        {
            "symbol": "GOLD",
            "label": "Gold",
            "thesis": "Macro hedge and real-yield sensitivity monitor.",
            "priority": 4,
            "status": "context",
            "last_signal_score": 0.0,
            "updated_at": now,
        },
    ]
