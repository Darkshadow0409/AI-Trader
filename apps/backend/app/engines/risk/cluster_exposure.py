from __future__ import annotations


def cluster_for_symbol(symbol: str) -> str:
    if symbol in {"BTC", "ETH"}:
        return "crypto_beta"
    return "macro_context"

