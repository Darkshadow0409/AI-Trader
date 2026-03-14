from __future__ import annotations


def compute_stop_price(close: float, atr: float, direction: str) -> float:
    multiplier = 2.2
    return round(close - atr * multiplier, 4) if direction != "short" else round(close + atr * multiplier, 4)

