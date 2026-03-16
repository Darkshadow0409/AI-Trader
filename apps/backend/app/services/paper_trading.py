from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, desc, select

from app.alerting import choose_channel_targets, dispatch_alert, stable_alert_id
from app.core.clock import naive_utc_now
from app.core.telemetry import record_paper_trade_event
from app.models.entities import AlertRecord, MarketBar, NewsItem, PaperTradeRecord, PaperTradeReviewRecord, StrategyRegistryEntry
from app.models.schemas import (
    AlertEnvelope,
    ExecutionQualityView,
    ExecutionRealismView,
    PaperTradeAdherenceView,
    PaperTradeAnalyticsBucketView,
    PaperTradeFailureCategoryView,
    PaperTradeHygieneSummaryView,
    PaperTradeAnalyticsView,
    PaperTradeCloseRequest,
    PaperTradeDetailView,
    PaperTradeOpenRequest,
    PaperTradeOutcomeView,
    PaperTradePartialExitRequest,
    PaperTradeProposalRequest,
    PaperTradeReviewRequest,
    PaperTradeReviewView,
    PaperTradeScaleRequest,
    ScenarioStressItemView,
    PaperTradeView,
    RiskView,
    SignalView,
    TradeTimelineEventView,
    TradeTimelineView,
)
from app.services.dashboard_data import list_risk_views, list_signal_views
from app.services.data_reality import asset_reality, freshness_minutes
from app.strategy_lab.service import _promotion_rationale


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"
ACTIVE_PAPER_STATUSES = {"opened", "scaled_in", "partially_exited"}
CLOSED_PAPER_STATUSES = {"closed_win", "closed_loss", "invalidated", "timed_out", "cancelled"}
PAPER_STATUSES = {"proposed", *ACTIVE_PAPER_STATUSES, *CLOSED_PAPER_STATUSES}
OPERATOR_FAILURE_CATEGORIES = {"operator_timing", "operator_sizing", "realism_ignored", "execution_plan_violation"}
SCENARIO_SHOCKS = {
    "btc_down": {"BTC": -8.0, "ETH": -10.5, "WTI": -2.0, "GOLD": 1.2, "SILVER": 0.8},
    "btc_up": {"BTC": 7.0, "ETH": 8.6, "WTI": 0.7, "GOLD": -0.4, "SILVER": 0.3},
    "oil_spike": {"WTI": 8.5, "BTC": -1.2, "ETH": -1.4, "GOLD": 1.1, "SILVER": 0.9},
    "oil_drop": {"WTI": -7.5, "BTC": 0.6, "ETH": 0.4, "GOLD": -0.5, "SILVER": -0.3},
    "dxy_up": {"BTC": -4.5, "ETH": -5.1, "WTI": -1.8, "GOLD": -2.2, "SILVER": -2.5},
    "dxy_down": {"BTC": 3.8, "ETH": 4.2, "WTI": 1.1, "GOLD": 1.7, "SILVER": 2.0},
    "yield_shock": {"BTC": -3.9, "ETH": -4.3, "WTI": -1.0, "GOLD": -2.8, "SILVER": -2.2},
    "vol_spike": {"BTC": -6.2, "ETH": -7.0, "WTI": -3.1, "GOLD": 0.7, "SILVER": -1.4},
}


def _stable_id(prefix: str, *parts: object) -> str:
    key = "|".join(str(part) for part in parts)
    return f"{prefix}_{uuid5(NAMESPACE_URL, key).hex}"


def _parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed
    return parsed.astimezone(UTC).replace(tzinfo=None)


def _round_dict(values: dict[str, Any]) -> dict[str, float]:
    return {str(key): round(float(value), 4) for key, value in values.items()}


def _bucket_label(score: float) -> str:
    if score >= 60:
        return "top"
    if score >= 40:
        return "middle"
    return "low"


def _realism_bucket(realism_score: float) -> str:
    if realism_score >= 60:
        return "strong"
    if realism_score >= 45:
        return "usable"
    return "weak"


def _normalize_failure_categories(values: list[str] | None, primary: str = "") -> list[str]:
    normalized: list[str] = []
    for item in ([primary] if primary else []) + list(values or []):
        candidate = str(item).strip()
        if candidate and candidate not in normalized:
            normalized.append(candidate)
    return normalized


def _signal_maps(session: Session) -> tuple[dict[str, SignalView], dict[str, RiskView]]:
    signals = {row.signal_id: row for row in list_signal_views(session)}
    risks = {row.risk_report_id: row for row in list_risk_views(session)}
    return signals, risks


def _lifecycle_event(status: str, note: str, **payload: object) -> dict[str, Any]:
    return {
        "status": status,
        "note": note,
        "timestamp": naive_utc_now().isoformat(),
        **payload,
    }


def _require_status(row: PaperTradeRecord, allowed_statuses: set[str], action: str) -> None:
    if row.status not in allowed_statuses:
        allowed = ", ".join(sorted(allowed_statuses))
        raise ValueError(f"Cannot {action} a paper trade in status '{row.status}'. Allowed statuses: {allowed}.")


def _market_window(session: Session, symbol: str, opened_at: datetime | None, closed_at: datetime | None) -> list[MarketBar]:
    if opened_at is None:
        return []
    end_time = closed_at or naive_utc_now()
    return session.exec(
        select(MarketBar)
        .where(MarketBar.symbol == symbol)
        .where(MarketBar.timestamp >= opened_at)
        .where(MarketBar.timestamp <= end_time)
        .order_by(MarketBar.timestamp.asc())
    ).all()


def _entry_quality(side: str, zone: dict[str, Any], actual_entry: float | None) -> tuple[str, float]:
    if actual_entry is None:
        return "pending", 0.0
    low = float(zone.get("low") or actual_entry)
    high = float(zone.get("high") or actual_entry)
    midpoint = (low + high) / 2 if high and low else actual_entry
    if low <= actual_entry <= high:
        return "inside_zone", round(((actual_entry - midpoint) / midpoint) * 100 if midpoint else 0.0, 2)
    if side == "long":
        if actual_entry < low:
            return "better_than_zone", round(((actual_entry - low) / low) * 100 if low else 0.0, 2)
        return "worse_than_zone", round(((actual_entry - high) / high) * 100 if high else 0.0, 2)
    if actual_entry > high:
        return "better_than_zone", round(((high - actual_entry) / high) * 100 if high else 0.0, 2)
    return "worse_than_zone", round(((low - actual_entry) / low) * 100 if low else 0.0, 2)


def _unrealized_close(session: Session, trade: PaperTradeRecord) -> float | None:
    latest_bar = session.exec(
        select(MarketBar).where(MarketBar.symbol == trade.symbol).order_by(desc(MarketBar.timestamp))
    ).first()
    return latest_bar.close if latest_bar else None


def _pnl_pct(side: str, entry: float | None, exit_price: float | None) -> float:
    if entry is None or exit_price is None or entry == 0:
        return 0.0
    if side == "short":
        return round(((entry - exit_price) / entry) * 100, 2)
    return round(((exit_price - entry) / entry) * 100, 2)


def _target_attainment(side: str, targets: dict[str, Any], bars: list[MarketBar], close_price: float | None) -> str:
    base = float(targets.get("base") or 0.0)
    stretch = float(targets.get("stretch") or 0.0)
    if not base and not stretch:
        return "none"
    highs = [bar.high for bar in bars]
    lows = [bar.low for bar in bars]
    if side == "short":
        if stretch and lows and min(lows) <= stretch:
            return "stretch"
        if base and lows and min(lows) <= base:
            return "base"
        if close_price is not None and stretch and close_price <= stretch:
            return "stretch"
        if close_price is not None and base and close_price <= base:
            return "base"
    else:
        if stretch and highs and max(highs) >= stretch:
            return "stretch"
        if base and highs and max(highs) >= base:
            return "base"
        if close_price is not None and stretch and close_price >= stretch:
            return "stretch"
        if close_price is not None and base and close_price >= base:
            return "base"
    return "none"


def _excursions(side: str, entry: float | None, bars: list[MarketBar]) -> tuple[float, float]:
    if entry is None or not bars or entry == 0:
        return 0.0, 0.0
    if side == "short":
        mfe = max(((entry - bar.low) / entry) * 100 for bar in bars)
        mae = min(((entry - bar.high) / entry) * 100 for bar in bars)
    else:
        mfe = max(((bar.high - entry) / entry) * 100 for bar in bars)
        mae = min(((bar.low - entry) / entry) * 100 for bar in bars)
    return round(mfe, 2), round(mae, 2)


def _stop_adherence(trade: PaperTradeRecord, close_price: float | None) -> bool:
    if trade.status in {"invalidated", "closed_loss"}:
        if close_price is None or trade.actual_entry is None:
            return True
        if trade.side == "short":
            return close_price >= trade.stop_price
        return close_price <= trade.stop_price or trade.close_reason in {"stop_hit", "invalidated"}
    return True


def _base_slippage_bps(symbol: str, data_quality: str, source_timing: str, asset_class: str) -> tuple[float, float]:
    entry_bps = 6.0
    stop_bps = 10.0
    if asset_class in {"commodity", "macro"}:
        entry_bps += 8.0
        stop_bps += 12.0
    if symbol in {"WTI", "GOLD", "SILVER"}:
        entry_bps += 6.0
        stop_bps += 8.0
    if source_timing in {"delayed", "end_of_day", "fixture"}:
        entry_bps += 4.0
        stop_bps += 6.0
    if data_quality == "paper":
        stop_bps += 2.0
    return round(entry_bps, 2), round(stop_bps, 2)


def _target_fill_mode(source_timing: str, execution_suitability: str) -> str:
    if execution_suitability in {"context_only", "research_only"}:
        return "close_confirmation"
    if source_timing in {"delayed", "end_of_day", "fixture"}:
        return "conservative_touch"
    return "touch"


def _gap_through_stop_flag(trade: PaperTradeRecord, bars: list[MarketBar]) -> bool:
    if trade.actual_entry is None or not bars:
        return False
    if trade.side == "short":
        return any(bar.high >= trade.stop_price * 1.002 for bar in bars)
    return any(bar.low <= trade.stop_price * 0.998 for bar in bars)


def _execution_realism(
    trade: PaperTradeRecord,
    reality: Any | None,
    signal: SignalView | None,
    bars: list[MarketBar],
) -> ExecutionRealismView:
    provenance = reality.provenance if reality is not None else None
    asset_class = provenance.asset_class if provenance is not None else "unknown"
    source_timing = provenance.source_timing if provenance is not None else "fixture"
    entry_bps, stop_bps = _base_slippage_bps(trade.symbol, trade.data_quality, source_timing, asset_class)
    event_latency_penalty = 0.0
    if signal is not None and signal.signal_type == "event_driven":
        event_latency_penalty += 8.0
    if reality is not None and reality.event_recency_minutes is not None and reality.event_recency_minutes <= 180:
        event_latency_penalty += 6.0
    delayed_penalty = 0.0
    if source_timing == "near_live":
        delayed_penalty = 1.5
    elif source_timing == "delayed":
        delayed_penalty = 4.0
    elif source_timing in {"end_of_day", "fixture"}:
        delayed_penalty = 6.0
    target_fill_mode = _target_fill_mode(source_timing, reality.execution_suitability if reality is not None else "research_only")
    effective_entry = None
    if trade.actual_entry is not None:
        direction = 1 if trade.side != "short" else -1
        effective_entry = round(trade.actual_entry * (1 + direction * ((entry_bps + event_latency_penalty + delayed_penalty) / 10000)), 4)
    direction = 1 if trade.side != "short" else -1
    effective_stop = round(trade.stop_price * (1 - direction * (stop_bps / 10000)), 4)
    fill_note = "Execution realism is deterministic and local-only; it is not a real fill record."
    if reality is not None and reality.execution_suitability in {"context_only", "research_only"}:
        fill_note = f"{fill_note} Current data reality is {reality.execution_suitability}."
    return ExecutionRealismView(
        entry_slippage_bps=entry_bps,
        stop_slippage_bps=stop_bps,
        target_fill_mode=target_fill_mode,
        gap_through_stop_flag=_gap_through_stop_flag(trade, bars),
        event_latency_penalty=round(event_latency_penalty, 2),
        delayed_source_penalty=round(delayed_penalty, 2),
        effective_entry=effective_entry,
        effective_stop=effective_stop,
        fill_note=fill_note,
    )


def _execution_quality(
    trade: PaperTradeRecord,
    signal: SignalView | None,
    reality: Any | None,
    outcome: PaperTradeOutcomeView | None,
    realism: ExecutionRealismView,
) -> ExecutionQualityView:
    signal_quality = "strong"
    if signal is not None and (signal.score < 40 or signal.noise_probability >= 0.35):
        signal_quality = "fragile"
    elif signal is not None and signal.score < 60:
        signal_quality = "mixed"
    plan_quality = "disciplined"
    if reality is not None and reality.execution_suitability in {"context_only", "research_only"}:
        plan_quality = "context_limited"
    elif outcome is not None and outcome.entry_quality_label == "worse_than_zone":
        plan_quality = "stretched"
    execution_quality = "clean"
    if realism.gap_through_stop_flag:
        execution_quality = "gap_risk"
    elif (realism.entry_slippage_bps + realism.stop_slippage_bps + realism.event_latency_penalty + realism.delayed_source_penalty) >= 28:
        execution_quality = "penalized"
    notes: list[str] = []
    if signal is not None:
        notes.append(f"Signal bucket uses score {signal.score:.1f} and noise {signal.noise_probability:.2f}.")
    if reality is not None:
        notes.append(reality.tradable_alignment_note)
    if outcome is not None and outcome.entry_quality_label != "inside_zone":
        notes.append(f"Entry quality was {outcome.entry_quality_label}.")
    return ExecutionQualityView(
        signal_quality=signal_quality,
        plan_quality=plan_quality,
        execution_quality=execution_quality,
        slippage_penalty_bps=round(realism.entry_slippage_bps + realism.stop_slippage_bps, 2),
        latency_penalty=realism.event_latency_penalty,
        delayed_penalty=realism.delayed_source_penalty,
        notes=notes,
    )


def _scenario_shock(symbol: str, scenario: str) -> float:
    normalized = symbol.upper()
    return round(SCENARIO_SHOCKS.get(scenario, {}).get(normalized, SCENARIO_SHOCKS.get(scenario, {}).get("BTC", 0.0)), 2)


def _trade_scenario_stress(
    trade: PaperTradeRecord,
    signal: SignalView | None,
    reality: Any | None,
) -> list[ScenarioStressItemView]:
    score = signal.score if signal is not None else 50.0
    confidence = signal.confidence if signal is not None else 0.5
    items: list[ScenarioStressItemView] = []
    for scenario in ("btc_down", "btc_up", "oil_spike", "oil_drop", "dxy_up", "dxy_down", "yield_shock", "vol_spike"):
        shock_pct = _scenario_shock(trade.symbol, scenario)
        severity = "info"
        if abs(shock_pct) >= 6:
            severity = "warning"
        if abs(shock_pct) >= 8:
            severity = "critical"
        confidence_impact = round((abs(shock_pct) / 20) + ((reality.ranking_penalty / 100) if reality is not None else 0.0), 2)
        pnl_impact = round(shock_pct * (1 if trade.side != "short" else -1), 2)
        items.append(
            ScenarioStressItemView(
                scenario=scenario,
                entity_type="paper_trade",
                entity_id=trade.trade_id,
                symbol=trade.symbol,
                severity=severity,
                shock_pct=shock_pct,
                pnl_impact_pct=pnl_impact,
                confidence_impact=round(min(1.0, confidence_impact + max(0.0, (60 - score) / 100)), 2),
                rationale=f"{trade.symbol} stress uses deterministic {scenario} shock with base confidence {confidence:.2f}.",
            )
        )
    return items


def _plan_flags(trade: PaperTradeRecord, entry_label: str, target_attainment: str) -> dict[str, bool]:
    return {
        "entry_in_zone": entry_label == "inside_zone",
        "size_defined": bool(trade.size_plan_json),
        "target_reached": target_attainment in {"base", "stretch"},
        "stop_respected": trade.close_reason in {"stop_hit", "invalidated"} or trade.status not in {"closed_loss", "invalidated"},
    }


def _compute_outcome(session: Session, trade: PaperTradeRecord) -> PaperTradeOutcomeView:
    entry_label, zone_delta_pct = _entry_quality(trade.side, trade.proposed_entry_zone_json, trade.actual_entry)
    effective_close = trade.close_price if trade.closed_at else _unrealized_close(session, trade)
    bars = _market_window(session, trade.symbol, trade.opened_at, trade.closed_at)
    mfe_pct, mae_pct = _excursions(trade.side, trade.actual_entry, bars)
    target_attainment = _target_attainment(trade.side, trade.targets_json, bars, effective_close)
    time_to_outcome = 0
    if trade.opened_at is not None:
        end_time = trade.closed_at or naive_utc_now()
        time_to_outcome = max(0, int((end_time - trade.opened_at).total_seconds() // 60))
    realized_pnl_pct = _pnl_pct(trade.side, trade.actual_entry, effective_close)
    return PaperTradeOutcomeView(
        entry_quality_label=entry_label,
        entry_zone_delta_pct=zone_delta_pct,
        stop_adherence=_stop_adherence(trade, effective_close),
        target_attainment=target_attainment,
        time_to_outcome_minutes=time_to_outcome,
        mfe_pct=mfe_pct,
        mae_pct=mae_pct,
        plan_adherence_flags=_plan_flags(trade, entry_label, target_attainment),
        realized_pnl_pct=realized_pnl_pct,
    )


def _review_view(row: PaperTradeReviewRecord | None) -> PaperTradeReviewView | None:
    if row is None:
        return None
    return PaperTradeReviewView(
        review_id=row.review_id,
        trade_id=row.trade_id,
        thesis_respected=row.thesis_respected,
        invalidation_respected=row.invalidation_respected,
        entered_inside_suggested_zone=row.entered_inside_suggested_zone,
        time_stop_respected=row.time_stop_respected,
        entered_too_early=row.entered_too_early,
        entered_too_late=row.entered_too_late,
        oversized=row.oversized,
        undersized=row.undersized,
        realism_warning_ignored=row.realism_warning_ignored,
        size_plan_respected=row.size_plan_respected,
        exited_per_plan=row.exited_per_plan,
        catalyst_mattered=row.catalyst_mattered,
        failure_category=row.failure_category,
        failure_categories=_normalize_failure_categories(row.failure_categories_json, row.failure_category),
        operator_notes=row.operator_notes,
        updated_at=row.updated_at,
    )


def _adherence_view(trade: PaperTradeRecord, outcome: PaperTradeOutcomeView | None, review: PaperTradeReviewRecord | None) -> PaperTradeAdherenceView:
    entry_in_zone_default = None if trade.actual_entry is None or outcome is None else outcome.entry_quality_label == "inside_zone"
    time_stop_default = None if trade.status != "timed_out" and trade.close_reason != "time_stop" else True
    size_plan_default = None
    if review is not None and review.oversized is not None and review.undersized is not None:
        size_plan_default = not review.oversized and not review.undersized
    elif review is not None and (review.oversized is True or review.undersized is True):
        size_plan_default = False
    exited_per_plan_default = None
    if trade.closed_at is not None:
        exited_per_plan_default = trade.close_reason in {"target_hit", "target_partial", "time_stop", "stop_hit", "invalidated"}
        if outcome is not None and outcome.target_attainment in {"base", "stretch"}:
            exited_per_plan_default = True

    adherence = {
        "entered_inside_suggested_zone": review.entered_inside_suggested_zone if review is not None and review.entered_inside_suggested_zone is not None else entry_in_zone_default,
        "invalidation_respected": review.invalidation_respected if review is not None else None,
        "time_stop_respected": review.time_stop_respected if review is not None and review.time_stop_respected is not None else time_stop_default,
        "realism_warning_ignored": review.realism_warning_ignored if review is not None else None,
        "size_plan_respected": review.size_plan_respected if review is not None and review.size_plan_respected is not None else size_plan_default,
        "exited_per_plan": review.exited_per_plan if review is not None and review.exited_per_plan is not None else exited_per_plan_default,
    }
    scored_values: list[bool] = []
    breached_rules: list[str] = []
    for key, value in adherence.items():
        if value is None:
            continue
        is_positive = (not value) if key == "realism_warning_ignored" else bool(value)
        scored_values.append(is_positive)
        if not is_positive:
            breached_rules.append(key)
    adherence_score = round(sum(1 for value in scored_values if value) / len(scored_values), 2) if scored_values else 0.0
    return PaperTradeAdherenceView(
        **adherence,
        adherence_score=adherence_score,
        breached_rules=breached_rules,
    )


def _timeline_event(
    timestamp: datetime,
    phase: str,
    event_type: str,
    title: str,
    note: str,
    *,
    price: float | None = None,
    related_alert_ids: list[str] | None = None,
) -> TradeTimelineEventView:
    return TradeTimelineEventView(
        timestamp=timestamp,
        phase=phase,
        event_type=event_type,
        title=title,
        note=note,
        price=price,
        related_alert_ids=related_alert_ids or [],
    )


def build_trade_timeline(
    session: Session,
    trade: PaperTradeRecord,
    signal: SignalView | None,
    risk: RiskView | None,
) -> TradeTimelineView:
    news_rows = session.exec(select(NewsItem).order_by(desc(NewsItem.published_at))).all()
    alerts = session.exec(select(AlertRecord).where(AlertRecord.trade_id == trade.trade_id).order_by(AlertRecord.created_at.asc())).all()
    alert_ids = [row.alert_id for row in alerts]
    pre_event: list[TradeTimelineEventView] = []
    event_trigger: list[TradeTimelineEventView] = []
    post_event: list[TradeTimelineEventView] = []
    trade_actions: list[TradeTimelineEventView] = []
    progression: list[TradeTimelineEventView] = []

    if signal is not None:
        pre_event.append(
            _timeline_event(
                signal.timestamp,
                "pre_event",
                "signal",
                f"{signal.symbol} {signal.signal_type}",
                signal.thesis,
                price=float(signal.features.get("close") or 0.0) or None,
            )
        )
    if risk is not None:
        pre_event.append(
            _timeline_event(
                risk.as_of,
                "pre_event",
                "risk",
                f"{risk.symbol} risk report",
                f"Size band {risk.size_band}, stop {risk.stop_price:.2f}.",
                price=risk.stop_price,
            )
        )
    for row in news_rows:
        if trade.symbol not in row.title and trade.symbol not in row.summary and trade.symbol not in row.tags_json:
            continue
        event_time = row.published_at
        if trade.opened_at is not None and abs((event_time - trade.opened_at).total_seconds()) <= 6 * 3600:
            event_trigger.append(
                _timeline_event(
                    event_time,
                    "event_trigger",
                    "news",
                    row.title,
                    row.summary,
                )
            )
    for event in trade.lifecycle_events_json:
        timestamp = _parse_iso(str(event.get("timestamp")))
        price = event.get("actual_entry") or event.get("close_price") or event.get("stop_price")
        trade_actions.append(
            _timeline_event(
                timestamp,
                "trade_action",
                str(event.get("status", "trade_action")),
                f"{trade.symbol} {event.get('status', 'action')}",
                str(event.get("note", "")),
                price=float(price) if price is not None else None,
                related_alert_ids=alert_ids,
            )
        )
    if trade.opened_at is not None:
        bars = _market_window(session, trade.symbol, trade.opened_at, trade.closed_at)
        if bars:
            first_bar = bars[0]
            last_bar = bars[-1]
            progression.append(
                _timeline_event(
                    first_bar.timestamp,
                    "progression",
                    "pre_event_state",
                    "Initial post-entry state",
                    f"Opened near {trade.actual_entry or first_bar.close:.2f}.",
                    price=trade.actual_entry or first_bar.close,
                )
            )
            progression.append(
                _timeline_event(
                    last_bar.timestamp,
                    "progression",
                    "post_event_state",
                    "Latest tracked state",
                    f"Last tracked close {last_bar.close:.2f}.",
                    price=last_bar.close,
                )
            )
            if trade.targets_json.get("base"):
                progression.append(
                    _timeline_event(
                        last_bar.timestamp,
                        "progression",
                        "target_progress",
                        "Target progression",
                        f"Base target {float(trade.targets_json.get('base')):.2f}, stretch {float(trade.targets_json.get('stretch') or 0.0):.2f}.",
                        price=float(trade.targets_json.get("base")),
                    )
                )
    for alert in alerts:
        post_event.append(
            _timeline_event(
                alert.created_at,
                "post_event",
                "alert",
                alert.title,
                alert.body,
                related_alert_ids=[alert.alert_id],
            )
        )
    return TradeTimelineView(
        trade_id=trade.trade_id,
        symbol=trade.symbol,
        generated_at=naive_utc_now(),
        pre_event=sorted(pre_event, key=lambda item: item.timestamp),
        event_trigger=sorted(event_trigger, key=lambda item: item.timestamp),
        post_event=sorted(post_event, key=lambda item: item.timestamp),
        trade_actions=sorted(trade_actions, key=lambda item: item.timestamp),
        progression=sorted(progression, key=lambda item: item.timestamp),
    )


def _trade_view(
    session: Session,
    row: PaperTradeRecord,
    signals: dict[str, SignalView],
    risks: dict[str, RiskView],
    reviews: dict[str, PaperTradeReviewRecord],
) -> PaperTradeView:
    outcome = _compute_outcome(session, row)
    review = reviews.get(row.trade_id)
    adherence = _adherence_view(row, outcome, review)
    linked_signal = signals.get(row.signal_id or "")
    reality = asset_reality(
        session,
        row.symbol,
        as_of=row.opened_at or row.updated_at,
        data_quality=row.data_quality,
        features=linked_signal.features if linked_signal else None,
    )
    bars = _market_window(session, row.symbol, row.opened_at, row.closed_at)
    execution_realism = _execution_realism(row, reality, linked_signal, bars)
    execution_quality = _execution_quality(row, linked_signal, reality, outcome, execution_realism)
    row.outcome_json = outcome.model_dump(mode="json")
    row.entry_slippage_bps = execution_realism.entry_slippage_bps
    row.stop_slippage_bps = execution_realism.stop_slippage_bps
    row.target_fill_mode = execution_realism.target_fill_mode
    row.gap_through_stop_flag = execution_realism.gap_through_stop_flag
    row.event_latency_penalty = execution_realism.event_latency_penalty
    row.delayed_source_penalty = execution_realism.delayed_source_penalty
    session.add(row)
    session.commit()
    return PaperTradeView(
        trade_id=row.trade_id,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        strategy_id=row.strategy_id,
        symbol=row.symbol,
        side=row.side,
        proposed_entry_zone=_round_dict(row.proposed_entry_zone_json),
        actual_entry=row.actual_entry,
        stop=row.stop_price,
        targets=_round_dict(row.targets_json),
        size_plan=row.size_plan_json,
        actual_size=row.actual_size,
        status=row.status,
        opened_at=row.opened_at,
        closed_at=row.closed_at,
        close_reason=row.close_reason,
        close_price=row.close_price,
        notes=row.notes,
        freshness_minutes=freshness_minutes(row.updated_at),
        data_quality=row.data_quality,
        lifecycle_events=row.lifecycle_events_json,
        outcome=outcome,
        execution_realism=execution_realism,
        execution_quality=execution_quality,
        adherence=adherence,
        review_due=row.status in CLOSED_PAPER_STATUSES and review is None,
        data_reality=reality,
    )


def _detail_view(
    session: Session,
    row: PaperTradeRecord,
    signals: dict[str, SignalView],
    risks: dict[str, RiskView],
    reviews: dict[str, PaperTradeReviewRecord],
) -> PaperTradeDetailView:
    base = _trade_view(session, row, signals, risks, reviews)
    linked_signal = signals.get(row.signal_id or "")
    linked_risk = risks.get(row.risk_report_id or "")
    return PaperTradeDetailView(
        **base.model_dump(),
        linked_signal=linked_signal,
        linked_risk=linked_risk,
        review=_review_view(reviews.get(row.trade_id)),
        timeline=build_trade_timeline(session, row, linked_signal, linked_risk),
        scenario_stress=_trade_scenario_stress(row, linked_signal, base.data_reality),
    )


def _seed_trade(session: Session, payload: dict[str, Any]) -> None:
    trade_id = str(payload["trade_id"])
    existing = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if existing is not None:
        return
    session.add(
        PaperTradeRecord(
            trade_id=trade_id,
            signal_id=payload.get("signal_id"),
            risk_report_id=payload.get("risk_report_id"),
            strategy_id=payload.get("strategy_id"),
            symbol=str(payload["symbol"]),
            side=str(payload["side"]),
            proposed_entry_zone_json=payload.get("proposed_entry_zone", {}),
            actual_entry=payload.get("actual_entry"),
            stop_price=float(payload["stop"]),
            targets_json=payload.get("targets", {}),
            size_plan_json=payload.get("size_plan", {}),
            actual_size=float(payload.get("actual_size", 0.0)),
            entry_slippage_bps=float(payload.get("entry_slippage_bps", 0.0)),
            stop_slippage_bps=float(payload.get("stop_slippage_bps", 0.0)),
            target_fill_mode=str(payload.get("target_fill_mode", "touch")),
            gap_through_stop_flag=bool(payload.get("gap_through_stop_flag", False)),
            event_latency_penalty=float(payload.get("event_latency_penalty", 0.0)),
            delayed_source_penalty=float(payload.get("delayed_source_penalty", 0.0)),
            status=str(payload["status"]),
            opened_at=_parse_iso(payload["opened_at"]) if payload.get("opened_at") else None,
            closed_at=_parse_iso(payload["closed_at"]) if payload.get("closed_at") else None,
            close_reason=str(payload.get("close_reason", "")),
            close_price=float(payload["close_price"]) if payload.get("close_price") is not None else None,
            notes=str(payload.get("notes", "")),
            lifecycle_events_json=payload.get("lifecycle_events", []),
            data_quality=str(payload.get("data_quality", "fixture")),
            updated_at=_parse_iso(payload["updated_at"]) if payload.get("updated_at") else naive_utc_now(),
        )
    )


def seed_paper_trades(session: Session) -> None:
    if session.exec(select(PaperTradeRecord)).first() is None:
        payload = json.loads((FIXTURES_DIR / "paper_trades.json").read_text(encoding="utf-8"))
        for item in payload:
            _seed_trade(session, item)
        session.commit()
    if session.exec(select(PaperTradeReviewRecord)).first() is None:
        payload = json.loads((FIXTURES_DIR / "paper_trade_reviews.json").read_text(encoding="utf-8"))
        for item in payload:
            session.add(
                PaperTradeReviewRecord(
                    review_id=str(item["review_id"]),
                    trade_id=str(item["trade_id"]),
                    thesis_respected=item.get("thesis_respected"),
                    invalidation_respected=item.get("invalidation_respected"),
                    entered_inside_suggested_zone=item.get("entered_inside_suggested_zone"),
                    time_stop_respected=item.get("time_stop_respected"),
                    entered_too_early=item.get("entered_too_early"),
                    entered_too_late=item.get("entered_too_late"),
                    oversized=item.get("oversized"),
                    undersized=item.get("undersized"),
                    realism_warning_ignored=item.get("realism_warning_ignored"),
                    size_plan_respected=item.get("size_plan_respected"),
                    exited_per_plan=item.get("exited_per_plan"),
                    catalyst_mattered=item.get("catalyst_mattered"),
                    failure_category=str(item.get("failure_category", "")),
                    failure_categories_json=_normalize_failure_categories(item.get("failure_categories"), str(item.get("failure_category", ""))),
                    operator_notes=str(item.get("operator_notes", "")),
                    updated_at=_parse_iso(item["updated_at"]) if item.get("updated_at") else naive_utc_now(),
                )
            )
        session.commit()


def _all_trade_maps(session: Session) -> tuple[dict[str, SignalView], dict[str, RiskView], dict[str, PaperTradeReviewRecord]]:
    signals, risks = _signal_maps(session)
    reviews = {row.trade_id: row for row in session.exec(select(PaperTradeReviewRecord)).all()}
    return signals, risks, reviews


def list_paper_trades(session: Session, *, statuses: set[str] | None = None) -> list[PaperTradeView]:
    seed_paper_trades(session)
    rows = session.exec(select(PaperTradeRecord).order_by(desc(PaperTradeRecord.updated_at))).all()
    if statuses is not None:
        rows = [row for row in rows if row.status in statuses]
    signals, risks, reviews = _all_trade_maps(session)
    return [_trade_view(session, row, signals, risks, reviews) for row in rows]


def get_paper_trade_detail(session: Session, trade_id: str) -> PaperTradeDetailView | None:
    seed_paper_trades(session)
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    signals, risks, reviews = _all_trade_maps(session)
    return _detail_view(session, row, signals, risks, reviews)


def get_paper_trade_timeline(session: Session, trade_id: str) -> TradeTimelineView | None:
    detail = get_paper_trade_detail(session, trade_id)
    return detail.timeline if detail is not None else None


def get_paper_trade_scenario_stress(session: Session, trade_id: str) -> list[ScenarioStressItemView] | None:
    detail = get_paper_trade_detail(session, trade_id)
    return detail.scenario_stress if detail is not None else None


def create_proposed_paper_trade(session: Session, payload: PaperTradeProposalRequest) -> PaperTradeView:
    signals, risks = _signal_maps(session)
    signal = signals.get(payload.signal_id)
    if signal is None:
        raise ValueError("Signal not found.")
    risk = risks.get(payload.risk_report_id or "") or next(
        (row for row in risks.values() if row.signal_id == signal.signal_id),
        None,
    )
    stale_warning = ""
    if signal.data_reality and signal.data_reality.freshness_state in {"stale", "degraded", "unusable"}:
        stale_warning = (
            f" Freshness warning: signal was {signal.data_reality.freshness_state} at proposal time."
        )
    entry_reference = float(signal.features.get("close") or 0.0)
    atr_14 = float(signal.features.get("atr_14") or max(entry_reference * 0.03, 1.0))
    trade = PaperTradeRecord(
        trade_id=_stable_id("paper_trade", signal.signal_id, payload.strategy_id or "manual"),
        signal_id=signal.signal_id,
        risk_report_id=risk.risk_report_id if risk else payload.risk_report_id,
        strategy_id=payload.strategy_id,
        symbol=(payload.symbol or signal.symbol).upper(),
        side=payload.side or signal.direction,
        proposed_entry_zone_json={
            "low": round(entry_reference - atr_14 * 0.15, 2),
            "high": round(entry_reference + atr_14 * 0.15, 2),
        },
        stop_price=risk.stop_price if risk else signal.invalidation,
        targets_json=signal.targets,
        size_plan_json={
            "size_band": risk.size_band if risk else "small",
            "max_portfolio_risk_pct": risk.max_portfolio_risk_pct if risk else 0.5,
        },
        actual_size=0.0,
        entry_slippage_bps=0.0,
        stop_slippage_bps=0.0,
        target_fill_mode=_target_fill_mode(
            signal.data_reality.provenance.source_timing if signal.data_reality else "fixture",
            signal.data_reality.execution_suitability if signal.data_reality else "research_only",
        ),
        gap_through_stop_flag=False,
        event_latency_penalty=0.0,
        delayed_source_penalty=0.0,
        status="proposed",
        notes=(payload.notes or signal.thesis) + stale_warning,
        lifecycle_events_json=[
            _lifecycle_event(
                "proposed",
                f"Proposed from signal and risk context.{stale_warning}",
                signal_id=signal.signal_id,
            )
        ],
        data_quality=signal.data_quality,
        updated_at=naive_utc_now(),
    )
    session.add(trade)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade.trade_id)  # type: ignore[return-value]


def _apply_transition(row: PaperTradeRecord, to_status: str, note: str, **payload: object) -> None:
    if to_status not in PAPER_STATUSES:
        raise ValueError(f"Unsupported paper-trade status '{to_status}'.")
    from_status = row.status
    row.status = to_status
    row.updated_at = naive_utc_now()
    row.lifecycle_events_json = [*row.lifecycle_events_json, _lifecycle_event(to_status, note, **payload)]
    record_paper_trade_event(row.trade_id, from_status, to_status, note, payload or None)


def open_paper_trade(session: Session, trade_id: str, payload: PaperTradeOpenRequest) -> PaperTradeView | None:
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    _require_status(row, {"proposed"}, "open")
    row.actual_entry = payload.actual_entry
    row.actual_size = payload.actual_size
    row.opened_at = payload.opened_at
    row.notes = payload.notes or row.notes
    _apply_transition(row, "opened", "Paper trade opened.", actual_entry=payload.actual_entry, actual_size=payload.actual_size)
    session.add(row)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade_id)


def scale_paper_trade(session: Session, trade_id: str, payload: PaperTradeScaleRequest) -> PaperTradeView | None:
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    _require_status(row, ACTIVE_PAPER_STATUSES, "scale")
    current_size = row.actual_size or 0.0
    new_size = current_size + payload.added_size
    if new_size <= 0:
        raise ValueError("Scaled size must remain positive.")
    weighted_entry = payload.actual_entry if row.actual_entry is None else ((row.actual_entry * current_size) + (payload.actual_entry * payload.added_size)) / new_size
    row.actual_entry = round(weighted_entry, 4)
    row.actual_size = round(new_size, 4)
    row.notes = payload.notes or row.notes
    _apply_transition(row, "scaled_in", "Paper trade scaled in.", added_size=payload.added_size, actual_entry=payload.actual_entry)
    session.add(row)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade_id)


def partial_exit_paper_trade(session: Session, trade_id: str, payload: PaperTradePartialExitRequest) -> PaperTradeView | None:
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    _require_status(row, ACTIVE_PAPER_STATUSES, "partially exit")
    remaining = max(0.0, (row.actual_size or 0.0) - payload.exit_size)
    row.actual_size = round(remaining, 4)
    row.notes = payload.notes or row.notes
    if remaining == 0:
        row.close_price = payload.exit_price
        row.closed_at = payload.closed_at
        row.close_reason = payload.close_reason
        _apply_transition(row, "closed_win" if _pnl_pct(row.side, row.actual_entry, payload.exit_price) >= 0 else "closed_loss", "Paper trade fully exited from partial exit.", exit_price=payload.exit_price)
    else:
        _apply_transition(row, "partially_exited", "Paper trade partially exited.", exit_price=payload.exit_price, exit_size=payload.exit_size)
    session.add(row)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade_id)


def close_paper_trade(session: Session, trade_id: str, payload: PaperTradeCloseRequest) -> PaperTradeView | None:
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    _require_status(row, ACTIVE_PAPER_STATUSES, "close")
    row.close_price = payload.close_price
    row.closed_at = payload.closed_at
    row.close_reason = payload.close_reason
    row.notes = payload.notes or row.notes
    next_status = "closed_win" if _pnl_pct(row.side, row.actual_entry, payload.close_price) >= 0 else "closed_loss"
    _apply_transition(row, next_status, "Paper trade closed.", close_price=payload.close_price, close_reason=payload.close_reason)
    session.add(row)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade_id)


def invalidate_paper_trade(session: Session, trade_id: str, note: str = "") -> PaperTradeView | None:
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    _require_status(row, ACTIVE_PAPER_STATUSES, "invalidate")
    row.close_price = row.stop_price
    row.closed_at = naive_utc_now()
    row.close_reason = "invalidated"
    row.notes = note or row.notes
    _apply_transition(row, "invalidated", "Paper trade invalidated.", stop_price=row.stop_price)
    session.add(row)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade_id)


def timeout_paper_trade(session: Session, trade_id: str, note: str = "") -> PaperTradeView | None:
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    _require_status(row, ACTIVE_PAPER_STATUSES, "time out")
    row.close_price = _unrealized_close(session, row)
    row.closed_at = naive_utc_now()
    row.close_reason = "time_stop"
    row.notes = note or row.notes
    _apply_transition(row, "timed_out", "Paper trade timed out.")
    session.add(row)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade_id)


def cancel_paper_trade(session: Session, trade_id: str, note: str = "") -> PaperTradeView | None:
    row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if row is None:
        return None
    _require_status(row, {"proposed"}, "cancel")
    row.closed_at = naive_utc_now()
    row.close_reason = "cancelled"
    row.notes = note or row.notes
    _apply_transition(row, "cancelled", "Paper trade cancelled.")
    session.add(row)
    session.commit()
    refresh_paper_trade_alerts(session)
    return get_paper_trade_detail(session, trade_id)


def upsert_paper_trade_review(session: Session, trade_id: str, payload: PaperTradeReviewRequest) -> PaperTradeReviewView | None:
    trade = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade_id)).first()
    if trade is None:
        return None
    review = session.exec(select(PaperTradeReviewRecord).where(PaperTradeReviewRecord.trade_id == trade_id)).first()
    if review is None:
        review = PaperTradeReviewRecord(review_id=_stable_id("review", trade_id), trade_id=trade_id)
    for field, value in payload.model_dump().items():
        if field == "failure_categories":
            review.failure_categories_json = _normalize_failure_categories(value, payload.failure_category)
        else:
            setattr(review, field, value)
    review.failure_categories_json = _normalize_failure_categories(review.failure_categories_json, review.failure_category)
    review.updated_at = naive_utc_now()
    session.add(review)
    session.commit()
    session.refresh(review)
    return _review_view(review)


def list_paper_trade_reviews(session: Session) -> list[PaperTradeReviewView]:
    seed_paper_trades(session)
    rows = session.exec(select(PaperTradeReviewRecord).order_by(desc(PaperTradeReviewRecord.updated_at))).all()
    return [_review_view(row) for row in rows if _review_view(row) is not None]


def _aggregate_bucket(grouping: str, key: str, trades: list[PaperTradeView], signals: dict[str, SignalView]) -> PaperTradeAnalyticsBucketView:
    count = len(trades)
    outcomes = [trade.outcome for trade in trades if trade.outcome is not None]
    hit_rate = sum(1 for item in outcomes if item and item.realized_pnl_pct > 0) / count if count else 0.0
    expectancy_proxy = sum(item.realized_pnl_pct for item in outcomes if item is not None) / count if count else 0.0
    target_rate = sum(1 for item in outcomes if item and item.target_attainment in {"base", "stretch"}) / count if count else 0.0
    invalidation_rate = sum(1 for trade in trades if trade.status == "invalidated") / count if count else 0.0
    avg_entry_delta = sum(item.entry_zone_delta_pct for item in outcomes if item is not None) / count if count else 0.0
    avg_mfe = sum(item.mfe_pct for item in outcomes if item is not None) / count if count else 0.0
    avg_mae = sum(item.mae_pct for item in outcomes if item is not None) / count if count else 0.0
    return PaperTradeAnalyticsBucketView(
        grouping=grouping,
        key=key,
        trade_count=count,
        hit_rate=round(hit_rate, 2),
        expectancy_proxy=round(expectancy_proxy, 2),
        target_attainment_rate=round(target_rate, 2),
        invalidation_rate=round(invalidation_rate, 2),
        avg_entry_zone_delta_pct=round(avg_entry_delta, 2),
        avg_mfe_pct=round(avg_mfe, 2),
        avg_mae_pct=round(avg_mae, 2),
    )


def _hygiene_summary(
    closed: list[PaperTradeView],
    reviews: dict[str, PaperTradeReviewRecord],
    strategy_lifecycle: dict[str, str],
) -> tuple[PaperTradeHygieneSummaryView, list[str]]:
    reviewed = [trade for trade in closed if trade.trade_id in reviews]
    adherence_values = [trade.adherence.adherence_score for trade in reviewed if trade.adherence is not None]
    invalidation_checks = [trade.adherence.invalidation_respected for trade in reviewed if trade.adherence and trade.adherence.invalidation_respected is not None]
    realism_violations = [
        trade for trade in reviewed if trade.adherence and trade.adherence.realism_warning_ignored is True
    ]
    invalidation_breaches = [
        trade for trade in reviewed if trade.adherence and trade.adherence.invalidation_respected is False
    ]
    poor_streak = 0
    for trade in sorted(closed, key=lambda item: item.closed_at or naive_utc_now(), reverse=True):
        if trade.adherence is None or trade.adherence.adherence_score >= 0.67:
            break
        poor_streak += 1
    promoted_groups: dict[str, list[PaperTradeView]] = {}
    for trade in closed:
        lifecycle_state = strategy_lifecycle.get(trade.strategy_id or "", "manual")
        if lifecycle_state == "promoted":
            promoted_groups.setdefault(trade.strategy_id or "manual", []).append(trade)
    drift: list[str] = []
    for strategy_name, rows in promoted_groups.items():
        expectancy = sum((row.outcome.realized_pnl_pct if row.outcome else 0.0) for row in rows) / len(rows)
        adherence = sum((row.adherence.adherence_score if row.adherence else 0.0) for row in rows) / len(rows)
        if expectancy < 0 or adherence < 0.6:
            drift.append(strategy_name)
    return (
        PaperTradeHygieneSummaryView(
            trade_count=len(closed),
            reviewed_trade_count=len(reviewed),
            adherence_rate=round(sum(adherence_values) / len(adherence_values), 2) if adherence_values else 0.0,
            invalidation_discipline_rate=round(sum(1 for item in invalidation_checks if item) / len(invalidation_checks), 2) if invalidation_checks else 0.0,
            realism_warning_violation_rate=round(len(realism_violations) / len(reviewed), 2) if reviewed else 0.0,
            review_completion_rate=round(len(reviewed) / len(closed), 2) if closed else 0.0,
            poor_adherence_streak=poor_streak,
            review_backlog=sum(1 for trade in closed if trade.review_due),
            realism_warning_violation_count=len(realism_violations),
            invalidation_breach_count=len(invalidation_breaches),
            promoted_strategy_drift_count=len(drift),
            promoted_strategy_drift=drift,
        ),
        drift,
    )


def _failure_categories(reviews: dict[str, PaperTradeReviewRecord]) -> list[PaperTradeFailureCategoryView]:
    counts: dict[str, int] = {}
    for review in reviews.values():
        for category in _normalize_failure_categories(review.failure_categories_json, review.failure_category):
            counts[category] = counts.get(category, 0) + 1
    return [
        PaperTradeFailureCategoryView(
            category=category,
            trade_count=count,
            operator_error=category in OPERATOR_FAILURE_CATEGORIES,
        )
        for category, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def paper_trade_analytics(session: Session) -> PaperTradeAnalyticsView:
    closed = list_paper_trades(session, statuses=CLOSED_PAPER_STATUSES)
    signals, _ = _signal_maps(session)
    reviews = {row.trade_id: row for row in session.exec(select(PaperTradeReviewRecord)).all()}
    strategy_lifecycle = {
        row.name: row.lifecycle_state
        for row in session.exec(select(StrategyRegistryEntry)).all()
    }

    def group_rows(grouping: str, key_fn: Any) -> list[PaperTradeAnalyticsBucketView]:
        groups: dict[str, list[PaperTradeView]] = {}
        for trade in closed:
            groups.setdefault(str(key_fn(trade)), []).append(trade)
        return [_aggregate_bucket(grouping, key, rows, signals) for key, rows in sorted(groups.items())]

    hygiene_summary, _ = _hygiene_summary(closed, reviews, strategy_lifecycle)

    return PaperTradeAnalyticsView(
        generated_at=naive_utc_now(),
        by_signal_family=group_rows("signal_family", lambda trade: signals.get(trade.signal_id or "").signal_type if signals.get(trade.signal_id or "") else "manual"),
        by_asset_class=group_rows("asset_class", lambda trade: trade.data_reality.provenance.asset_class if trade.data_reality else "unknown"),
        by_strategy=group_rows("strategy", lambda trade: trade.strategy_id or "manual"),
        by_strategy_lifecycle_state=group_rows("strategy_lifecycle_state", lambda trade: strategy_lifecycle.get(trade.strategy_id or "", "manual")),
        by_score_bucket=group_rows("score_bucket", lambda trade: _bucket_label(signals.get(trade.signal_id or "").score if signals.get(trade.signal_id or "") else 0.0)),
        by_realism_bucket=group_rows("realism_bucket", lambda trade: _realism_bucket(trade.data_reality.realism_score if trade.data_reality else 0.0)),
        by_realism_grade=group_rows("realism_grade", lambda trade: trade.data_reality.provenance.realism_grade if trade.data_reality else "unknown"),
        by_freshness_state=group_rows("freshness_state", lambda trade: trade.data_reality.freshness_state if trade.data_reality else "unknown"),
        by_asset=group_rows("asset", lambda trade: trade.symbol),
        by_signal_quality=group_rows("signal_quality", lambda trade: trade.execution_quality.signal_quality if trade.execution_quality else "unknown"),
        by_plan_quality=group_rows("plan_quality", lambda trade: trade.execution_quality.plan_quality if trade.execution_quality else "unknown"),
        by_execution_quality=group_rows("execution_quality", lambda trade: trade.execution_quality.execution_quality if trade.execution_quality else "unknown"),
        hygiene_summary=hygiene_summary,
        failure_categories=_failure_categories(reviews),
    )


def _paper_trade_alert(category: str, trade: PaperTradeView, severity: str, title: str, body: str) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=stable_alert_id(category, trade.trade_id, trade.status),
        created_at=naive_utc_now(),
        signal_id=trade.signal_id,
        risk_report_id=trade.risk_report_id,
        asset_ids=[trade.symbol],
        severity=severity,
        category=category,
        channel_targets=choose_channel_targets(severity),
        title=title,
        body=body,
        tags=[trade.symbol, trade.status, category],
        dedupe_key=f"{category}:{trade.trade_id}:{trade.status}",
        data_quality=trade.data_quality,
    )


def refresh_paper_trade_alerts(session: Session) -> None:
    active = list_paper_trades(session, statuses=ACTIVE_PAPER_STATUSES)
    closed = list_paper_trades(session, statuses=CLOSED_PAPER_STATUSES)
    for trade in active:
        if trade.outcome and trade.outcome.target_attainment in {"base", "stretch"}:
            dispatch_alert(
                session,
                _paper_trade_alert(
                    "paper_trade_target_reached",
                    trade,
                    "info",
                    f"{trade.symbol} target reached",
                    f"Paper trade {trade.trade_id} has reached target state {trade.outcome.target_attainment}.",
                ),
            )
        if trade.opened_at and freshness_minutes(trade.opened_at) >= 2880:
            dispatch_alert(
                session,
                _paper_trade_alert(
                    "paper_trade_time_stop",
                    trade,
                    "warning",
                    f"{trade.symbol} time stop reached",
                    f"Paper trade {trade.trade_id} has been open for {freshness_minutes(trade.opened_at)} minutes.",
                ),
            )
        if trade.freshness_minutes >= 1440:
            dispatch_alert(
                session,
                _paper_trade_alert(
                    "paper_trade_stale_open",
                    trade,
                    "warning",
                    f"{trade.symbol} open trade is stale",
                    f"Paper trade {trade.trade_id} has not been updated for {trade.freshness_minutes} minutes.",
                ),
            )
        row = session.exec(select(PaperTradeRecord).where(PaperTradeRecord.trade_id == trade.trade_id)).first()
        latest_close = _unrealized_close(session, row) if row is not None else None
        if latest_close is not None:
            breached = latest_close <= trade.stop if trade.side != "short" else latest_close >= trade.stop
            if breached:
                dispatch_alert(
                    session,
                    _paper_trade_alert(
                        "paper_trade_invalidation_breached",
                        trade,
                        "warning",
                        f"{trade.symbol} invalidation breached",
                        f"Paper trade {trade.trade_id} breached stop {trade.stop:.2f} at {latest_close:.2f}.",
                    ),
                )
    for trade in closed:
        if trade.review_due:
            dispatch_alert(
                session,
                _paper_trade_alert(
                    "paper_trade_review_due",
                    trade,
                    "info",
                    f"{trade.symbol} review due",
                    f"Closed paper trade {trade.trade_id} is awaiting structured review.",
                ),
            )

    promoted = session.exec(select(StrategyRegistryEntry).where(StrategyRegistryEntry.lifecycle_state == "promoted")).all()
    for entry in promoted:
        rationale = _promotion_rationale(session, entry, robustness_score=0.0, walk_forward_quality=0.0)
        if rationale.recommended_state == "demoted":
            dispatch_alert(
                session,
                AlertEnvelope(
                    alert_id=stable_alert_id("promoted_strategy_degradation", entry.name),
                    created_at=naive_utc_now(),
                    signal_id=None,
                    risk_report_id=None,
                    asset_ids=[entry.underlying_symbol],
                    severity="warning",
                    category="promoted_strategy_degradation",
                    channel_targets=choose_channel_targets("warning"),
                    title=f"{entry.name} degradation warning",
                    body=f"Promoted strategy {entry.name} is now recommended for demotion.",
                    tags=[entry.name, entry.lifecycle_state],
                    dedupe_key=f"promoted_strategy_degradation:{entry.name}",
                    data_quality="fixture",
                ),
            )
    reviews = {row.trade_id: row for row in session.exec(select(PaperTradeReviewRecord)).all()}
    strategy_lifecycle = {row.name: row.lifecycle_state for row in session.exec(select(StrategyRegistryEntry)).all()}
    hygiene_summary, drift = _hygiene_summary(closed, reviews, strategy_lifecycle)
    if hygiene_summary.realism_warning_violation_count >= 2:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("repeated_realism_warning_violation", hygiene_summary.realism_warning_violation_count),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=sorted({trade.symbol for trade in closed if trade.adherence and trade.adherence.realism_warning_ignored}),
                severity="warning",
                category="repeated_realism_warning_violation",
                channel_targets=choose_channel_targets("warning"),
                title="Repeated realism-warning violations",
                body=f"{hygiene_summary.realism_warning_violation_count} reviewed paper trades ignored realism warnings.",
                tags=["decision_hygiene", "realism_warning"],
                dedupe_key=f"repeated_realism_warning_violation:{hygiene_summary.realism_warning_violation_count}",
                data_quality="paper",
            ),
        )
    if hygiene_summary.invalidation_breach_count >= 2:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("repeated_invalidation_breaches", hygiene_summary.invalidation_breach_count),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=sorted({trade.symbol for trade in closed if trade.adherence and trade.adherence.invalidation_respected is False}),
                severity="warning",
                category="repeated_invalidation_breaches",
                channel_targets=choose_channel_targets("warning"),
                title="Repeated invalidation breaches",
                body=f"{hygiene_summary.invalidation_breach_count} reviewed paper trades failed invalidation discipline.",
                tags=["decision_hygiene", "invalidation"],
                dedupe_key=f"repeated_invalidation_breaches:{hygiene_summary.invalidation_breach_count}",
                data_quality="paper",
            ),
        )
    if hygiene_summary.review_backlog >= 2:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("paper_trade_review_backlog", hygiene_summary.review_backlog),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=sorted({trade.symbol for trade in closed if trade.review_due}),
                severity="info",
                category="paper_trade_review_backlog",
                channel_targets=choose_channel_targets("info"),
                title="Paper-trade review backlog",
                body=f"{hygiene_summary.review_backlog} closed paper trades are awaiting structured review.",
                tags=["decision_hygiene", "review_backlog"],
                dedupe_key=f"paper_trade_review_backlog:{hygiene_summary.review_backlog}",
                data_quality="paper",
            ),
        )
    if hygiene_summary.poor_adherence_streak >= 2:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("poor_adherence_streak", hygiene_summary.poor_adherence_streak),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=[],
                severity="warning",
                category="poor_adherence_streak",
                channel_targets=choose_channel_targets("warning"),
                title="Poor adherence streak",
                body=f"The last {hygiene_summary.poor_adherence_streak} closed paper trades show weak adherence.",
                tags=["decision_hygiene", "adherence"],
                dedupe_key=f"poor_adherence_streak:{hygiene_summary.poor_adherence_streak}",
                data_quality="paper",
            ),
        )
    for strategy_name in drift:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("promoted_strategy_drift", strategy_name),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=[],
                severity="warning",
                category="promoted_strategy_drift",
                channel_targets=choose_channel_targets("warning"),
                title=f"{strategy_name} operator drift",
                body=f"Promoted strategy {strategy_name} shows degraded paper-trade adherence or expectancy.",
                tags=[strategy_name, "decision_hygiene"],
                dedupe_key=f"promoted_strategy_drift:{strategy_name}",
                data_quality="paper",
            ),
        )
