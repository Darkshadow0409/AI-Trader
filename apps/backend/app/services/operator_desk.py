from __future__ import annotations

import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

from sqlalchemy import desc
from sqlmodel import Session, select

from app.core.clock import naive_utc_now
from app.core.settings import get_settings
from app.models.entities import TradeTicketRecord
from app.models.schemas import (
    CommandCenterStatusView,
    DegradedSourceView,
    DeskSummaryView,
    ExecutionGateView,
    OperationalBacklogItemView,
    OperationalBacklogView,
    PilotExportResponse,
    SessionStateView,
    TradeTicketChecklistView,
    TradeTicketView,
)
from app.services.dashboard_data import dashboard_ribbon, list_signal_views
from app.services.ops_runtime import ACTION_SPECS, list_action_specs, ops_summary
from app.services.operator_console import list_opportunities
from app.services.paper_trading import ACTIVE_PAPER_STATUSES, list_paper_trades
from app.services.pilot_ops import adapter_health_snapshot, execution_gate_snapshot, recent_audit_logs
from app.services.session_workflow import SESSION_TITLES, _attention_rows, list_review_tasks_snapshot


settings = get_settings()
ROOT = settings.repo_root
DESK_RESPONSE_BUDGET_SECONDS = 2.5


def _file_mtime(path: Path | None) -> datetime | None:
    if path is None or not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).replace(tzinfo=None)


def _latest_export_dir() -> Path | None:
    exports_root = ROOT / "data" / "exports"
    if not exports_root.exists():
        return None
    candidates = [path for path in exports_root.iterdir() if path.is_dir() and path.name.startswith("pilot_report_")]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item.stat().st_mtime)


def _runtime_status(source_mode: str, pipeline_status: str) -> str:
    if pipeline_status not in {"completed", "ok"}:
        return "attention"
    if source_mode == "sample":
        return "fixture_mode"
    return "live_capable"


def _desk_blocked_reasons(payload: dict[str, object] | None) -> list[str]:
    if not isinstance(payload, dict):
        return []
    blocked = payload.get("blocked_reasons")
    if not isinstance(blocked, list):
        return []
    return [str(item) for item in blocked]


def _ticket_checklist(payload: dict[str, object] | None) -> TradeTicketChecklistView:
    data = payload if isinstance(payload, dict) else {}
    return TradeTicketChecklistView(
        freshness_acceptable=bool(data.get("freshness_acceptable", False)),
        realism_acceptable=bool(data.get("realism_acceptable", False)),
        risk_budget_available=bool(data.get("risk_budget_available", False)),
        cluster_exposure_acceptable=bool(data.get("cluster_exposure_acceptable", False)),
        review_complete=bool(data.get("review_complete", False)),
        operator_acknowledged=bool(data.get("operator_acknowledged", False)),
        completed=bool(data.get("completed", False)),
        blocked_reasons=_desk_blocked_reasons(data),
    )


def _desk_ticket_view(row: TradeTicketRecord) -> TradeTicketView:
    freshness_minutes = int(
        row.freshness_summary_json.get("freshness_minutes", max(0, int((naive_utc_now() - row.updated_at).total_seconds() // 60)))
    )
    return TradeTicketView(
        ticket_id=row.ticket_id,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        trade_id=row.trade_id,
        strategy_id=row.strategy_id,
        symbol=row.symbol,
        side=row.side,
        proposed_entry_zone=row.proposed_entry_zone_json,
        planned_stop=row.planned_stop,
        planned_targets=row.planned_targets_json,
        planned_size=row.planned_size_json,
        realism_summary=row.realism_summary_json,
        freshness_summary=row.freshness_summary_json,
        checklist_status=_ticket_checklist(row.checklist_status_json),
        approval_status=row.approval_status,
        status=row.status,
        shadow_status=row.shadow_status,
        created_at=row.created_at,
        expires_at=row.expires_at,
        notes=row.notes,
        freshness_minutes=freshness_minutes,
        linked_signal_family="",
        paper_account=None,
        data_reality=None,
    )


def _desk_ticket_rows(session: Session) -> list[TradeTicketRecord]:
    return session.exec(select(TradeTicketRecord).order_by(desc(TradeTicketRecord.updated_at))).all()


def _shadow_divergence_rows(rows: list[TradeTicketRecord]) -> list[dict[str, object]]:
    payload: list[dict[str, object]] = []
    for row in rows:
        summary = row.shadow_summary_json if isinstance(row.shadow_summary_json, dict) else {}
        if not summary.get("divergence_flag"):
            continue
        payload.append(
            {
                "ticket_id": row.ticket_id,
                "symbol": row.symbol,
                "reason": str(summary.get("divergence_reason") or "shadow_divergence"),
                "observed_vs_plan_pct": float(summary.get("observed_vs_plan_pct", 0.0)),
                "freshness_state": str(summary.get("freshness_state") or "unknown"),
            }
        )
    return payload


def _degraded_sources_from_opportunities(opportunities) -> list[DegradedSourceView]:
    degraded: list[DegradedSourceView] = []
    for item in opportunities.focus_queue + opportunities.scout_queue:
        if item.data_reality is None:
            continue
        if item.data_reality.freshness_state == "fresh" and item.data_reality.execution_suitability not in {"context_only", "research_only"}:
            continue
        degraded.append(
            DegradedSourceView(
                symbol=item.symbol,
                source_type=item.data_reality.provenance.source_type,
                source_timing=item.data_reality.provenance.source_timing,
                freshness_state=item.data_reality.freshness_state,
                realism_grade=item.data_reality.provenance.realism_grade,
                warning=item.data_reality.ui_warning,
            )
        )
    return degraded


def _task_freshness_status(task_minutes: list[int]) -> str:
    if not task_minutes:
        return "unknown"
    max_minutes = max(task_minutes)
    if max_minutes >= 1440:
        return "stale"
    if max_minutes >= 240:
        return "aging"
    return "fresh"


def _session_states(tasks) -> list[SessionStateView]:
    state_order = ["pre_session", "live_session", "post_session", "weekly_review", "strategy_review"]
    states: list[SessionStateView] = []
    for state in state_order:
        rows = [task for task in tasks if task.session_state == state]
        overdue_count = sum(1 for task in rows if task.overdue)
        high_priority_count = sum(1 for task in rows if task.priority == "high")
        states.append(
            SessionStateView(
                state=state,
                title=SESSION_TITLES[state],
                headline=f"{len(rows)} active items",
                summary="No open review work." if not rows else f"{overdue_count} overdue / {high_priority_count} high priority.",
                item_count=len(rows),
                overdue_count=overdue_count,
                high_priority_count=high_priority_count,
                freshness_status=_task_freshness_status([task.freshness_minutes for task in rows]),
            )
        )
    return states


def _operational_backlog(tasks, attention_rows) -> OperationalBacklogView:
    items: list[OperationalBacklogItemView] = []
    for task in tasks:
        if task.state not in {"open", "overdue", "in_progress"}:
            continue
        items.append(
            OperationalBacklogItemView(
                item_id=task.task_id,
                category=task.task_type,
                title=task.title,
                priority=task.priority,
                status=task.state,
                linked_symbol=task.linked_symbol,
                linked_entity_type=task.linked_entity_type,
                linked_entity_id=task.linked_entity_id,
                due_at=task.due_at,
                freshness_minutes=task.freshness_minutes,
                note=task.summary,
            )
        )
    for trade in attention_rows:
        if trade.freshness_minutes < 720:
            continue
        items.append(
            OperationalBacklogItemView(
                item_id=f"backlog_stale_trade_{trade.trade_id}",
                category="stale_open_trade",
                title=f"{trade.symbol} stale open trade",
                priority="high",
                status="overdue",
                linked_symbol=trade.symbol,
                linked_entity_type="paper_trade",
                linked_entity_id=trade.trade_id,
                due_at=None,
                freshness_minutes=trade.freshness_minutes,
                note=trade.attention_reason,
            )
        )
    return OperationalBacklogView(
        generated_at=naive_utc_now(),
        overdue_count=sum(1 for item in items if item.status == "overdue"),
        high_priority_count=sum(1 for item in items if item.priority == "high"),
        items=items,
    )


def _section_note(name: str, *, skipped: bool = False) -> str:
    if skipped:
        return f"{name.replace('_', ' ').capitalize()} skipped to keep the desk responsive."
    return f"{name.replace('_', ' ').capitalize()} is temporarily degraded. Core desk data is still available."


def _execution_gate_snapshot_or_error(session: Session) -> ExecutionGateView:
    gate = execution_gate_snapshot(session)
    if gate is None:
        raise RuntimeError("Execution gate snapshot is unavailable.")
    return gate


def command_center_status(session: Session) -> CommandCenterStatusView:
    ribbon = dashboard_ribbon(session)
    ops = ops_summary(session)
    latest_export = _latest_export_dir()
    review_bundle = ROOT / "review_bundle.zip"
    frontend_build = ROOT / "apps" / "frontend" / "dist" / "index.html"
    diagnostics = settings.diagnostics_full_path / "latest_pipeline_timings.json"
    specs = list_action_specs()
    return CommandCenterStatusView(
        generated_at=naive_utc_now(),
        runtime_status=_runtime_status(ribbon.source_mode, ribbon.pipeline_status),
        backend_health="ok" if ribbon.pipeline_status in {"completed", "ok"} else "attention",
        frontend_runtime_status="built" if frontend_build.exists() else "dev_only",
        source_mode=ribbon.source_mode,
        pipeline_status=ribbon.pipeline_status,
        pipeline_freshness_minutes=ribbon.data_freshness_minutes,
        last_refresh=ribbon.last_refresh,
        latest_export_path=str(latest_export) if latest_export else None,
        latest_export_generated_at=_file_mtime(latest_export),
        latest_review_bundle_path=str(review_bundle) if review_bundle.exists() else None,
        latest_review_bundle_generated_at=_file_mtime(review_bundle),
        frontend_build_generated_at=_file_mtime(frontend_build),
        diagnostics_updated_at=_file_mtime(diagnostics),
        verify_fast_available=True,
        verify_full_available=True,
        review_bundle_available=True,
        available_actions=list(ACTION_SPECS),
        safe_actions=[item for item in specs if not item.is_heavy],
        heavy_actions=[item for item in specs if item.is_heavy],
        latest_fast_verify=ops.latest_fast_verify,
        latest_full_verify=ops.latest_full_verify,
        latest_export=ops.latest_export,
        latest_bundle=ops.latest_bundle,
        latest_refresh_action=ops.latest_refresh,
        latest_contract_snapshot=ops.latest_contract_snapshot,
        action_history=ops.action_history,
        notes=[
            "Safe operator actions only. No raw shell execution is exposed.",
            "Heavy actions require explicit confirmation in the UI before they run.",
            "Pilot export and contract snapshots reuse local fixture-safe reporting paths.",
        ],
    )


def trigger_pilot_export(session: Session) -> PilotExportResponse:
    command = [sys.executable, "scripts/pilot_export.py", "--no-refresh"]
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=True)
    report_path = completed.stdout.strip().splitlines()[-1].strip()
    ribbon = dashboard_ribbon(session)
    return PilotExportResponse(
        generated_at=naive_utc_now(),
        report_path=report_path,
        source_mode=ribbon.source_mode,
        pipeline_status=ribbon.pipeline_status,
    )


def desk_summary(session: Session) -> DeskSummaryView:
    started_at = perf_counter()
    section_readiness: dict[str, str] = {}
    section_notes: dict[str, str] = {}

    def capture(name: str, builder, fallback, *, optional: bool = False):
        if optional and perf_counter() - started_at >= DESK_RESPONSE_BUDGET_SECONDS:
            section_readiness[name] = "degraded"
            section_notes[name] = _section_note(name, skipped=True)
            return fallback
        try:
            value = builder()
        except Exception:
            section_readiness[name] = "degraded"
            section_notes[name] = _section_note(name)
            return fallback
        section_readiness[name] = "ready"
        return value

    review_tasks = capture("review_tasks", lambda: list_review_tasks_snapshot(session, limit=8), [])
    active_paper_trades = capture("active_paper_trades", lambda: list_paper_trades(session, statuses=ACTIVE_PAPER_STATUSES)[:8], [])
    attention_rows = capture("trade_attention", lambda: _attention_rows(session), [])
    execution_gate = capture(
        "execution_gate",
        lambda: _execution_gate_snapshot_or_error(session),
        ExecutionGateView(status="not_ready", blockers=[], thresholds={}, metrics={}, rationale=[]),
    )
    session_states = capture("session_states", lambda: _session_states(review_tasks), [])
    operational_backlog = capture(
        "operational_backlog",
        lambda: _operational_backlog(review_tasks, attention_rows),
        OperationalBacklogView(generated_at=naive_utc_now(), overdue_count=0, high_priority_count=0, items=[]),
    )
    signal_rows = capture("high_priority_signals", lambda: list_signal_views(session)[:8], [])
    high_risk_signals = capture(
        "high_risk_signals",
        lambda: [row for row in signal_rows if row.noise_probability >= 0.35 or row.uncertainty >= 0.33 or row.signal_type == "event_driven"][:6],
        [],
    )
    opportunities = capture("focus_opportunities", lambda: list_opportunities(session), None)
    focus_opportunities = opportunities.focus_queue[:6] if opportunities is not None else []
    degraded_sources = _degraded_sources_from_opportunities(opportunities)[:8] if opportunities is not None else []
    if "focus_opportunities" in section_readiness and section_readiness["focus_opportunities"] == "ready":
        section_readiness["degraded_sources"] = "ready"
    else:
        section_readiness["degraded_sources"] = "degraded"
        section_notes.setdefault("degraded_sources", _section_note("degraded_sources"))
    ticket_rows = capture("open_tickets", lambda: _desk_ticket_rows(session), [])
    open_tickets = [_desk_ticket_view(row) for row in ticket_rows[:8]]
    shadow_divergence = capture("shadow_divergence", lambda: _shadow_divergence_rows(ticket_rows)[:8], [])
    adapter_health = capture("adapter_health", lambda: adapter_health_snapshot(session), [], optional=True)
    audit_log_tail = capture("audit_log_tail", lambda: recent_audit_logs(session, limit=8), [], optional=True)

    return DeskSummaryView(
        generated_at=naive_utc_now(),
        session_states=session_states,
        execution_gate=execution_gate,
        operational_backlog=operational_backlog,
        section_readiness=section_readiness,
        section_notes=section_notes,
        review_tasks=review_tasks,
        degraded_sources=degraded_sources,
        high_priority_signals=signal_rows,
        high_risk_signals=high_risk_signals,
        focus_opportunities=focus_opportunities,
        open_tickets=open_tickets,
        active_paper_trades=active_paper_trades,
        shadow_divergence=shadow_divergence,
        adapter_health=adapter_health,
        audit_log_tail=audit_log_tail,
    )
