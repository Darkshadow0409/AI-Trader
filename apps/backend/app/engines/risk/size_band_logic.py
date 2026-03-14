from __future__ import annotations


def assign_size_band(score: float, uncertainty: float) -> tuple[str, float]:
    adjusted = score - uncertainty * 30
    if adjusted >= 65:
        return "standard", 0.012
    if adjusted >= 45:
        return "starter", 0.008
    return "probe", 0.004

