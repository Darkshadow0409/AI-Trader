from __future__ import annotations

from typing import Any, Callable

try:
    import optuna
except Exception:  # pragma: no cover - fallback when optional dependency is absent
    optuna = None  # type: ignore[assignment]

from app.strategy_lab.search_utils import random_search_candidates
from app.strategy_lab.spec_dsl import StrategySpec


def optimize_with_optuna(
    spec: StrategySpec,
    objective_fn: Callable[[dict[str, Any]], float],
    trials: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if optuna is None:
        fallback = random_search_candidates(spec, min(trials, spec.validation.max_search_trials))
        first = fallback[0] if fallback else dict(spec.parameters)
        return first, [{"parameters": candidate, "objective": objective_fn(candidate)} for candidate in fallback]
    bounded_trials = min(trials, spec.validation.max_search_trials, 24)
    if not spec.search_space:
        params = dict(spec.parameters)
        return params, [{"parameters": params, "objective": objective_fn(params)}]

    trial_summaries: list[dict[str, Any]] = []

    def objective(trial: optuna.Trial) -> float:
        params = dict(spec.parameters)
        for key, range_spec in spec.search_space.items():
            if range_spec.kind == "choice":
                params[key] = trial.suggest_categorical(key, range_spec.choices)
            elif range_spec.kind == "int":
                params[key] = trial.suggest_int(key, int(range_spec.low or 0), int(range_spec.high or 0), step=int(range_spec.step or 1))
            else:
                params[key] = trial.suggest_float(key, float(range_spec.low or 0.0), float(range_spec.high or 0.0), step=float(range_spec.step or 0.1))
        value = objective_fn(params)
        trial_summaries.append({"parameters": params, "objective": round(value, 4)})
        return value

    sampler = optuna.samplers.TPESampler(seed=42)
    study = optuna.create_study(direction="maximize", sampler=sampler)
    study.optimize(objective, n_trials=bounded_trials, show_progress_bar=False)
    if study.best_trial is None:
        fallback = random_search_candidates(spec, bounded_trials)[0]
        return fallback, trial_summaries
    best_params = dict(spec.parameters)
    best_params.update(study.best_trial.params)
    return best_params, trial_summaries
