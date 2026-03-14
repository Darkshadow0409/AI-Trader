from __future__ import annotations

from typing import Any

import ccxt


class CCXTClient:
    def __init__(self, exchange_name: str) -> None:
        self.exchange_name = exchange_name
        exchange_cls = getattr(ccxt, exchange_name)
        self.exchange = exchange_cls({"enableRateLimit": True})

    def fetch_ohlcv(self, market: str, timeframe: str = "1d", limit: int = 180) -> list[list[Any]]:
        return self.exchange.fetch_ohlcv(market, timeframe=timeframe, limit=limit)

