from __future__ import annotations


class DeribitMarketData:
    """Phase-1 placeholder for options context without execution support."""

    def fetch_daily_bars(self, symbol: str, limit: int = 180) -> list[list[float]]:
        return []

