from __future__ import annotations

from collections import Counter
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, desc, select

from app.alerting import choose_channel_targets, dispatch_alert, stable_alert_id
from app.core.clock import naive_utc_now
from app.models.entities import AdapterHealthRecord, AlertRecord, AuditLogRecord, PilotMetricSnapshotRecord, StrategyRegistryEntry, TradeTicketRecord
from app.models.schemas import AlertEnvelope, AdapterHealthView, AuditLogView, ExecutionGateView, PilotDashboardView, PilotMetricSummaryView
from app.services.broker_adapters import default_broker_adapter
from app.services.paper_trading import paper_trade_analytics
from app.services.session_workflow import operational_backlog
from app.services.trade_tickets import get_trade_ticket_detail, list_trade_tickets


def _stable_id(prefix: str, *parts: object) -> str:
    return f"{prefix}_{uuid5(NAMESPACE_URL, '|'.join(str(part) for part in parts)).hex}"


def record_audit_log(session: Session, event_type: str, entity_type: str, entity_id: str, details: dict[str, Any], actor: str = "local_operator") -> AuditLogRecord:
    row = AuditLogRecord(
        audit_id=_stable_id("audit", event_type, entity_type, entity_id, naive_utc_now().isoformat(), len(details)),
        created_at=naive_utc_now(),
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor=actor,
        details_json=details,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def adapter_health_summary(session: Session) -> list[AdapterHealthView]:
    settings = default_broker_adapter().snapshot()
    creds_present = {
        "telegram": False,
        "discord": False,
    }
    mock_status = "healthy" if settings.balances and settings.positions else "degraded"
    row = session.exec(select(AdapterHealthRecord).where(AdapterHealthRecord.adapter_name == "mock_broker")).first()
    if row is None:
        row = AdapterHealthRecord(health_id="adapter_health_mock_broker", adapter_name="mock_broker")
    row.status = mock_status
    row.checked_at = naive_utc_now()
    row.details_json = {
        "balances": len(settings.balances),
        "positions": len(settings.positions),
        "fill_imports": len(settings.fill_imports),
        "credentials_present": creds_present,
        "read_only": True,
    }
    session.add(row)
    session.commit()
    rows = session.exec(select(AdapterHealthRecord).order_by(desc(AdapterHealthRecord.checked_at))).all()
    return [
        AdapterHealthView(
            health_id=item.health_id,
            adapter_name=item.adapter_name,
            status=item.status,
            checked_at=item.checked_at,
            details=item.details_json,
        )
        for item in rows
    ]


def pilot_metric_summary(session: Session) -> PilotMetricSummaryView:
    tickets = list_trade_tickets(session)
    analytics = paper_trade_analytics(session)
    backlog = operational_backlog(session)
    alerts = session.exec(select(AlertRecord)).all()
    promoted = session.exec(select(StrategyRegistryEntry).where(StrategyRegistryEntry.lifecycle_state == "promoted")).all()

    total = len(tickets) or 1
    approved = sum(1 for row in tickets if row.approval_status == "approved")
    shadow = sum(1 for row in tickets if row.status == "shadow_active")
    executed = sum(1 for row in tickets if row.status == "manually_executed")
    divergences = 0
    slippage_variances: list[float] = []
    review_needed = 0
    mismatch_causes: Counter[str] = Counter()
    trust_by_asset: dict[str, list[float]] = {}
    for ticket in tickets:
        detail = get_trade_ticket_detail(session, ticket.ticket_id)
        if detail is None:
            continue
        if detail.shadow_summary and detail.shadow_summary.divergence_flag:
            divergences += 1
            mismatch_causes.update([detail.shadow_summary.divergence_reason or "shadow_divergence"])
        for fill in detail.manual_fills:
            slippage_variances.append(abs(fill.reconciliation.slippage_variance_bps))
            if fill.reconciliation.requires_review:
                review_needed += 1
                mismatch_causes.update(["reconciliation_review_needed"])
        if detail.data_reality is not None:
            trust_by_asset.setdefault(detail.data_reality.provenance.asset_class, []).append(detail.data_reality.realism_score)

    actionable_alerts = [row for row in alerts if row.severity in {"warning", "critical", "info"}]
    failed_or_suppressed = [row for row in actionable_alerts if row.status in {"failed", "suppressed"}]
    promoted_drift = analytics.hygiene_summary.promoted_strategy_drift_count

    summary = PilotMetricSummaryView(
        generated_at=naive_utc_now(),
        ticket_conversion={
            "created": float(total),
            "approved_rate": round(approved / total, 2),
            "shadow_rate": round(shadow / total, 2),
            "manual_execution_rate": round(executed / total, 2),
        },
        shadow_metrics={
            "divergence_rate": round(divergences / total, 2),
            "divergence_count": float(divergences),
            "shadow_active_count": float(shadow),
        },
        slippage_metrics={
            "avg_manual_slippage_variance_bps": round(sum(slippage_variances) / len(slippage_variances), 2) if slippage_variances else 0.0,
            "reconciliation_drift_count": float(review_needed),
            "manual_fill_count": float(len(slippage_variances)),
        },
        alert_metrics={
            "actionable_alert_count": float(len(actionable_alerts)),
            "ignored_alert_rate": round(backlog.overdue_count / max(1, len(actionable_alerts)), 2),
            "delivery_issue_rate": round(len(failed_or_suppressed) / max(1, len(actionable_alerts)), 2),
        },
        adherence_metrics={
            "adherence_rate": analytics.hygiene_summary.adherence_rate,
            "invalidation_discipline_rate": analytics.hygiene_summary.invalidation_discipline_rate,
            "realism_warning_violation_rate": analytics.hygiene_summary.realism_warning_violation_rate,
        },
        review_backlog_metrics={
            "review_backlog": float(analytics.hygiene_summary.review_backlog),
            "overdue_backlog": float(backlog.overdue_count),
            "high_priority_backlog": float(backlog.high_priority_count),
        },
        promoted_strategy_metrics={
            "promoted_count": float(len(promoted)),
            "degradation_rate": round(promoted_drift / max(1, len(promoted)), 2),
        },
        mismatch_causes=[{"cause": key, "count": value} for key, value in mismatch_causes.most_common(5)],
    )

    snapshot_id = f"pilot_{naive_utc_now().date().isoformat()}"
    row = session.exec(select(PilotMetricSnapshotRecord).where(PilotMetricSnapshotRecord.snapshot_id == snapshot_id)).first()
    if row is None:
        row = PilotMetricSnapshotRecord(snapshot_id=snapshot_id)
    row.generated_at = naive_utc_now()
    row.summary_json = summary.model_dump(mode="json")
    session.add(row)
    session.commit()
    return summary


def execution_gate_status(session: Session) -> ExecutionGateView:
    summary = pilot_metric_summary(session)
    adapter_health = adapter_health_summary(session)
    metrics = {
        "approved_rate": summary.ticket_conversion["approved_rate"],
        "shadow_divergence_rate": summary.shadow_metrics["divergence_rate"],
        "avg_manual_slippage_variance_bps": summary.slippage_metrics["avg_manual_slippage_variance_bps"],
        "review_backlog": summary.review_backlog_metrics["review_backlog"],
        "promoted_degradation_rate": summary.promoted_strategy_metrics["degradation_rate"],
    }
    thresholds: dict[str, float | int] = {
        "approved_rate_min": 0.3,
        "shadow_divergence_rate_max": 0.4,
        "avg_manual_slippage_variance_bps_max": 12.0,
        "review_backlog_max": 2,
        "promoted_degradation_rate_max": 0.4,
    }
    blockers: list[str] = []
    rationale: list[str] = []
    created_count = int(summary.ticket_conversion["created"])
    manual_execution_rate = summary.ticket_conversion["manual_execution_rate"]
    shadow_active_count = summary.shadow_metrics["shadow_active_count"]
    if metrics["approved_rate"] < thresholds["approved_rate_min"]:
        blockers.append("approved ticket conversion is below pilot threshold")
    if metrics["shadow_divergence_rate"] > thresholds["shadow_divergence_rate_max"]:
        blockers.append("shadow divergence is above threshold")
    if metrics["avg_manual_slippage_variance_bps"] > thresholds["avg_manual_slippage_variance_bps_max"]:
        blockers.append("manual fill slippage variance is too high")
    if metrics["review_backlog"] > thresholds["review_backlog_max"]:
        blockers.append("review backlog is too high")
    if metrics["promoted_degradation_rate"] > thresholds["promoted_degradation_rate_max"]:
        blockers.append("promoted strategy degradation rate is too high")
    if any(item.status != "healthy" for item in adapter_health):
        blockers.append("adapter health is degraded")
    if created_count <= 0:
        blockers.append("pilot baseline is not established yet")
    if created_count > 0 and shadow_active_count <= 0:
        blockers.append("shadow mode coverage has not been established yet")
    if created_count > 0 and manual_execution_rate <= 0:
        blockers.append("manual reconciliation baseline has not been established yet")

    status = "not_ready"
    if not blockers and manual_execution_rate > 0 and shadow_active_count > 0:
        status = "execution_candidate"
    elif blockers and created_count > 0:
        status = "review_required"
    elif created_count > 0:
        status = "pilot_running"
    rationale.append(f"Approved rate {metrics['approved_rate']:.2f} against minimum {thresholds['approved_rate_min']:.2f}.")
    rationale.append(f"Shadow divergence {metrics['shadow_divergence_rate']:.2f} against max {thresholds['shadow_divergence_rate_max']:.2f}.")
    return ExecutionGateView(status=status, blockers=blockers, thresholds=thresholds, metrics=metrics, rationale=rationale)


def recent_audit_logs(session: Session, limit: int = 12) -> list[AuditLogView]:
    rows = session.exec(select(AuditLogRecord).order_by(desc(AuditLogRecord.created_at))).all()[:limit]
    return [
        AuditLogView(
            audit_id=row.audit_id,
            created_at=row.created_at,
            event_type=row.event_type,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            actor=row.actor,
            details=row.details_json,
        )
        for row in rows
    ]


def pilot_dashboard(session: Session) -> PilotDashboardView:
    summary = pilot_metric_summary(session)
    gate = execution_gate_status(session)
    health = adapter_health_summary(session)
    trust_map: dict[str, list[float]] = {}
    divergence_hotspots: list[dict[str, Any]] = []
    for ticket in list_trade_tickets(session):
        if ticket.data_reality is not None:
            trust_map.setdefault(ticket.data_reality.provenance.asset_class, []).append(ticket.data_reality.realism_score)
        detail = get_trade_ticket_detail(session, ticket.ticket_id)
        if detail and detail.shadow_summary and detail.shadow_summary.divergence_flag:
            divergence_hotspots.append(
                {
                    "ticket_id": ticket.ticket_id,
                    "symbol": ticket.symbol,
                    "reason": detail.shadow_summary.divergence_reason,
                    "freshness_state": detail.shadow_summary.freshness_state,
                }
            )
    trust_by_asset_class = [
        {"asset_class": key, "avg_realism_score": round(sum(values) / len(values), 2), "count": len(values)}
        for key, values in sorted(trust_map.items())
    ]
    return PilotDashboardView(
        generated_at=naive_utc_now(),
        pilot_metrics=summary,
        trust_by_asset_class=trust_by_asset_class,
        divergence_hotspots=divergence_hotspots,
        operator_discipline={
            "adherence_rate": summary.adherence_metrics["adherence_rate"],
            "ignored_alert_rate": summary.alert_metrics["ignored_alert_rate"],
            "review_completion_pressure": summary.review_backlog_metrics["review_backlog"],
        },
        review_backlog=operational_backlog(session),
        execution_gate=gate,
        adapter_health=health,
        recent_audit_logs=recent_audit_logs(session),
    )


def refresh_pilot_alerts(session: Session) -> None:
    gate = execution_gate_status(session)
    summary = pilot_metric_summary(session)
    health = adapter_health_summary(session)
    if gate.status in {"not_ready", "review_required"}:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("pilot_gate_regression", gate.status),
                created_at=naive_utc_now(),
                asset_ids=[],
                severity="warning",
                category="pilot_gate_regression",
                channel_targets=choose_channel_targets("warning"),
                title="Pilot gate requires review",
                body="Execution gate is below candidate status. " + "; ".join(gate.blockers[:3]),
                tags=["pilot_gate", gate.status],
                dedupe_key=f"pilot_gate_regression:{gate.status}",
                data_quality="fixture",
            ),
        )
    unhealthy = [row for row in health if row.status != "healthy"]
    if unhealthy:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("adapter_health_failure", *(row.adapter_name for row in unhealthy)),
                created_at=naive_utc_now(),
                asset_ids=[],
                severity="warning",
                category="adapter_health_failure",
                channel_targets=choose_channel_targets("warning"),
                title="Adapter health degraded",
                body="One or more read-only adapters failed health checks.",
                tags=["adapter_health"],
                dedupe_key="adapter_health_failure:" + ",".join(sorted(row.adapter_name for row in unhealthy)),
                data_quality="fixture",
            ),
        )
    if summary.shadow_metrics["divergence_rate"] > 0.4:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("excessive_divergence", summary.shadow_metrics["divergence_count"]),
                created_at=naive_utc_now(),
                asset_ids=[],
                severity="warning",
                category="excessive_divergence",
                channel_targets=choose_channel_targets("warning"),
                title="Shadow divergence elevated",
                body=f"Shadow divergence rate is {summary.shadow_metrics['divergence_rate']:.2f}.",
                tags=["shadow_mode"],
                dedupe_key=f"excessive_divergence:{summary.shadow_metrics['divergence_count']}",
                data_quality="fixture",
            ),
        )
    if summary.slippage_metrics["reconciliation_drift_count"] > 0:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("manual_reconciliation_backlog", summary.slippage_metrics["reconciliation_drift_count"]),
                created_at=naive_utc_now(),
                asset_ids=[],
                severity="info",
                category="manual_reconciliation_backlog",
                channel_targets=choose_channel_targets("info"),
                title="Manual reconciliation backlog",
                body=f"{int(summary.slippage_metrics['reconciliation_drift_count'])} fills need reconciliation review.",
                tags=["reconciliation"],
                dedupe_key=f"manual_reconciliation_backlog:{summary.slippage_metrics['reconciliation_drift_count']}",
                data_quality="fixture",
            ),
        )
    overrides = [
        row for row in session.exec(select(AuditLogRecord).where(AuditLogRecord.event_type == "checklist_override")).all()
    ]
    if len(overrides) >= 2:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("repeated_checklist_overrides", len(overrides)),
                created_at=naive_utc_now(),
                asset_ids=[],
                severity="warning",
                category="repeated_checklist_overrides",
                channel_targets=choose_channel_targets("warning"),
                title="Repeated checklist overrides",
                body=f"{len(overrides)} checklist overrides have been recorded in pilot mode.",
                tags=["checklist_override"],
                dedupe_key=f"repeated_checklist_overrides:{len(overrides)}",
                data_quality="fixture",
            ),
        )
