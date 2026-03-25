from __future__ import annotations


def compute_stop_price(close: float, atr: float, direction: str) -> float:
    multiplier = 2.2
    if direction == "short":
        return round(close + atr * multiplier, 4)
    floor = max(close * 0.05, 0.01)
    return round(max(close - atr * multiplier, floor), 4)
