from __future__ import annotations

from app.connectors.ccxt_client import CCXTClient


class CoinbaseMarketData:
    MARKET_MAP = {"BTC": "BTC/USD", "ETH": "ETH/USD"}

    def __init__(self) -> None:
        self.client = CCXTClient("coinbase")

    def fetch_daily_bars(self, symbol: str, limit: int = 180) -> list[list[float]]:
        return self.client.fetch_ohlcv(self.MARKET_MAP[symbol], timeframe="1d", limit=limit)

