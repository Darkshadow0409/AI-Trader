from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml  # type: ignore[import-untyped]
from pydantic import BaseModel, Field, model_validator


TemplateName = Literal["trend_breakout", "vol_expansion", "event_continuation"]
SearchMethod = Literal["grid", "random", "optuna"]


class ParameterRange(BaseModel):
    kind: Literal["int", "float", "choice"]
    low: int | float | None = None
    high: int | float | None = None
    step: int | float | None = None
    choices: list[int | float | str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_bounds(self) -> "ParameterRange":
        if self.kind == "choice" and not self.choices:
            raise ValueError("Choice parameter ranges require explicit choices.")
        if self.kind != "choice" and (self.low is None or self.high is None or self.step is None):
            raise ValueError("Numeric parameter ranges require low/high bounds.")
        return self


class ExecutionConfig(BaseModel):
    fees_bps: float = Field(gt=0)
    slippage_bps: float = Field(gt=0)
    order_size_pct: float = Field(default=1.0, gt=0, le=1.0)


class ValidationConfig(BaseModel):
    warmup_bars: int = Field(ge=5)
    train_bars: int = Field(ge=30)
    test_bars: int = Field(ge=10)
    step_bars: int = Field(ge=5)
    walk_forward_required: bool = True
    promote_requires_walk_forward: bool = True
    robustness_required: bool = True
    proxy_grade_if_symbol_mismatch: bool = True
    max_search_trials: int = Field(default=24, ge=1, le=40)


class StrategySpec(BaseModel):
    name: str
    version: str
    template: TemplateName
    description: str
    universe: list[str]
    underlying_symbol: str
    tradable_symbol: str
    timeframe: str
    rules: dict[str, str]
    tags: list[str] = Field(default_factory=list)
    parameters: dict[str, int | float | str] = Field(default_factory=dict)
    search_space: dict[str, ParameterRange] = Field(default_factory=dict)
    execution: ExecutionConfig
    validation: ValidationConfig

    @model_validator(mode="after")
    def validate_strategy(self) -> "StrategySpec":
        if self.timeframe != "1d":
            raise ValueError("Milestone strategy lab currently supports 1d timeframe only.")
        if self.underlying_symbol not in self.universe:
            raise ValueError("Underlying symbol must be present in strategy universe.")
        if self.validation.train_bars <= self.validation.warmup_bars:
            raise ValueError("Train bars must exceed warm-up bars.")
        return self

    @property
    def proxy_grade(self) -> bool:
        return self.underlying_symbol != self.tradable_symbol and self.validation.proxy_grade_if_symbol_mismatch

    @property
    def default_parameters(self) -> dict[str, int | float | str]:
        values = dict(self.parameters)
        for name, definition in self.search_space.items():
            if name in values:
                continue
            if definition.kind == "choice":
                values[name] = definition.choices[0]
            else:
                values[name] = definition.low if definition.low is not None else 0
        return values


def parse_strategy_spec(raw: str) -> StrategySpec:
    payload = yaml.safe_load(raw)
    if not isinstance(payload, dict):
        raise ValueError("Strategy spec must parse into a mapping.")
    return StrategySpec.model_validate(payload)


def load_strategy_spec(path: Path) -> StrategySpec:
    return parse_strategy_spec(path.read_text(encoding="utf-8"))


def dump_strategy_spec(spec: StrategySpec) -> dict[str, Any]:
    return spec.model_dump(mode="json")
