from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.core.settings import get_settings
from app.strategy_lab.spec_dsl import StrategySpec, load_strategy_spec


def _strategy_dir() -> Path:
    settings = get_settings()
    return settings.fixtures_path / "strategy_specs"


@lru_cache(maxsize=1)
def _load_specs() -> dict[str, StrategySpec]:
    specs: dict[str, StrategySpec] = {}
    for path in sorted(_strategy_dir().glob("*.yaml")):
        spec = load_strategy_spec(path)
        specs[spec.name] = spec
    return specs


def list_strategy_specs() -> list[StrategySpec]:
    return list(_load_specs().values())


def get_strategy_spec(name: str) -> StrategySpec:
    specs = _load_specs()
    if name not in specs:
        raise KeyError(f"Unknown strategy '{name}'.")
    return specs[name]


def refresh_strategy_specs() -> None:
    _load_specs.cache_clear()

