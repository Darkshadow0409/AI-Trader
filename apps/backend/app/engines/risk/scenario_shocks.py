from __future__ import annotations


def build_scenario_shocks(symbol: str) -> dict[str, float]:
    if symbol == "BTC":
        return {"risk_off_pct": -8.0, "liquidity_gap_pct": -4.5, "macro_repricing_pct": -6.0}
    if symbol == "ETH":
        return {"risk_off_pct": -10.5, "liquidity_gap_pct": -5.8, "macro_repricing_pct": -7.2}
    return {"risk_off_pct": -3.0, "liquidity_gap_pct": -1.5, "macro_repricing_pct": -2.0}

