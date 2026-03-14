from __future__ import annotations

import json
from datetime import UTC, datetime
from math import isnan
from typing import Any

from sqlmodel import Session, select

from app.core.settings import get_settings
from app.models.entities import BacktestResult, BacktestRun, MacroEvent, MarketBar, StrategyRegistryEntry
from app.models.schemas import BacktestRunRequest
from app.strategy_lab.backtestingpy_runner import run_backtesting_validation
from app.strategy_lab.optuna_search import optimize_with_optuna
from app.strategy_lab.persistence import persist_backtest_duckdb, sync_strategy_registry_duckdb
from app.strategy_lab.registry import get_registry_entry, seed_registry
from app.strategy_lab.robustness import parameter_stability_score, score_robustness
from app.strategy_lab.search_utils import grid_search_candidates, random_search_candidates
from app.strategy_lab.signal_factory import build_signal_frame, prepare_frame
from app.strategy_lab.spec_dsl import SearchMethod, StrategySpec
from app.strategy_lab.template_library import get_strategy_spec
from app.strategy_lab.vectorbt_runner import run_vectorbt_research
from app.strategy_lab.walk_forward import generate_walk_forward_windows


settings = get_settings()


def _clean_number(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if isnan(number) else number


def _clean_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clean_json(item) for item in value]
    if isinstance(value, float) and isnan(value):
        return 0.0
    return value


def _objective(metrics: dict[str, Any]) -> float:
    return (
        _clean_number(metrics.get("net_return_pct", 0.0))
        - abs(_clean_number(metrics.get("max_drawdown_pct", 0.0))) * 0.65
        + min(_clean_number(metrics.get("trade_count", 0.0)), 12) * 0.35
        + _clean_number(metrics.get("sharpe_ratio", 0.0)) * 2.5
    )


def _market_rows(session: Session, symbol: str) -> list[dict[str, Any]]:
    rows = session.exec(select(MarketBar).where(MarketBar.symbol == symbol).order_by(MarketBar.timestamp.asc())).all()
    return [
        {
            "timestamp": row.timestamp,
            "open": row.open,
            "high": row.high,
            "low": row.low,
            "close": row.close,
            "volume": row.volume,
        }
        for row in rows
    ]


def _event_times(session: Session) -> list[datetime]:
    return [row.event_time for row in session.exec(select(MacroEvent).order_by(MacroEvent.event_time.asc())).all()]


def _candidate_pool(spec: StrategySpec, search_method: SearchMethod, trials: int) -> list[dict[str, Any]]:
    bounded = min(trials, spec.validation.max_search_trials, 24)
    if search_method == "grid":
        return grid_search_candidates(spec, limit=bounded)
    if search_method == "random":
        return random_search_candidates(spec, bounded)
    return []


def _evaluate(
    spec: StrategySpec,
    rows: list[dict[str, Any]],
    event_times: list[datetime],
    params: dict[str, Any],
) -> dict[str, Any]:
    base = prepare_frame(rows)
    signal_frame = build_signal_frame(
        base,
        spec,
        params,
        event_times=event_times,
        activation_index=spec.validation.warmup_bars,
    )
    research = run_vectorbt_research(
        signal_frame,
        fees_bps=spec.execution.fees_bps,
        slippage_bps=spec.execution.slippage_bps,
        order_size_pct=spec.execution.order_size_pct,
    )
    validation = run_backtesting_validation(
        signal_frame,
        fees_bps=spec.execution.fees_bps,
        slippage_bps=spec.execution.slippage_bps,
        order_size_pct=spec.execution.order_size_pct,
    )
    return {
        "signal_frame": signal_frame,
        "research": research,
        "validation": validation,
        "objective": _objective(validation["metrics"]),
    }


def _best_parameters(
    spec: StrategySpec,
    rows: list[dict[str, Any]],
    event_times: list[datetime],
    search_method: SearchMethod,
    max_trials: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if search_method == "optuna":
        best, trials = optimize_with_optuna(spec, lambda params: _evaluate(spec, rows, event_times, params)["objective"], max_trials)
        return best, trials

    candidates = _candidate_pool(spec, search_method, max_trials)
    if not candidates:
        candidates = [dict(spec.parameters)]
    trial_summaries: list[dict[str, Any]] = []
    best_params = dict(candidates[0])
    best_score = float("-inf")
    for candidate in candidates:
        score = _evaluate(spec, rows, event_times, candidate)["objective"]
        trial_summaries.append({"parameters": candidate, "objective": round(score, 4)})
        if score > best_score:
            best_score = score
            best_params = candidate
    return best_params, trial_summaries


def _walk_forward(
    spec: StrategySpec,
    rows: list[dict[str, Any]],
    event_times: list[datetime],
    search_method: SearchMethod,
    max_trials: int,
) -> dict[str, Any]:
    windows = generate_walk_forward_windows(
        total_bars=len(rows),
        train_bars=spec.validation.train_bars,
        test_bars=spec.validation.test_bars,
        step_bars=spec.validation.step_bars,
        warmup_bars=spec.validation.warmup_bars,
    )
    window_summaries: list[dict[str, Any]] = []
    selected_params: list[dict[str, Any]] = []
    for window in windows:
        train_rows = rows[window.train_start : window.train_end]
        test_rows = rows[window.test_start : window.test_end]
        best_params, _ = _best_parameters(spec, train_rows, event_times, search_method, max_trials)
        selected_params.append(best_params)
        validation = _evaluate(spec, test_rows, event_times, best_params)["validation"]["metrics"]
        window_summaries.append(
            {
                "train_start": window.train_start,
                "train_end": window.train_end,
                "test_start": window.test_start,
                "test_end": window.test_end,
                "selected_parameters": best_params,
                "validation_metrics": validation,
            }
        )
    positive_windows = [window for window in window_summaries if float(window["validation_metrics"]["net_return_pct"]) > 0]
    positive_ratio = len(positive_windows) / len(window_summaries) if window_summaries else 0.0
    return {
        "window_count": len(window_summaries),
        "positive_window_ratio": round(positive_ratio, 2),
        "oos_return_pct": round(sum(float(window["validation_metrics"]["net_return_pct"]) for window in window_summaries), 2),
        "windows": window_summaries,
        "selected_parameters": selected_params,
    }


def _validation_flags(spec: StrategySpec) -> dict[str, Any]:
    return {
        "no_lookahead": True,
        "warmup_bars": spec.validation.warmup_bars,
        "time_series_split_only": True,
        "fees_required": spec.execution.fees_bps > 0,
        "slippage_required": spec.execution.slippage_bps > 0,
        "walk_forward_required": spec.validation.walk_forward_required,
        "promote_requires_walk_forward": spec.validation.promote_requires_walk_forward,
        "robustness_required": spec.validation.robustness_required,
        "proxy_grade": spec.proxy_grade,
    }


def _parameter_heatmap(
    spec: StrategySpec,
    rows: list[dict[str, Any]],
    event_times: list[datetime],
) -> list[dict[str, Any]]:
    names = list(spec.search_space.keys())[:2]
    if len(names) < 2:
        return []
    x_name, y_name = names
    x_candidates = grid_search_candidates(spec, limit=4)
    x_values = [candidate[x_name] for candidate in x_candidates[:3]]
    y_values = [candidate[y_name] for candidate in x_candidates[:3]]
    values: list[list[float]] = []
    for y_value in y_values:
        row: list[float] = []
        for x_value in x_values:
            params = dict(spec.parameters)
            params[x_name] = x_value
            params[y_name] = y_value
            row.append(round(_evaluate(spec, rows, event_times, params)["objective"], 2))
        values.append(row)
    return [
        {
            "x_param": x_name,
            "y_param": y_name,
            "x_labels": [str(value) for value in x_values],
            "y_labels": [str(value) for value in y_values],
            "values": values,
        }
    ]


def _regime_summary(signal_frame: Any, trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if signal_frame.empty:
        return []
    regime_lookup = {index.isoformat(): regime for index, regime in signal_frame["regime"].items()}
    grouped: dict[str, list[float]] = {}
    for trade in trades:
        regime = regime_lookup.get(str(trade["entry_time"]), "unclassified")
        grouped.setdefault(regime, []).append(float(trade["pnl_pct"]))
    summaries: list[dict[str, Any]] = []
    for regime, pnls in grouped.items():
        wins = len([pnl for pnl in pnls if pnl > 0])
        summaries.append(
            {
                "regime": regime,
                "return_pct": round(sum(pnls), 2),
            "trade_count": len(pnls),
            "win_rate": round(wins / len(pnls), 2) if pnls else 0.0,
            }
        )
    return summaries


def seed_strategy_lab(session: Session) -> None:
    seed_registry(session)
    sync_strategy_registry_duckdb(session.exec(select(StrategyRegistryEntry)).all())
    if session.exec(select(BacktestResult)).first() is not None:
        return
    payload = json.loads((settings.fixtures_path / "backtest_samples.json").read_text(encoding="utf-8"))
    for item in payload:
        metadata = item["metadata"]
        run = BacktestRun(
            name=item["name"],
            engine=item["engine"],
            started_at=datetime.fromisoformat(item["started_at"].replace("Z", "+00:00")).astimezone(UTC).replace(tzinfo=None),
            metadata_json=metadata,
        )
        session.add(run)
        session.flush()
        result = BacktestResult(
            strategy_name=metadata["strategy_name"],
            engine=item["engine"],
            status=metadata["status"],
            symbol=metadata["symbol"],
            timeframe="1d",
            created_at=run.started_at,
            completed_at=run.started_at,
            proxy_grade=metadata["proxy_grade"],
            promoted_candidate=metadata["promoted"],
            fees_bps=metadata["fees_bps"],
            slippage_bps=metadata["slippage_bps"],
            warmup_bars=get_strategy_spec(metadata["strategy_name"]).validation.warmup_bars,
            search_method="grid",
            robustness_score=metadata["robustness_score"],
            net_return_pct=metadata["validation_summary"]["net_return_pct"],
            sharpe_ratio=float(metadata["validation_summary"].get("sharpe_ratio", 0.0)),
            max_drawdown_pct=metadata["validation_summary"]["max_drawdown_pct"],
            trade_count=metadata["validation_summary"]["trade_count"],
            validation_json={"flags": _validation_flags(get_strategy_spec(metadata["strategy_name"]))},
            summary_json={
                "research": metadata["research_summary"],
                "validation": metadata["validation_summary"],
                "walk_forward": metadata["walk_forward_summary"],
            },
            equity_curve_json=metadata["equity_curve"],
            trades_json=metadata["trades"],
            stability_heatmap_json=[metadata["parameter_heatmap"]],
            regime_summary_json=metadata["regime_summary"],
            metadata_json=metadata,
        )
        session.add(result)
    session.commit()
    for result in session.exec(select(BacktestResult)).all():
        persist_backtest_duckdb(result)


def list_strategies(session: Session) -> list[StrategyRegistryEntry]:
    seed_strategy_lab(session)
    return session.exec(select(StrategyRegistryEntry).order_by(StrategyRegistryEntry.name.asc())).all()


def get_strategy(session: Session, strategy_name: str) -> StrategyRegistryEntry:
    seed_strategy_lab(session)
    return get_registry_entry(session, strategy_name)


def list_backtests(session: Session) -> list[BacktestResult]:
    seed_strategy_lab(session)
    return session.exec(select(BacktestResult).order_by(BacktestResult.created_at.desc())).all()


def get_backtest(session: Session, run_id: int) -> BacktestResult | None:
    seed_strategy_lab(session)
    return session.exec(select(BacktestResult).where(BacktestResult.id == run_id)).first()


def run_backtest(session: Session, request: BacktestRunRequest) -> BacktestResult:
    seed_strategy_lab(session)
    spec = get_strategy_spec(request.strategy_name)
    symbol = spec.underlying_symbol
    rows = _market_rows(session, symbol)
    event_times = _event_times(session)
    best_params, trial_summaries = _best_parameters(spec, rows, event_times, request.search_method, request.max_trials)  # type: ignore[arg-type]
    if request.parameter_overrides:
        best_params.update(request.parameter_overrides)
    evaluation = _evaluate(spec, rows, event_times, best_params)
    walk_forward = _walk_forward(spec, rows, event_times, request.search_method, request.max_trials)  # type: ignore[arg-type]
    parameter_stability = parameter_stability_score(walk_forward["selected_parameters"])
    robustness = score_robustness(
        net_return_pct=float(evaluation["validation"]["metrics"]["net_return_pct"]),
        max_drawdown_pct=float(evaluation["validation"]["metrics"]["max_drawdown_pct"]),
        sharpe_ratio=float(evaluation["validation"]["metrics"]["sharpe_ratio"]),
        trade_count=int(evaluation["validation"]["metrics"]["trade_count"]),
        positive_window_ratio=float(walk_forward["positive_window_ratio"]),
        parameter_stability=parameter_stability,
    )
    promoted = (
        request.promote_candidate
        and walk_forward["window_count"] > 0
        and walk_forward["positive_window_ratio"] >= 0.5
        and robustness >= 65
    )
    if request.promote_candidate and spec.validation.promote_requires_walk_forward and walk_forward["window_count"] == 0:
        raise ValueError("Walk-forward validation is required before promoting a strategy.")

    now = datetime.now(UTC).replace(tzinfo=None)
    run = BacktestRun(
        name=f"{spec.name}_{symbol}_{now:%Y%m%d%H%M%S}",
        engine="strategy_lab",
        started_at=now,
        metadata_json={
            "strategy_name": spec.name,
            "symbol": symbol,
            "search_method": request.search_method,
            "best_parameters": best_params,
            "trial_summaries": trial_summaries,
        },
    )
    session.add(run)
    session.flush()
    result = BacktestResult(
        strategy_name=spec.name,
        engine="strategy_lab",
        status="completed",
        symbol=symbol,
        timeframe=spec.timeframe,
        created_at=now,
        completed_at=now,
        proxy_grade=spec.proxy_grade,
        promoted_candidate=promoted,
        fees_bps=spec.execution.fees_bps,
        slippage_bps=spec.execution.slippage_bps,
        warmup_bars=spec.validation.warmup_bars,
        search_method=request.search_method,
        robustness_score=robustness,
        net_return_pct=_clean_number(evaluation["validation"]["metrics"]["net_return_pct"]),
        sharpe_ratio=_clean_number(evaluation["validation"]["metrics"]["sharpe_ratio"]),
        max_drawdown_pct=_clean_number(evaluation["validation"]["metrics"]["max_drawdown_pct"]),
        trade_count=int(evaluation["validation"]["metrics"]["trade_count"]),
        validation_json=_clean_json({"flags": _validation_flags(spec), "walk_forward": walk_forward}),
        summary_json=_clean_json({
            "research": evaluation["research"]["metrics"],
            "validation": evaluation["validation"]["metrics"],
            "best_parameters": best_params,
            "trial_summaries": trial_summaries,
            "walk_forward": {
                "window_count": walk_forward["window_count"],
                "oos_return_pct": walk_forward["oos_return_pct"],
                "positive_window_ratio": walk_forward["positive_window_ratio"],
            },
        }),
        equity_curve_json=_clean_json(evaluation["validation"]["equity_curve"]),
        trades_json=_clean_json(evaluation["validation"]["trades"]),
        stability_heatmap_json=_clean_json(_parameter_heatmap(spec, rows, event_times)),
        regime_summary_json=_clean_json(_regime_summary(evaluation["signal_frame"], evaluation["validation"]["trades"])),
        metadata_json=_clean_json({
            "run_id": run.id,
            "spec": spec.model_dump(mode="json"),
            "best_parameters": best_params,
            "research_engine": evaluation["research"]["engine"],
            "validation_engine": evaluation["validation"]["engine"],
        }),
    )
    session.add(result)
    registry_entry = get_registry_entry(session, spec.name)
    registry_entry.promoted = promoted
    session.add(registry_entry)
    session.commit()
    session.refresh(result)
    sync_strategy_registry_duckdb(session.exec(select(StrategyRegistryEntry)).all())
    persist_backtest_duckdb(result)
    return result
