from __future__ import annotations

from sqlmodel import Session
from sqlmodel import delete
from sqlmodel import select

from app.core.database import engine
from app.models.entities import AlertRecord, RiskReport, SignalRecord
from app.models.schemas import TradeTicketCreateRequest
from app.services.operator_console import refresh_alerts
from app.services.pipeline import seed_and_refresh
from app.services import pilot_ops
from app.services.pilot_ops import (
    adapter_health_summary,
    execution_gate_snapshot,
    execution_gate_status,
    pilot_dashboard,
    pilot_metric_summary,
    recent_audit_logs,
    refresh_pilot_alerts,
)
from app.services.trade_tickets import create_trade_ticket


def test_pilot_metric_aggregation_and_gate_transition() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        summary = pilot_metric_summary(session)
        gate = execution_gate_status(session)
    assert summary.ticket_conversion["created"] >= 1
    assert "approved_rate" in summary.ticket_conversion
    assert gate.status in {"not_ready", "pilot_running", "review_required", "execution_candidate"}
    assert isinstance(gate.blockers, list)


def test_adapter_health_and_audit_logs_persist() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        signal = session.exec(select(SignalRecord)).first()
        risk = session.exec(select(RiskReport)).first()
        assert signal is not None and risk is not None
        _ = create_trade_ticket(
            session,
            TradeTicketCreateRequest(
                signal_id=signal.signal_id,
                risk_report_id=risk.risk_report_id,
                symbol="BTC",
                side="long",
                notes="pilot audit",
            ),
        )
        health = adapter_health_summary(session)
        audit = recent_audit_logs(session)
    assert health
    assert health[0].status in {"healthy", "degraded"}
    assert audit


def test_pilot_dashboard_exposes_blockers_and_backlog() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        dashboard = pilot_dashboard(session)
    assert "status" in dashboard.execution_gate.model_dump()
    assert dashboard.review_backlog.items
    assert isinstance(dashboard.recent_audit_logs, list)


def test_execution_gate_never_reports_not_ready_without_blockers(monkeypatch) -> None:
    seed_and_refresh()
    with Session(engine) as session:
        monkeypatch.setattr(
            "app.services.pilot_ops.pilot_metric_summary",
            lambda _session: type(
                "Summary",
                (),
                {
                    "ticket_conversion": {"created": 0.0, "approved_rate": 0.0, "shadow_rate": 0.0, "manual_execution_rate": 0.0},
                    "shadow_metrics": {"divergence_rate": 0.0, "divergence_count": 0.0, "shadow_active_count": 0.0},
                    "slippage_metrics": {"avg_manual_slippage_variance_bps": 0.0},
                    "review_backlog_metrics": {"review_backlog": 0.0},
                    "promoted_strategy_metrics": {"degradation_rate": 0.0},
                },
            )(),
        )
        monkeypatch.setattr("app.services.pilot_ops.adapter_health_summary", lambda _session: [])
        gate = execution_gate_status(session)

    assert gate.status == "not_ready"
    assert gate.blockers


def test_pilot_metric_summary_survives_alert_mutation_during_ticket_expansion(monkeypatch) -> None:
    seed_and_refresh()
    with Session(engine) as session:
        refresh_alerts(session)
        original_detail = pilot_ops.get_trade_ticket_detail

        def deleting_detail(inner_session, ticket_id):
            inner_session.exec(delete(AlertRecord))
            inner_session.commit()
            return original_detail(inner_session, ticket_id)

        monkeypatch.setattr("app.services.pilot_ops.get_trade_ticket_detail", deleting_detail)
        summary = pilot_metric_summary(session)
        gate = execution_gate_status(session)

    assert summary.alert_metrics["actionable_alert_count"] >= 0
    assert gate.status in {"not_ready", "pilot_running", "review_required", "execution_candidate"}


def test_refresh_pilot_alerts_uses_snapshots_instead_of_heavy_recomputes(monkeypatch) -> None:
    seed_and_refresh()
    with Session(engine) as session:
        summary = pilot_metric_summary(session)
        gate = execution_gate_snapshot(session)
        assert gate is not None

        monkeypatch.setattr("app.services.pilot_ops.pilot_metric_summary", lambda _session: (_ for _ in ()).throw(AssertionError("heavy summary should not run")))
        monkeypatch.setattr("app.services.pilot_ops.execution_gate_status", lambda _session: (_ for _ in ()).throw(AssertionError("heavy gate should not run")))
        monkeypatch.setattr("app.services.pilot_ops.adapter_health_summary", lambda _session: (_ for _ in ()).throw(AssertionError("heavy adapter health should not run")))
        monkeypatch.setattr("app.services.pilot_ops.latest_pilot_metric_summary", lambda _session: summary)
        monkeypatch.setattr("app.services.pilot_ops.execution_gate_snapshot", lambda _session: gate)

        refresh_pilot_alerts(session)
