from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, desc, select

from app.alerting import choose_channel_targets, dispatch_alert, stable_alert_id
from app.core.clock import naive_utc_now
from app.core.telemetry import append_event
from app.models.entities import ManualFillRecord, MarketBar, PaperTradeRecord, TradeTicketRecord
from app.models.schemas import (
    AlertEnvelope,
    BrokerAdapterSnapshotView,
    ManualFillCreateRequest,
    ManualFillImportRequest,
    ManualFillReconciliationView,
    ManualFillView,
    ShadowObservationView,
    TradeTicketApprovalRequest,
    TradeTicketChecklistView,
    TradeTicketCreateRequest,
    TradeTicketDetailView,
    TradeTicketUpdateRequest,
    TradeTicketView,
)
from app.services.broker_adapters import default_broker_adapter
from app.services.dashboard_data import list_risk_views, list_signal_views
from app.services.operator_console import get_risk_detail, get_signal_detail
from app.services.paper_trading import get_paper_trade_detail


TICKET_ACTIVE_STATUSES = {"approved", "shadow_active", "manually_executed"}
TICKET_FINAL_STATUSES = {"invalidated", "expired", "cancelled"}
CHECKLIST_KEYS = (
    "freshness_acceptable",
    "realism_acceptable",
    "risk_budget_available",
    "cluster_exposure_acceptable",
    "review_complete",
    "operator_acknowledged",
)


def _stable_id(prefix: str, *parts: object) -> str:
    key = "|".join(str(part) for part in parts)
    return f"{prefix}_{uuid5(NAMESPACE_URL, key).hex}"


def _reference_price(zone: dict[str, Any]) -> float:
    low = float(zone.get("low") or 0.0)
    high = float(zone.get("high") or low)
    if low and high:
        return round((low + high) / 2, 4)
    return round(low or high, 4)


def _latest_bar(session: Session, symbol: str) -> MarketBar | None:
    return session.exec(select(MarketBar).where(MarketBar.symbol == symbol).order_by(desc(MarketBar.timestamp))).first()


def _signal_map(session: Session) -> dict[str, Any]:
    return {row.signal_id: row for row in list_signal_views(session)}


def _risk_map(session: Session) -> dict[str, Any]:
    return {row.risk_report_id: row for row in list_risk_views(session)}


def _freshness_summary(signal: Any | None, risk: Any | None) -> dict[str, Any]:
    signal_minutes = int(getattr(signal, "freshness_minutes", 0) or 0)
    risk_minutes = int(getattr(risk, "freshness_minutes", 0) or 0)
    freshness = max(signal_minutes, risk_minutes)
    freshness_state = "fresh"
    if freshness >= 1440:
        freshness_state = "stale"
    elif freshness >= 240:
        freshness_state = "aging"
    return {
        "freshness_minutes": freshness,
        "freshness_state": freshness_state,
        "signal_freshness_minutes": signal_minutes,
        "risk_freshness_minutes": risk_minutes,
    }


def _realism_summary(signal: Any | None) -> dict[str, Any]:
    reality = getattr(signal, "data_reality", None)
    if reality is None:
        return {
            "realism_score": 0.0,
            "realism_grade": "unknown",
            "source_type": "fixture",
            "warning": "No data reality context was available.",
        }
    return {
        "realism_score": round(float(reality.realism_score), 2),
        "realism_grade": reality.provenance.realism_grade,
        "source_type": reality.provenance.source_type,
        "source_timing": reality.provenance.source_timing,
        "warning": reality.ui_warning,
        "alignment_note": reality.tradable_alignment_note,
    }


def _checklist(signal: Any | None, risk: Any | None, acknowledged: bool = False, review_complete: bool = True) -> TradeTicketChecklistView:
    reality = getattr(signal, "data_reality", None)
    freshness = _freshness_summary(signal, risk)
    payload = {
        "freshness_acceptable": freshness["freshness_state"] == "fresh",
        "realism_acceptable": bool(reality and not reality.promotion_blocked and reality.realism_score >= 35),
        "risk_budget_available": bool(risk and float(getattr(risk, "max_portfolio_risk_pct", 0.0)) <= 1.0),
        "cluster_exposure_acceptable": bool(risk and getattr(risk, "exposure_cluster", "") != "crowded"),
        "review_complete": review_complete,
        "operator_acknowledged": acknowledged,
    }
    blocked_reasons = [
        reason
        for key, reason in (
            ("freshness_acceptable", "freshness below approval threshold"),
            ("realism_acceptable", "realism below approval threshold"),
            ("risk_budget_available", "risk budget unavailable"),
            ("cluster_exposure_acceptable", "cluster exposure too high"),
            ("review_complete", "review incomplete"),
            ("operator_acknowledged", "operator acknowledgement missing"),
        )
        if not bool(payload[key])
    ]
    payload["completed"] = all(bool(payload[key]) for key in CHECKLIST_KEYS)
    payload["blocked_reasons"] = blocked_reasons
    return TradeTicketChecklistView(**payload)


def _planned_size(risk: Any | None) -> dict[str, Any]:
    if risk is None:
        return {"size_band": "small", "target_units": 0.25, "max_risk_pct": 0.25}
    band = str(getattr(risk, "size_band", "small"))
    units = {"small": 0.25, "medium": 0.5, "large": 0.8}.get(band, 0.25)
    return {
        "size_band": band,
        "target_units": units,
        "max_risk_pct": round(float(getattr(risk, "max_portfolio_risk_pct", 0.25)), 2),
    }


def _shadow_summary(session: Session, row: TradeTicketRecord, signal: Any | None) -> ShadowObservationView:
    latest = _latest_bar(session, row.symbol)
    observed_price = latest.close if latest is not None else _reference_price(row.proposed_entry_zone_json)
    planned = _reference_price(row.proposed_entry_zone_json)
    divergence = 0.0 if planned == 0 else round(((observed_price - planned) / planned) * 100, 2)
    freshness_state = row.freshness_summary_json.get("freshness_state", "fresh")
    valid = True
    divergence_reason = ""
    if row.side == "long" and observed_price <= row.planned_stop:
        valid = False
        divergence_reason = "observed price breached planned stop"
    elif row.side == "short" and observed_price >= row.planned_stop:
        valid = False
        divergence_reason = "observed price breached planned stop"
    elif abs(divergence) >= 3.0:
        divergence_reason = "observed path diverged from planned entry zone"
    if freshness_state in {"stale", "degraded", "unusable"}:
        valid = False
        divergence_reason = divergence_reason or "source freshness no longer supports entry"
    note = f"Observed {row.symbol} at {observed_price:.2f} versus planned reference {planned:.2f}."
    if signal is not None and getattr(signal, "signal_type", "") == "event_driven":
        note += " Event-driven tickets carry extra path uncertainty."
    return ShadowObservationView(
        observed_at=latest.timestamp if latest is not None else naive_utc_now(),
        observed_price=round(observed_price, 4),
        planned_reference_price=planned,
        observed_vs_plan_pct=divergence,
        ticket_valid=valid,
        divergence_flag=bool(divergence_reason),
        divergence_reason=divergence_reason,
        market_path_note=note,
        freshness_state=freshness_state,
    )


def _fill_reconciliation(row: TradeTicketRecord, fill: ManualFillRecord) -> ManualFillReconciliationView:
    planned = _reference_price(row.proposed_entry_zone_json)
    actual = float(fill.fill_price)
    actual_slippage = 0.0 if planned == 0 else round(((actual - planned) / planned) * 10000, 2)
    modeled_slippage = round(float(row.realism_summary_json.get("modeled_slippage_bps", 8.0)), 2)
    low = float(row.proposed_entry_zone_json.get("low") or planned)
    high = float(row.proposed_entry_zone_json.get("high") or planned)
    inside_zone = low <= actual <= high
    variance = round(actual_slippage - modeled_slippage, 2)
    requires_review = abs(variance) >= 6 or not inside_zone
    summary = (
        f"Actual fill {actual:.2f} versus planned {planned:.2f}; "
        f"variance {variance:.2f}bps against modeled slippage."
    )
    return ManualFillReconciliationView(
        planned_entry_reference=planned,
        actual_fill_price=actual,
        actual_slippage_bps=actual_slippage,
        modeled_slippage_bps=modeled_slippage,
        slippage_variance_bps=variance,
        entered_inside_zone=inside_zone,
        requires_review=requires_review,
        summary=summary,
    )


def _fill_view(session: Session, row: TradeTicketRecord, fill: ManualFillRecord) -> ManualFillView:
    reconciliation = _fill_reconciliation(row, fill)
    if fill.reconciliation_json != reconciliation.model_dump(mode="json"):
        fill.reconciliation_json = reconciliation.model_dump(mode="json")
        fill.updated_at = naive_utc_now()
        session.add(fill)
        session.commit()
        session.refresh(fill)
    return ManualFillView(
        fill_id=fill.fill_id,
        ticket_id=fill.ticket_id,
        trade_id=fill.trade_id,
        source=fill.source,
        symbol=fill.symbol,
        side=fill.side,
        filled_at=fill.filled_at,
        fill_price=fill.fill_price,
        fill_size=fill.fill_size,
        fees=fill.fees,
        slippage_bps=fill.slippage_bps,
        notes=fill.notes,
        import_batch_id=fill.import_batch_id,
        reconciliation=reconciliation,
    )


def _ticket_view(session: Session, row: TradeTicketRecord) -> TradeTicketView:
    detail = get_signal_detail(session, row.signal_id) if row.signal_id else None
    signal = _signal_map(session).get(row.signal_id or "")
    checklist = TradeTicketChecklistView(**row.checklist_status_json)
    shadow = _shadow_summary(session, row, signal)
    if row.shadow_summary_json != shadow.model_dump(mode="json"):
        row.shadow_summary_json = shadow.model_dump(mode="json")
        row.shadow_status = "diverged" if shadow.divergence_flag else row.shadow_status
        row.updated_at = naive_utc_now()
        session.add(row)
        session.commit()
        session.refresh(row)
    freshness_minutes = max(
        int(row.freshness_summary_json.get("freshness_minutes", 0)),
        int((naive_utc_now() - row.updated_at).total_seconds() // 60),
    )
    return TradeTicketView(
        ticket_id=row.ticket_id,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        trade_id=row.trade_id,
        strategy_id=row.strategy_id,
        symbol=row.symbol,
        side=row.side,
        proposed_entry_zone={key: float(value) for key, value in row.proposed_entry_zone_json.items()},
        planned_stop=row.planned_stop,
        planned_targets={key: float(value) for key, value in row.planned_targets_json.items()},
        planned_size=row.planned_size_json,
        realism_summary=row.realism_summary_json,
        freshness_summary=row.freshness_summary_json,
        checklist_status=checklist,
        approval_status=row.approval_status,
        status=row.status,
        shadow_status=row.shadow_status,
        created_at=row.created_at,
        expires_at=row.expires_at,
        notes=row.notes,
        freshness_minutes=freshness_minutes,
        linked_signal_family=detail.signal_type if detail is not None else "",
        data_reality=detail.data_reality if detail is not None else None,
    )


def _ticket_detail(session: Session, row: TradeTicketRecord) -> TradeTicketDetailView:
    base = _ticket_view(session, row)
    fills = session.exec(select(ManualFillRecord).where(ManualFillRecord.ticket_id == row.ticket_id).order_by(desc(ManualFillRecord.filled_at))).all()
    linked_trade = get_paper_trade_detail(session, row.trade_id) if row.trade_id else None
    return TradeTicketDetailView(
        **base.model_dump(),
        linked_signal=get_signal_detail(session, row.signal_id) if row.signal_id else None,
        linked_risk=get_risk_detail(session, row.risk_report_id) if row.risk_report_id else None,
        linked_trade=linked_trade,
        shadow_summary=ShadowObservationView(**row.shadow_summary_json) if row.shadow_summary_json else _shadow_summary(session, row, None),
        manual_fills=[_fill_view(session, row, fill) for fill in fills],
        broker_snapshot=default_broker_adapter().snapshot(),
    )


def _seed_row(
    session: Session,
    *,
    ticket_id: str,
    signal_id: str | None,
    risk_report_id: str | None,
    trade_id: str | None,
    strategy_id: str | None,
    symbol: str,
    side: str,
    status: str,
    approval_status: str,
    checklist: TradeTicketChecklistView,
    notes: str,
    expires_at: Any,
) -> TradeTicketRecord:
    signals = _signal_map(session)
    risks = _risk_map(session)
    signal = signals.get(signal_id or "")
    risk = risks.get(risk_report_id or "")
    price = float(signal.features.get("close", 0.0)) if signal is not None else 0.0
    proposed_entry_zone = {
        "low": round(price * (0.997 if side == "long" else 1.003), 4) if price else 0.0,
        "high": round(price * (1.003 if side == "long" else 0.997), 4) if price else 0.0,
    }
    row = session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first()
    if row is None:
        row = TradeTicketRecord(ticket_id=ticket_id)
    row.signal_id = signal_id
    row.risk_report_id = risk_report_id
    row.trade_id = trade_id
    row.strategy_id = strategy_id
    row.symbol = symbol
    row.side = side
    row.proposed_entry_zone_json = proposed_entry_zone
    row.planned_stop = float(getattr(risk, "stop_price", proposed_entry_zone["low"]))
    row.planned_targets_json = dict(getattr(signal, "targets", {"base": 0.0, "stretch": 0.0}))
    row.planned_size_json = _planned_size(risk)
    row.realism_summary_json = {**_realism_summary(signal), "modeled_slippage_bps": 7.5 if symbol == "BTC" else 12.5}
    row.freshness_summary_json = _freshness_summary(signal, risk)
    row.checklist_status_json = checklist.model_dump(mode="json")
    row.approval_status = approval_status
    row.status = status
    row.shadow_status = "monitoring" if status == "shadow_active" else "pending"
    row.notes = notes
    row.expires_at = expires_at
    row.updated_at = naive_utc_now()
    row.shadow_summary_json = _shadow_summary(session, row, signal).model_dump(mode="json")
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def seed_trade_tickets(session: Session) -> None:
    signals = list_signal_views(session)
    risks = list_risk_views(session)
    trades = session.exec(select(PaperTradeRecord).order_by(PaperTradeRecord.trade_id.asc())).all()
    if not signals or not risks:
        return
    risk_by_signal = {risk.signal_id: risk for risk in risks}
    trade_by_symbol = {trade.symbol: trade for trade in trades}
    btc_signal = next((row for row in signals if row.symbol == "BTC"), signals[0])
    eth_signal = next((row for row in signals if row.symbol == "ETH"), signals[-1])
    btc_risk = risk_by_signal.get(btc_signal.signal_id)
    eth_risk = risk_by_signal.get(eth_signal.signal_id)
    _seed_row(
        session,
        ticket_id="ticket_btc_review",
        signal_id=btc_signal.signal_id,
        risk_report_id=btc_risk.risk_report_id if btc_risk else None,
        trade_id=None,
        strategy_id="trend_breakout_v1",
        symbol="BTC",
        side=btc_signal.direction if btc_signal.direction in {"long", "short"} else "long",
        status="ready_for_review",
        approval_status="pending",
        checklist=_checklist(btc_signal, btc_risk, acknowledged=True),
        notes="Primary BTC ticket awaiting operator approval.",
        expires_at=naive_utc_now() + timedelta(hours=6),
    )
    _seed_row(
        session,
        ticket_id="ticket_eth_shadow",
        signal_id=eth_signal.signal_id,
        risk_report_id=eth_risk.risk_report_id if eth_risk else None,
        trade_id=trade_by_symbol.get("ETH").trade_id if trade_by_symbol.get("ETH") else None,
        strategy_id="event_continuation_v1",
        symbol="ETH",
        side="long",
        status="shadow_active",
        approval_status="approved",
        checklist=_checklist(eth_signal, eth_risk, acknowledged=True),
        notes="Shadow-mode monitoring ticket for event-sensitive ETH context.",
        expires_at=naive_utc_now() + timedelta(hours=4),
    )
    executed_ticket = _seed_row(
        session,
        ticket_id="ticket_btc_manual",
        signal_id=btc_signal.signal_id,
        risk_report_id=btc_risk.risk_report_id if btc_risk else None,
        trade_id=trade_by_symbol.get("BTC").trade_id if trade_by_symbol.get("BTC") else None,
        strategy_id="trend_breakout_v1",
        symbol="BTC",
        side="long",
        status="manually_executed",
        approval_status="approved",
        checklist=_checklist(btc_signal, btc_risk, acknowledged=True),
        notes="Manual external execution captured for reconciliation review.",
        expires_at=naive_utc_now() + timedelta(hours=12),
    )
    fill = session.exec(select(ManualFillRecord).where(ManualFillRecord.fill_id == "fill_btc_manual_001")).first()
    if fill is None:
        fill = ManualFillRecord(
            fill_id="fill_btc_manual_001",
            ticket_id=executed_ticket.ticket_id,
            trade_id=executed_ticket.trade_id,
            source="manual_import",
            symbol=executed_ticket.symbol,
            side=executed_ticket.side,
            filled_at=naive_utc_now(),
            fill_price=71910.0,
            fill_size=0.5,
            fees=12.5,
            slippage_bps=4.17,
            notes="Fixture manual fill imported for reconciliation.",
            import_batch_id="import_shadow_001",
        )
        fill.reconciliation_json = _fill_reconciliation(executed_ticket, fill).model_dump(mode="json")
        session.add(fill)
        session.commit()


def list_trade_tickets(session: Session) -> list[TradeTicketView]:
    seed_trade_tickets(session)
    rows = session.exec(select(TradeTicketRecord).order_by(desc(TradeTicketRecord.updated_at))).all()
    return [_ticket_view(session, row) for row in rows]


def list_shadow_mode_tickets(session: Session) -> list[TradeTicketDetailView]:
    seed_trade_tickets(session)
    rows = session.exec(
        select(TradeTicketRecord).where(TradeTicketRecord.status.in_(("approved", "shadow_active", "manually_executed"))).order_by(desc(TradeTicketRecord.updated_at))
    ).all()
    return [_ticket_detail(session, row) for row in rows]


def get_trade_ticket_detail(session: Session, ticket_id: str) -> TradeTicketDetailView | None:
    seed_trade_tickets(session)
    row = session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first()
    if row is None:
        return None
    return _ticket_detail(session, row)


def _require_complete_checklist(row: TradeTicketRecord) -> None:
    checklist = TradeTicketChecklistView(**row.checklist_status_json)
    if not checklist.completed:
        raise ValueError(f"Ticket checklist is incomplete: {', '.join(checklist.blocked_reasons)}.")


def create_trade_ticket(session: Session, payload: TradeTicketCreateRequest) -> TradeTicketDetailView:
    signal = get_signal_detail(session, payload.signal_id)
    if signal is None:
        raise ValueError("Signal not found.")
    risk = get_risk_detail(session, payload.risk_report_id) if payload.risk_report_id else None
    base_ticket_id = _stable_id("ticket", payload.signal_id, payload.symbol or signal.symbol, payload.strategy_id or "manual")
    ticket_id = base_ticket_id
    suffix = 1
    while session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first() is not None:
        ticket_id = f"{base_ticket_id}_{suffix}"
        suffix += 1
    row = TradeTicketRecord(
        ticket_id=ticket_id,
        signal_id=payload.signal_id,
        risk_report_id=payload.risk_report_id or (risk.risk_report_id if risk else None),
        trade_id=payload.trade_id,
        strategy_id=payload.strategy_id,
        symbol=payload.symbol or signal.symbol,
        side=payload.side or (signal.direction if signal.direction in {"long", "short"} else "long"),
        proposed_entry_zone_json={
            "low": round(float(signal.features.get("close", 0.0)) * 0.997, 4),
            "high": round(float(signal.features.get("close", 0.0)) * 1.003, 4),
        },
        planned_stop=float(risk.stop_price if risk else signal.invalidation),
        planned_targets_json=signal.targets,
        planned_size_json=_planned_size(risk),
        realism_summary_json={**_realism_summary(signal), "modeled_slippage_bps": 8.0},
        freshness_summary_json=_freshness_summary(signal, risk),
        checklist_status_json=_checklist(signal, risk).model_dump(mode="json"),
        approval_status="pending",
        status="draft",
        shadow_status="pending",
        notes=payload.notes,
        expires_at=payload.expires_at or (naive_utc_now() + timedelta(hours=6)),
        updated_at=naive_utc_now(),
    )
    row.shadow_summary_json = _shadow_summary(session, row, signal).model_dump(mode="json")
    session.add(row)
    session.commit()
    session.refresh(row)
    append_event("trade_ticket_created", {"ticket_id": row.ticket_id, "signal_id": row.signal_id, "status": row.status})
    return _ticket_detail(session, row)


def update_trade_ticket(session: Session, ticket_id: str, payload: TradeTicketUpdateRequest) -> TradeTicketDetailView | None:
    row = session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first()
    if row is None:
        return None
    if payload.proposed_entry_zone is not None:
        row.proposed_entry_zone_json = payload.proposed_entry_zone
    if payload.planned_stop is not None:
        row.planned_stop = payload.planned_stop
    if payload.planned_targets is not None:
        row.planned_targets_json = payload.planned_targets
    if payload.planned_size is not None:
        row.planned_size_json = payload.planned_size
    if payload.checklist_status is not None:
        merged = dict(row.checklist_status_json)
        merged.update(payload.checklist_status)
        checklist = TradeTicketChecklistView(**{**TradeTicketChecklistView().model_dump(), **merged})
        checklist.completed = all(bool(getattr(checklist, key)) for key in CHECKLIST_KEYS)
        checklist.blocked_reasons = [
            reason
            for key, reason in (
                ("freshness_acceptable", "freshness below approval threshold"),
                ("realism_acceptable", "realism below approval threshold"),
                ("risk_budget_available", "risk budget unavailable"),
                ("cluster_exposure_acceptable", "cluster exposure too high"),
                ("review_complete", "review incomplete"),
                ("operator_acknowledged", "operator acknowledgement missing"),
            )
            if not bool(getattr(checklist, key))
        ]
        row.checklist_status_json = checklist.model_dump(mode="json")
        if checklist.completed and row.status == "draft":
            row.status = "ready_for_review"
    if payload.expires_at is not None:
        row.expires_at = payload.expires_at
    if payload.notes is not None:
        row.notes = payload.notes
    if payload.status is not None:
        row.status = payload.status
    row.updated_at = naive_utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _ticket_detail(session, row)


def approve_trade_ticket(session: Session, ticket_id: str, payload: TradeTicketApprovalRequest) -> TradeTicketDetailView | None:
    row = session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first()
    if row is None:
        return None
    if payload.approval_status == "approved":
        _require_complete_checklist(row)
        row.approval_status = "approved"
        row.status = "approved"
    else:
        row.approval_status = payload.approval_status
        row.status = "cancelled" if payload.approval_status == "rejected" else row.status
    row.approval_notes = payload.approval_notes
    row.updated_at = naive_utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _ticket_detail(session, row)


def _set_ticket_status(session: Session, ticket_id: str, status: str, note: str = "") -> TradeTicketDetailView | None:
    row = session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first()
    if row is None:
        return None
    row.status = status
    if status == "shadow_active":
        row.shadow_status = "monitoring"
    row.notes = note or row.notes
    row.updated_at = naive_utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    append_event("trade_ticket_transition", {"ticket_id": ticket_id, "status": status, "note": note})
    return _ticket_detail(session, row)


def invalidate_trade_ticket(session: Session, ticket_id: str, note: str = "") -> TradeTicketDetailView | None:
    return _set_ticket_status(session, ticket_id, "invalidated", note or "Ticket invalidated before entry.")


def expire_trade_ticket(session: Session, ticket_id: str, note: str = "") -> TradeTicketDetailView | None:
    return _set_ticket_status(session, ticket_id, "expired", note or "Ticket expired before entry.")


def mark_trade_ticket_shadow_active(session: Session, ticket_id: str, note: str = "") -> TradeTicketDetailView | None:
    return _set_ticket_status(session, ticket_id, "shadow_active", note or "Shadow monitoring activated.")


def mark_trade_ticket_manually_executed(session: Session, ticket_id: str, note: str = "", trade_id: str | None = None) -> TradeTicketDetailView | None:
    row = session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first()
    if row is None:
        return None
    row.trade_id = trade_id or row.trade_id
    row.status = "manually_executed"
    row.notes = note or row.notes
    row.updated_at = naive_utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _ticket_detail(session, row)


def broker_adapter_snapshot() -> BrokerAdapterSnapshotView:
    return default_broker_adapter().snapshot()


def record_manual_fill(
    session: Session,
    ticket_id: str,
    payload: ManualFillCreateRequest,
    *,
    source: str = "manual",
    import_batch_id: str | None = None,
    import_notes: str = "",
) -> ManualFillView | None:
    row = session.exec(select(TradeTicketRecord).where(TradeTicketRecord.ticket_id == ticket_id)).first()
    if row is None:
        return None
    base_fill_id = _stable_id("fill", ticket_id, payload.filled_at.isoformat(), payload.fill_price, payload.fill_size, import_batch_id or source)
    fill_id = base_fill_id
    suffix = 1
    while session.exec(select(ManualFillRecord).where(ManualFillRecord.fill_id == fill_id)).first() is not None:
        fill_id = f"{base_fill_id}_{suffix}"
        suffix += 1
    fill = ManualFillRecord(
        fill_id=fill_id,
        ticket_id=ticket_id,
        trade_id=payload.trade_id or row.trade_id,
        source=source,
        symbol=row.symbol,
        side=row.side,
        filled_at=payload.filled_at,
        fill_price=payload.fill_price,
        fill_size=payload.fill_size,
        fees=payload.fees,
        slippage_bps=0.0,
        notes=payload.notes or import_notes,
        import_batch_id=import_batch_id,
    )
    fill.slippage_bps = _fill_reconciliation(row, fill).actual_slippage_bps
    fill.reconciliation_json = _fill_reconciliation(row, fill).model_dump(mode="json")
    session.add(fill)
    session.commit()
    session.refresh(fill)
    return _fill_view(session, row, fill)


def import_manual_fills(session: Session, ticket_id: str, payload: ManualFillImportRequest) -> list[ManualFillView]:
    batch_id = payload.import_batch_id or _stable_id("fill_import", ticket_id, len(payload.fills))
    imported: list[ManualFillView] = []
    for item in payload.fills:
        fill = record_manual_fill(session, ticket_id, item, source="manual_import", import_batch_id=batch_id, import_notes=payload.notes)
        if fill is not None:
            imported.append(fill)
    return imported


def refresh_ticket_alerts(session: Session) -> None:
    for ticket in list_trade_tickets(session):
        if ticket.status == "ready_for_review":
            dispatch_alert(
                session,
                AlertEnvelope(
                    alert_id=stable_alert_id("ticket_ready_for_review", ticket.ticket_id),
                    created_at=naive_utc_now(),
                    signal_id=ticket.signal_id,
                    risk_report_id=ticket.risk_report_id,
                    asset_ids=[ticket.symbol],
                    severity="info",
                    category="ticket_ready_for_review",
                    channel_targets=choose_channel_targets("info"),
                    title=f"{ticket.symbol} ticket ready for review",
                    body=f"Trade ticket {ticket.ticket_id} has a complete checklist and is ready for approval.",
                    tags=[ticket.symbol, ticket.status],
                    dedupe_key=f"ticket_ready_for_review:{ticket.ticket_id}:{ticket.status}",
                    data_quality="fixture",
                ),
            )
        if ticket.status == "expired":
            dispatch_alert(
                session,
                AlertEnvelope(
                    alert_id=stable_alert_id("ticket_expiry", ticket.ticket_id),
                    created_at=naive_utc_now(),
                    signal_id=ticket.signal_id,
                    risk_report_id=ticket.risk_report_id,
                    asset_ids=[ticket.symbol],
                    severity="warning",
                    category="ticket_expiry",
                    channel_targets=choose_channel_targets("warning"),
                    title=f"{ticket.symbol} ticket expired",
                    body=f"Trade ticket {ticket.ticket_id} expired before entry.",
                    tags=[ticket.symbol, ticket.status],
                    dedupe_key=f"ticket_expiry:{ticket.ticket_id}:{ticket.status}",
                    data_quality="fixture",
                ),
            )
        if ticket.status == "invalidated":
            dispatch_alert(
                session,
                AlertEnvelope(
                    alert_id=stable_alert_id("ticket_invalidated_before_entry", ticket.ticket_id),
                    created_at=naive_utc_now(),
                    signal_id=ticket.signal_id,
                    risk_report_id=ticket.risk_report_id,
                    asset_ids=[ticket.symbol],
                    severity="warning",
                    category="ticket_invalidated_before_entry",
                    channel_targets=choose_channel_targets("warning"),
                    title=f"{ticket.symbol} ticket invalidated",
                    body=f"Trade ticket {ticket.ticket_id} was invalidated before entry.",
                    tags=[ticket.symbol, ticket.status],
                    dedupe_key=f"ticket_invalidated_before_entry:{ticket.ticket_id}:{ticket.status}",
                    data_quality="fixture",
                ),
            )
        if ticket.status == "manually_executed":
            dispatch_alert(
                session,
                AlertEnvelope(
                    alert_id=stable_alert_id("manual_execution_recorded", ticket.ticket_id),
                    created_at=naive_utc_now(),
                    signal_id=ticket.signal_id,
                    risk_report_id=ticket.risk_report_id,
                    asset_ids=[ticket.symbol],
                    severity="info",
                    category="manual_execution_recorded",
                    channel_targets=choose_channel_targets("info"),
                    title=f"{ticket.symbol} manual execution recorded",
                    body=f"Trade ticket {ticket.ticket_id} has a manual external fill linked for reconciliation.",
                    tags=[ticket.symbol, ticket.status],
                    dedupe_key=f"manual_execution_recorded:{ticket.ticket_id}:{ticket.status}",
                    data_quality="fixture",
                ),
            )
        detail = get_trade_ticket_detail(session, ticket.ticket_id)
        if detail is None:
            continue
        if detail.shadow_summary and detail.shadow_summary.divergence_flag:
            dispatch_alert(
                session,
                AlertEnvelope(
                    alert_id=stable_alert_id("shadow_divergence", ticket.ticket_id, detail.shadow_summary.divergence_reason),
                    created_at=naive_utc_now(),
                    signal_id=ticket.signal_id,
                    risk_report_id=ticket.risk_report_id,
                    asset_ids=[ticket.symbol],
                    severity="warning",
                    category="shadow_divergence",
                    channel_targets=choose_channel_targets("warning"),
                    title=f"{ticket.symbol} shadow divergence",
                    body=detail.shadow_summary.divergence_reason or "Observed market path diverged from the ticket assumptions.",
                    tags=[ticket.symbol, ticket.shadow_status],
                    dedupe_key=f"shadow_divergence:{ticket.ticket_id}:{detail.shadow_summary.divergence_reason}",
                    data_quality="fixture",
                ),
            )
        for fill in detail.manual_fills:
            if fill.reconciliation.requires_review:
                dispatch_alert(
                    session,
                    AlertEnvelope(
                        alert_id=stable_alert_id("reconciliation_needed", fill.fill_id),
                        created_at=naive_utc_now(),
                        signal_id=ticket.signal_id,
                        risk_report_id=ticket.risk_report_id,
                        asset_ids=[ticket.symbol],
                        severity="warning",
                        category="reconciliation_needed",
                        channel_targets=choose_channel_targets("warning"),
                        title=f"{ticket.symbol} reconciliation needed",
                        body=fill.reconciliation.summary,
                        tags=[ticket.symbol, "reconciliation"],
                        dedupe_key=f"reconciliation_needed:{fill.fill_id}",
                        data_quality="fixture",
                    ),
                )
