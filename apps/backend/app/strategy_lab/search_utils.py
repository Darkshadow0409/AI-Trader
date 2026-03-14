from __future__ import annotations

import itertools
from random import Random
from typing import Any

from app.strategy_lab.spec_dsl import ParameterRange, StrategySpec


def _materialize_range(range_spec: ParameterRange) -> list[int | float | str]:
    if range_spec.kind == "choice":
        return list(range_spec.choices)
    if range_spec.kind == "int":
        assert isinstance(range_spec.low, int | float)
        assert isinstance(range_spec.high, int | float)
        step = int(range_spec.step or 1)
        return list(range(int(range_spec.low), int(range_spec.high) + 1, step))
    assert isinstance(range_spec.low, int | float)
    assert isinstance(range_spec.high, int | float)
    step = float(range_spec.step or 0.1)
    values: list[float] = []
    current = float(range_spec.low)
    while current <= float(range_spec.high) + 1e-9:
        values.append(round(current, 6))
        current += step
    return values


def grid_search_candidates(spec: StrategySpec, limit: int | None = None) -> list[dict[str, Any]]:
    search_space = spec.search_space
    if not search_space:
        return [spec.parameters]
    keys = list(search_space.keys())
    values = [_materialize_range(search_space[key]) for key in keys]
    product = itertools.product(*values)
    candidates: list[dict[str, Any]] = []
    bound = limit or spec.validation.max_search_trials
    for combo in product:
        merged = dict(spec.parameters)
        merged.update(dict(zip(keys, combo, strict=True)))
        candidates.append(merged)
        if len(candidates) >= bound:
            break
    return candidates


def random_search_candidates(spec: StrategySpec, trials: int, seed: int = 42) -> list[dict[str, Any]]:
    rng = Random(seed)
    candidates: list[dict[str, Any]] = []
    bounded_trials = min(trials, spec.validation.max_search_trials)
    for _ in range(bounded_trials):
        merged = dict(spec.parameters)
        for key, range_spec in spec.search_space.items():
            values = _materialize_range(range_spec)
            merged[key] = rng.choice(values)
        candidates.append(merged)
    return candidates

