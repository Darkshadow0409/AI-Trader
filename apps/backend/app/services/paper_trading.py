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
from app.models.entities import MarketBar, PaperTradeRecord, PaperTradeReviewRecord, StrategyRegistryEntry
from app.models.schemas import (
    AlertEnvelope,
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
    PaperTradeView,
    RiskView,
    SignalView,
)
from app.services.dashboard_data import list_risk_views, list_signal_views
from app.services.data_reality import asset_reality, freshness_minutes
from app.strategy_lab.service import _promotion_rationale


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"
ACTIVE_PAPER_STATUSES = {"opened", "scaled_in", "partially_exited"}
CLOSED_PAPER_STATUSES = {"closed_win", "closed_loss", "invalidated", "timed_out", "cancelled"}
PAPER_STATUSES = {"proposed", *ACTIVE_PAPER_STATUSES, *CLOSED_PAPER_STATUSES}
OPERATOR_FAILURE_CATEGORIES = {"operator_timing", "operator_sizing", "realism_ignored", "execution_plan_violation"}


def _stable_id(prefix: str, *parts: object) -> str:
    key = "|".join(str(part) for part in parts)
    return f"{prefix}_{uuid5(NAMESPACE_URL, key).hex}"


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC).replace(tzinfo=None)


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
    row.outcome_json = outcome.model_dump(mode="json")
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
    return PaperTradeDetailView(
        **base.model_dump(),
        linked_signal=signals.get(row.signal_id or ""),
        linked_risk=risks.get(row.risk_report_id or ""),
        review=_review_view(reviews.get(row.trade_id)),
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
