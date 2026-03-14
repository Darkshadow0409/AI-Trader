from __future__ import annotations

from math import exp


def parameter_stability_score(parameter_sets: list[dict[str, int | float | str]]) -> float:
    if len(parameter_sets) <= 1:
        return 0.75
    numeric_keys = [key for key, value in parameter_sets[0].items() if isinstance(value, (int, float))]
    if not numeric_keys:
        return 0.75
    deviations: list[float] = []
    for key in numeric_keys:
        values = [float(params[key]) for params in parameter_sets]
        mean = sum(values) / len(values)
        if mean == 0:
            continue
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        deviations.append((variance**0.5) / abs(mean))
    if not deviations:
        return 0.75
    return max(0.0, 1.0 - min(sum(deviations) / len(deviations), 1.0))


def score_robustness(
    net_return_pct: float,
    max_drawdown_pct: float,
    sharpe_ratio: float,
    trade_count: int,
    positive_window_ratio: float,
    parameter_stability: float,
) -> float:
    return_component = max(min(net_return_pct / 25, 1.0), -1.0)
    drawdown_component = max(0.0, 1.0 - min(abs(max_drawdown_pct) / 35, 1.0))
    sharpe_component = max(0.0, min((sharpe_ratio + 0.5) / 2.0, 1.0))
    trade_component = max(0.0, min(trade_count / 20, 1.0))
    window_component = max(0.0, min(positive_window_ratio, 1.0))
    blended = (
        return_component * 0.22
        + drawdown_component * 0.18
        + sharpe_component * 0.2
        + trade_component * 0.12
        + window_component * 0.16
        + parameter_stability * 0.12
    )
    score = 100 / (1 + exp(-4 * (blended - 0.35)))
    return round(max(0.0, min(score, 100.0)), 2)
