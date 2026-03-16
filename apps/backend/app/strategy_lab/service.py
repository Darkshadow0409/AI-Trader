from __future__ import annotations

import json
from datetime import UTC, datetime
from math import isnan
from pathlib import Path
from typing import Any

from sqlalchemy import delete
from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.core.settings import get_settings
from app.models.entities import BacktestResult, BacktestRun, CalibrationSnapshot, ForwardValidationRecord, MacroEvent, MarketBar, PaperTradeRecord, PaperTradeReviewRecord, PipelineRun, SignalRecord, StrategyRegistryEntry, StrategyStateTransition
from app.models.schemas import (
    BacktestDetailView,
    BacktestListView,
    BacktestRunRequest,
    CalibrationBucketView,
    CalibrationSnapshotView,
    DataRealismPenaltyView,
    ForwardValidationRecordView,
    ForwardValidationSummaryView,
    PromotionRationaleView,
    PromotionTransitionView,
    StrategyDetailView,
    StrategyLifecycleUpdateRequest,
    StrategyListView,
    StrategyOperatorFeedbackView,
)
from app.services.data_reality import asset_reality
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
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"
LIFECYCLE_STATES = {"experimental", "paper_validating", "promoted", "demoted"}
CLOSED_PAPER_STATUSES = {"closed_win", "closed_loss", "invalidated", "timed_out", "cancelled"}
OPERATOR_FAILURE_CATEGORIES = {"operator_timing", "operator_sizing", "realism_ignored", "execution_plan_violation"}


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


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC).replace(tzinfo=None)


def _bucket_label(metric: float) -> str:
    if metric >= 60:
        return "top"
    if metric >= 40:
        return "middle"
    return "low"


def _confidence_bucket(metric: float) -> str:
    if metric >= 0.75:
        return "top"
    if metric >= 0.55:
        return "middle"
    return "low"


def _forward_validation_view(row: ForwardValidationRecord) -> ForwardValidationRecordView:
    return ForwardValidationRecordView(
        validation_id=row.validation_id,
        strategy_name=row.strategy_name,
        mode=row.mode,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        trade_id=row.trade_id,
        opened_at=row.opened_at,
        closed_at=row.closed_at,
        entry_price=row.entry_price,
        exit_price=row.exit_price,
        pnl_pct=row.pnl_pct,
        drawdown_pct=row.drawdown_pct,
        target_attained=row.target_attained,
        invalidated=row.invalidated,
        time_stopped=row.time_stopped,
        data_quality=row.data_quality,
        notes=row.notes,
    )


def _transition_view(row: StrategyStateTransition) -> PromotionTransitionView:
    return PromotionTransitionView(
        strategy_name=row.strategy_name,
        from_state=row.from_state,
        to_state=row.to_state,
        changed_at=row.changed_at,
        note=row.note,
    )


def _walk_forward_quality(result: BacktestResult | None) -> float:
    if result is None:
        return 0.0
    validation_walk_forward = result.validation_json.get("walk_forward", {})
    if isinstance(validation_walk_forward, dict):
        if validation_walk_forward.get("positive_window_ratio") is not None:
            return _clean_number(validation_walk_forward.get("positive_window_ratio"))
        if validation_walk_forward.get("pass_rate") is not None:
            return _clean_number(validation_walk_forward.get("pass_rate"))
    summary_walk_forward = result.summary_json.get("walk_forward", {})
    if isinstance(summary_walk_forward, dict):
        if summary_walk_forward.get("positive_window_ratio") is not None:
            return _clean_number(summary_walk_forward.get("positive_window_ratio"))
        if summary_walk_forward.get("pass_rate") is not None:
            return _clean_number(summary_walk_forward.get("pass_rate"))
    return 0.0


def _objective(metrics: dict[str, Any]) -> float:
    return (
        _clean_number(metrics.get("net_return_pct", 0.0))
        - abs(_clean_number(metrics.get("max_drawdown_pct", 0.0))) * 0.65
        + min(_clean_number(metrics.get("trade_count", 0.0)), 12) * 0.35
        + _clean_number(metrics.get("sharpe_ratio", 0.0)) * 2.5
    )


def _seed_lifecycle_transitions(session: Session) -> None:
    if session.exec(select(StrategyStateTransition)).first() is not None:
        return
    for entry in session.exec(select(StrategyRegistryEntry)).all():
        session.add(
            StrategyStateTransition(
                strategy_name=entry.name,
                from_state="experimental",
                to_state=entry.lifecycle_state,
                changed_at=entry.lifecycle_updated_at,
                note=entry.lifecycle_note or "Initial seeded lifecycle state.",
            )
        )
    session.commit()


def _seed_forward_validation_records(session: Session) -> None:
    if session.exec(select(ForwardValidationRecord)).first() is not None:
        return
    payload = json.loads((FIXTURES_DIR / "forward_validation_samples.json").read_text(encoding="utf-8"))
    for item in payload:
        session.add(
            ForwardValidationRecord(
                validation_id=str(item["validation_id"]),
                strategy_name=str(item["strategy_name"]),
                mode=str(item["mode"]),
                signal_id=item.get("signal_id"),
                risk_report_id=item.get("risk_report_id"),
                trade_id=item.get("trade_id"),
                opened_at=_parse_iso(str(item["opened_at"])),
                closed_at=_parse_iso(str(item["closed_at"])) if item.get("closed_at") else None,
                entry_price=float(item.get("entry_price", 0.0)),
                exit_price=float(item.get("exit_price", 0.0)),
                pnl_pct=float(item.get("pnl_pct", 0.0)),
                drawdown_pct=float(item.get("drawdown_pct", 0.0)),
                target_attained=bool(item.get("target_attained", False)),
                invalidated=bool(item.get("invalidated", False)),
                time_stopped=bool(item.get("time_stopped", False)),
                data_quality=str(item.get("data_quality", "fixture")),
                notes=str(item.get("notes", "")),
            )
        )
    session.commit()


def _aggregate_forward_validation(session: Session, strategy_name: str) -> ForwardValidationSummaryView:
    rows = session.exec(
        select(ForwardValidationRecord)
        .where(ForwardValidationRecord.strategy_name == strategy_name)
        .order_by(desc(ForwardValidationRecord.opened_at))
    ).all()
    sample_size = len(rows)
    if sample_size == 0:
        return ForwardValidationSummaryView(
            sample_size=0,
            hit_rate=0.0,
            expectancy_proxy=0.0,
            drawdown=0.0,
            target_attainment=0.0,
            invalidation_rate=0.0,
            time_stop_frequency=0.0,
            modes={},
        )
    hits = sum(1 for row in rows if row.pnl_pct > 0)
    modes: dict[str, int] = {}
    for row in rows:
        modes[row.mode] = modes.get(row.mode, 0) + 1
    return ForwardValidationSummaryView(
        sample_size=sample_size,
        hit_rate=round(hits / sample_size, 2),
        expectancy_proxy=round(sum(row.pnl_pct for row in rows) / sample_size, 2),
        drawdown=round(min((row.drawdown_pct for row in rows), default=0.0), 2),
        target_attainment=round(sum(1 for row in rows if row.target_attained) / sample_size, 2),
        invalidation_rate=round(sum(1 for row in rows if row.invalidated) / sample_size, 2),
        time_stop_frequency=round(sum(1 for row in rows if row.time_stopped) / sample_size, 2),
        modes=modes,
    )


def _normalize_failure_categories(values: list[str] | None, primary: str = "") -> list[str]:
    normalized: list[str] = []
    for item in ([primary] if primary else []) + list(values or []):
        candidate = str(item).strip()
        if candidate and candidate not in normalized:
            normalized.append(candidate)
    return normalized


def _strategy_operator_feedback(session: Session, strategy_name: str) -> StrategyOperatorFeedbackView | None:
    trades = session.exec(
        select(PaperTradeRecord)
        .where(PaperTradeRecord.strategy_id == strategy_name)
        .where(PaperTradeRecord.status.in_(CLOSED_PAPER_STATUSES))
        .order_by(desc(PaperTradeRecord.closed_at))
    ).all()
    if not trades:
        return None
    reviews = {
        row.trade_id: row
        for row in session.exec(
            select(PaperTradeReviewRecord).where(PaperTradeReviewRecord.trade_id.in_([trade.trade_id for trade in trades]))
        ).all()
    }
    adherence_scores: list[float] = []
    expectancy_values: list[float] = []
    realism_weighted_values: list[float] = []
    operator_error_count = 0
    failure_counts: dict[str, int] = {}
    for trade in trades:
        review = reviews.get(trade.trade_id)
        outcome = trade.outcome_json or {}
        realized = _clean_number(outcome.get("realized_pnl_pct", 0.0))
        expectancy_values.append(realized)
        reality = asset_reality(
            session,
            trade.symbol,
            as_of=trade.closed_at or trade.updated_at,
            data_quality=trade.data_quality,
        )
        realism_weighted_values.append(realized * max(0.2, reality.realism_score / 100))
        metrics: list[bool] = []
        entry_ok = review.entered_inside_suggested_zone if review and review.entered_inside_suggested_zone is not None else outcome.get("entry_quality_label") == "inside_zone" if trade.actual_entry is not None else None
        if entry_ok is not None:
            metrics.append(bool(entry_ok))
        if review and review.invalidation_respected is not None:
            metrics.append(bool(review.invalidation_respected))
        if review and review.time_stop_respected is not None:
            metrics.append(bool(review.time_stop_respected))
        if review and review.size_plan_respected is not None:
            metrics.append(bool(review.size_plan_respected))
        elif review and (review.oversized is True or review.undersized is True):
            metrics.append(False)
        if review and review.exited_per_plan is not None:
            metrics.append(bool(review.exited_per_plan))
        if review and review.realism_warning_ignored is not None:
            metrics.append(not review.realism_warning_ignored)
        adherence_scores.append(round(sum(1 for item in metrics if item) / len(metrics), 2) if metrics else 0.0)
        categories = _normalize_failure_categories(review.failure_categories_json if review else [], review.failure_category if review else "")
        if any(category in OPERATOR_FAILURE_CATEGORIES for category in categories):
            operator_error_count += 1
        for category in categories:
            failure_counts[category] = failure_counts.get(category, 0) + 1
    adherence_rate = round(sum(adherence_scores) / len(adherence_scores), 2) if adherence_scores else 0.0
    adherence_adjusted = round((sum(expectancy_values) / len(expectancy_values)) * adherence_rate, 2) if expectancy_values else 0.0
    realism_adjusted = round(sum(realism_weighted_values) / len(realism_weighted_values), 2) if realism_weighted_values else 0.0
    operator_error_rate = round(operator_error_count / len(trades), 2) if trades else 0.0
    drift_indicator = "stable"
    if adherence_rate < 0.55 or adherence_adjusted < 0:
        drift_indicator = "degrading"
    elif adherence_rate < 0.7 or realism_adjusted < 0:
        drift_indicator = "monitor"
    dominant_failure_categories = [
        category for category, _ in sorted(failure_counts.items(), key=lambda item: (-item[1], item[0]))[:3]
    ]
    notes = [
        f"Adherence-adjusted expectancy proxy: {adherence_adjusted:+.2f}%.",
        f"Realism-adjusted expectancy proxy: {realism_adjusted:+.2f}%.",
        f"Operator-error-tagged review share: {operator_error_rate:.2f}.",
    ]
    if dominant_failure_categories:
        notes.append(f"Dominant failure tags: {', '.join(dominant_failure_categories)}.")
    return StrategyOperatorFeedbackView(
        trade_count=len(trades),
        adherence_rate=adherence_rate,
        adherence_adjusted_expectancy_proxy=adherence_adjusted,
        realism_adjusted_expectancy_proxy=realism_adjusted,
        operator_error_rate=operator_error_rate,
        drift_indicator=drift_indicator,
        dominant_failure_categories=dominant_failure_categories,
        notes=notes,
    )


def _recompute_calibration_snapshots(session: Session) -> None:
    session.execute(delete(CalibrationSnapshot))
    signal_rows = session.exec(select(SignalRecord).order_by(desc(SignalRecord.timestamp))).all()
    signals = {row.signal_id: row for row in signal_rows}
    latest_signal_by_symbol: dict[str, SignalRecord] = {}
    for row in signal_rows:
        latest_signal_by_symbol.setdefault(row.symbol, row)
    for entry in session.exec(select(StrategyRegistryEntry)).all():
        records = session.exec(select(ForwardValidationRecord).where(ForwardValidationRecord.strategy_name == entry.name)).all()
        for bucket_kind in ("score", "confidence"):
            grouped: dict[str, list[dict[str, float]]] = {"top": [], "middle": [], "low": []}
            for record in records:
                signal = signals.get(record.signal_id or "")
                if signal is None:
                    signal = latest_signal_by_symbol.get(entry.underlying_symbol) or latest_signal_by_symbol.get(entry.tradable_symbol)
                if signal is None:
                    continue
                score_value = float(signal.score)
                confidence_value = round(max(0.05, min(0.95, 1.0 - float(signal.uncertainty))), 2)
                label = _bucket_label(score_value) if bucket_kind == "score" else _confidence_bucket(confidence_value)
                grouped[label].append(
                    {
                        "score": score_value,
                        "confidence": confidence_value,
                        "pnl_pct": float(record.pnl_pct),
                        "target_attained": 1.0 if record.target_attained else 0.0,
                        "invalidated": 1.0 if record.invalidated else 0.0,
                    }
                )
            buckets: list[dict[str, Any]] = []
            for label in ("top", "middle", "low"):
                rows = grouped[label]
                sample_size = len(rows)
                buckets.append(
                    {
                        "bucket": label,
                        "sample_size": sample_size,
                        "avg_score": round(sum(item["score"] for item in rows) / sample_size, 2) if sample_size else 0.0,
                        "avg_confidence": round(sum(item["confidence"] for item in rows) / sample_size, 2) if sample_size else 0.0,
                        "hit_rate": round(sum(1 for item in rows if item["pnl_pct"] > 0) / sample_size, 2) if sample_size else 0.0,
                        "expectancy_proxy": round(sum(item["pnl_pct"] for item in rows) / sample_size, 2) if sample_size else 0.0,
                        "invalidation_rate": round(sum(item["invalidated"] for item in rows) / sample_size, 2) if sample_size else 0.0,
                        "target_attainment": round(sum(item["target_attained"] for item in rows) / sample_size, 2) if sample_size else 0.0,
                    }
                )
            session.add(
                CalibrationSnapshot(
                    strategy_name=entry.name,
                    created_at=naive_utc_now(),
                    bucket_kind=bucket_kind,
                    summary_json={
                        "buckets": buckets,
                        "notes": "Calibration compares buckets only. It is not a probability-of-profit claim.",
                    },
                )
            )
    session.commit()


def _calibration_snapshots(session: Session, strategy_name: str) -> list[CalibrationSnapshotView]:
    rows = session.exec(
        select(CalibrationSnapshot)
        .where(CalibrationSnapshot.strategy_name == strategy_name)
        .order_by(CalibrationSnapshot.created_at.desc(), CalibrationSnapshot.bucket_kind.asc())
    ).all()
    payload: list[CalibrationSnapshotView] = []
    for row in rows:
        payload.append(
            CalibrationSnapshotView(
                strategy_name=row.strategy_name,
                created_at=row.created_at,
                bucket_kind=row.bucket_kind,
                buckets=[CalibrationBucketView(**item) for item in row.summary_json.get("buckets", [])],
                notes=str(row.summary_json.get("notes", "")),
            )
        )
    return payload


def _data_realism_penalties(session: Session, entry: StrategyRegistryEntry) -> list[DataRealismPenaltyView]:
    latest_run = session.exec(select(PipelineRun).order_by(desc(PipelineRun.started_at))).first()
    latest_signal = session.exec(
        select(SignalRecord)
        .where(SignalRecord.symbol == entry.underlying_symbol)
        .order_by(desc(SignalRecord.timestamp))
    ).first()
    reality = asset_reality(
        session,
        entry.underlying_symbol,
        as_of=latest_signal.timestamp if latest_signal else latest_run.completed_at if latest_run else None,
        data_quality=latest_signal.data_quality if latest_signal else "fixture",
        features=latest_signal.features_json if latest_signal else None,
        tradable_symbol=entry.tradable_symbol,
    )
    return reality.penalties


def _promotion_rationale(
    session: Session,
    entry: StrategyRegistryEntry,
    robustness_score: float,
    walk_forward_quality: float,
) -> PromotionRationaleView:
    forward_summary = _aggregate_forward_validation(session, entry.name)
    latest_run = session.exec(select(PipelineRun).order_by(desc(PipelineRun.started_at))).first()
    latest_signal = session.exec(
        select(SignalRecord)
        .where(SignalRecord.symbol == entry.underlying_symbol)
        .order_by(desc(SignalRecord.timestamp))
    ).first()
    reality = asset_reality(
        session,
        entry.underlying_symbol,
        as_of=latest_signal.timestamp if latest_signal else latest_run.completed_at if latest_run else None,
        data_quality=latest_signal.data_quality if latest_signal else "fixture",
        features=latest_signal.features_json if latest_signal else None,
        tradable_symbol=entry.tradable_symbol,
    )
    penalties = reality.penalties
    total_penalty = sum(item.score_penalty for item in penalties)
    gate_results = {
        "robustness_score": robustness_score >= 65,
        "walk_forward_quality": walk_forward_quality >= 0.55,
        "forward_results": forward_summary.expectancy_proxy > 0 and forward_summary.hit_rate >= 0.5,
        "minimum_sample_size": forward_summary.sample_size >= 3,
        "data_quality": not reality.promotion_blocked,
        "proxy_grade_penalty": not entry.proxy_grade or total_penalty <= 24,
    }
    recommended_state = "experimental"
    if all(gate_results.values()):
        recommended_state = "promoted"
    elif gate_results["robustness_score"] and gate_results["walk_forward_quality"]:
        recommended_state = "paper_validating"
    if entry.lifecycle_state == "demoted" and recommended_state == "experimental":
        recommended_state = "demoted"
    if entry.lifecycle_state == "promoted" and (not gate_results["forward_results"] or forward_summary.expectancy_proxy < 0):
        recommended_state = "demoted"
    notes = [
        "Calibration buckets compare cohorts only. They are not probability-of-profit estimates.",
        f"Total realism penalty: {total_penalty:.1f}",
        f"Freshness policy: {reality.freshness_state}",
        f"Realism score: {reality.realism_score:.1f}",
    ]
    return PromotionRationaleView(
        state=entry.lifecycle_state,
        recommended_state=recommended_state,
        gate_results=gate_results,
        notes=notes,
        penalties=penalties,
    )


def _apply_lifecycle_transition(session: Session, entry: StrategyRegistryEntry, to_state: str, note: str) -> StrategyRegistryEntry:
    if to_state not in LIFECYCLE_STATES:
        raise ValueError(f"Unsupported lifecycle state '{to_state}'.")
    if entry.lifecycle_state == to_state and (entry.lifecycle_note or "") == note:
        return entry
    transition = StrategyStateTransition(
        strategy_name=entry.name,
        from_state=entry.lifecycle_state,
        to_state=to_state,
        changed_at=naive_utc_now(),
        note=note,
    )
    entry.lifecycle_state = to_state
    entry.promoted = to_state == "promoted"
    entry.lifecycle_note = note
    entry.lifecycle_updated_at = transition.changed_at
    session.add(transition)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


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
    _seed_lifecycle_transitions(session)
    _seed_forward_validation_records(session)
    _recompute_calibration_snapshots(session)
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
    for entry in session.exec(select(StrategyRegistryEntry)).all():
        latest_backtest = session.exec(
            select(BacktestResult)
            .where(BacktestResult.strategy_name == entry.name)
            .order_by(desc(BacktestResult.created_at))
        ).first()
        rationale = _promotion_rationale(
            session,
            entry,
            robustness_score=float(latest_backtest.robustness_score) if latest_backtest else 0.0,
            walk_forward_quality=_walk_forward_quality(latest_backtest),
        )
        _apply_lifecycle_transition(session, entry, rationale.recommended_state, "; ".join(rationale.notes))
    for result in session.exec(select(BacktestResult)).all():
        persist_backtest_duckdb(result)


def list_strategies(session: Session) -> list[StrategyRegistryEntry]:
    seed_strategy_lab(session)
    return session.exec(select(StrategyRegistryEntry).order_by(StrategyRegistryEntry.name.asc())).all()


def get_strategy(session: Session, strategy_name: str) -> StrategyRegistryEntry:
    seed_strategy_lab(session)
    return get_registry_entry(session, strategy_name)


def strategy_list_view(session: Session, row: StrategyRegistryEntry) -> StrategyListView:
    latest_run = session.exec(select(PipelineRun).order_by(desc(PipelineRun.started_at))).first()
    latest_signal = session.exec(
        select(SignalRecord)
        .where(SignalRecord.symbol == row.underlying_symbol)
        .order_by(desc(SignalRecord.timestamp))
    ).first()
    return StrategyListView(
        name=row.name,
        version=row.version,
        template=row.template,
        description=row.description,
        underlying_symbol=row.underlying_symbol,
        tradable_symbol=row.tradable_symbol,
        timeframe=row.timeframe,
        warmup_bars=row.warmup_bars,
        fees_bps=row.fees_bps,
        slippage_bps=row.slippage_bps,
        proxy_grade=row.proxy_grade,
        promoted=row.promoted,
        lifecycle_state=row.lifecycle_state,
        lifecycle_updated_at=row.lifecycle_updated_at or naive_utc_now(),
        lifecycle_note=row.lifecycle_note or "",
        tags=row.tags_json,
        validation=row.validation_json,
        data_reality=asset_reality(
            session,
            row.underlying_symbol,
            as_of=latest_signal.timestamp if latest_signal else latest_run.completed_at if latest_run else None,
            data_quality=latest_signal.data_quality if latest_signal else "fixture",
            features=latest_signal.features_json if latest_signal else None,
            tradable_symbol=row.tradable_symbol,
        ),
    )


def strategy_detail_view(session: Session, row: StrategyRegistryEntry) -> StrategyDetailView:
    backtests = session.exec(
        select(BacktestResult)
        .where(BacktestResult.strategy_name == row.name)
        .order_by(desc(BacktestResult.created_at))
    ).all()
    latest_backtest = backtests[0] if backtests else None
    robustness = float(latest_backtest.robustness_score) if latest_backtest else 0.0
    walk_forward_quality = _walk_forward_quality(latest_backtest)
    rationale = _promotion_rationale(session, row, robustness_score=robustness, walk_forward_quality=walk_forward_quality)
    transitions = session.exec(
        select(StrategyStateTransition)
        .where(StrategyStateTransition.strategy_name == row.name)
        .order_by(desc(StrategyStateTransition.changed_at))
    ).all()
    forward_records = session.exec(
        select(ForwardValidationRecord)
        .where(ForwardValidationRecord.strategy_name == row.name)
        .order_by(desc(ForwardValidationRecord.opened_at))
    ).all()
    operator_feedback = _strategy_operator_feedback(session, row.name)
    if operator_feedback is not None:
        rationale.notes = [*rationale.notes, *operator_feedback.notes]
    return StrategyDetailView(
        **strategy_list_view(session, row).model_dump(),
        search_space=row.search_space_json,
        spec=row.spec_json,
        promotion_rationale=rationale,
        operator_feedback_summary=operator_feedback,
        calibration_summary=_calibration_snapshots(session, row.name),
        forward_validation_summary=_aggregate_forward_validation(session, row.name),
        forward_validation_records=[_forward_validation_view(item) for item in forward_records],
        data_realism_penalties=rationale.penalties,
        transition_history=[_transition_view(item) for item in transitions],
    )


def list_backtests(session: Session) -> list[BacktestResult]:
    seed_strategy_lab(session)
    return session.exec(select(BacktestResult).order_by(BacktestResult.created_at.desc())).all()


def get_backtest(session: Session, run_id: int) -> BacktestResult | None:
    seed_strategy_lab(session)
    return session.exec(select(BacktestResult).where(BacktestResult.id == run_id)).first()


def backtest_list_view(session: Session, row: BacktestResult) -> BacktestListView:
    entry = get_registry_entry(session, row.strategy_name)
    penalties = _data_realism_penalties(session, entry)
    reality = asset_reality(
        session,
        entry.underlying_symbol,
        as_of=row.completed_at or row.created_at,
        data_quality="fixture",
        tradable_symbol=entry.tradable_symbol,
    )
    return BacktestListView(
        id=row.id or 0,
        strategy_name=row.strategy_name,
        engine=row.engine,
        status=row.status,
        symbol=row.symbol,
        timeframe=row.timeframe,
        created_at=row.created_at,
        proxy_grade=row.proxy_grade,
        promoted_candidate=row.promoted_candidate,
        search_method=row.search_method,
        robustness_score=row.robustness_score,
        net_return_pct=row.net_return_pct,
        sharpe_ratio=row.sharpe_ratio,
        max_drawdown_pct=row.max_drawdown_pct,
        trade_count=row.trade_count,
        lifecycle_state=entry.lifecycle_state,
        data_realism_penalties=penalties,
        data_reality=reality,
    )


def backtest_detail_view(session: Session, row: BacktestResult) -> BacktestDetailView:
    entry = get_registry_entry(session, row.strategy_name)
    rationale = _promotion_rationale(
        session,
        entry,
        robustness_score=row.robustness_score,
        walk_forward_quality=_walk_forward_quality(row),
    )
    return BacktestDetailView(
        **backtest_list_view(session, row).model_dump(),
        completed_at=row.completed_at,
        fees_bps=row.fees_bps,
        slippage_bps=row.slippage_bps,
        warmup_bars=row.warmup_bars,
        validation=row.validation_json,
        summary=row.summary_json,
        equity_curve=row.equity_curve_json,
        trades=row.trades_json,
        stability_heatmap=row.stability_heatmap_json,
        regime_summary=row.regime_summary_json,
        metadata=row.metadata_json,
        promotion_rationale=rationale,
        forward_validation_summary=_aggregate_forward_validation(session, row.strategy_name),
        calibration_summary=_calibration_snapshots(session, row.strategy_name),
    )


def transition_strategy_lifecycle(session: Session, strategy_name: str, request: StrategyLifecycleUpdateRequest) -> StrategyRegistryEntry:
    entry = get_strategy(session, strategy_name)
    updated = _apply_lifecycle_transition(session, entry, request.to_state, request.note)
    sync_strategy_registry_duckdb(session.exec(select(StrategyRegistryEntry)).all())
    return updated


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

    now = naive_utc_now()
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
    session.commit()
    session.refresh(result)
    trade_samples = evaluation["validation"]["trades"][:4]
    for index, trade in enumerate(trade_samples):
        session.add(
            ForwardValidationRecord(
                validation_id=f"{spec.name}_{result.id}_{index}",
                strategy_name=spec.name,
                mode="paper_trade",
                signal_id=None,
                risk_report_id=None,
                trade_id=None,
                opened_at=_parse_iso(str(trade["entry_time"])) if isinstance(trade["entry_time"], str) else trade["entry_time"],
                closed_at=_parse_iso(str(trade["exit_time"])) if isinstance(trade["exit_time"], str) else trade["exit_time"],
                entry_price=float(trade["entry_price"]),
                exit_price=float(trade["exit_price"]),
                pnl_pct=float(trade["pnl_pct"]),
                drawdown_pct=float(min(0.0, trade["pnl_pct"])),
                target_attained=float(trade["pnl_pct"]) > 1.5,
                invalidated=float(trade["pnl_pct"]) < -1.0,
                time_stopped=abs(float(trade["pnl_pct"])) < 0.4,
                data_quality="paper",
                notes="Persisted from validation runner.",
            )
        )
    session.commit()
    _recompute_calibration_snapshots(session)
    rationale = _promotion_rationale(
        session,
        registry_entry,
        robustness_score=robustness,
        walk_forward_quality=float(walk_forward["positive_window_ratio"]),
    )
    next_state = rationale.recommended_state
    if promoted and next_state == "paper_validating":
        next_state = "paper_validating"
    _apply_lifecycle_transition(session, registry_entry, next_state, "; ".join(rationale.notes))
    sync_strategy_registry_duckdb(session.exec(select(StrategyRegistryEntry)).all())
    persist_backtest_duckdb(result)
    return result
