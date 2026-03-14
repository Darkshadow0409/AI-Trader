from __future__ import annotations

import itertools
import math
import random
from typing import Any

from app.strategy_lab.spec_dsl import ParameterRange, StrategySpec


def _coerce_number(value: float | int, kind: str) -> float | int:
    if kind == "int":
        return int(round(float(value)))
    return round(float(value), 6)


def parameter_values(definition: ParameterRange) -> list[float | int | str]:
    if definition.kind == "choice":
        return list(definition.choices)
    assert definition.low is not None and definition.high is not None and definition.step is not None
    count = int(math.floor((float(definition.high) - float(definition.low)) / float(definition.step))) + 1
    values = [_coerce_number(float(definition.low) + idx * float(definition.step), definition.kind) for idx in range(count)]
    return [value for value in values if float(value) <= float(definition.high) + 1e-9]


def grid_search_candidates(spec: StrategySpec, max_candidates: int = 64) -> list[dict[str, Any]]:
    names = list(spec.search_space)
    if not names:
        return [spec.default_parameters]
    grids = [parameter_values(spec.search_space[name]) for name in names]
    candidates: list[dict[str, Any]] = []
    for combo in itertools.product(*grids):
        candidate = dict(spec.default_parameters)
        for name, value in zip(names, combo, strict=True):
            candidate[name] = value
        candidates.append(candidate)
        if len(candidates) >= max_candidates:
            break
    return candidates


def random_search_candidates(spec: StrategySpec, sample_count: int = 12, seed: int = 7) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    candidates: list[dict[str, Any]] = []
    for _ in range(sample_count):
        candidate = dict(spec.default_parameters)
        for name, definition in spec.search_space.items():
            values = parameter_values(definition)
            candidate[name] = rng.choice(values)
        candidates.append(candidate)
    return candidates

