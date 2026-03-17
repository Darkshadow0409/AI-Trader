from __future__ import annotations

import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlmodel import Session

from app.core.clock import naive_utc_now
from app.core.settings import get_settings
from app.models.schemas import CommandCenterStatusView, DeskSummaryView, PilotExportResponse
from app.services.dashboard_data import dashboard_ribbon, list_high_risk_signal_views, list_signal_views
from app.services.ops_runtime import ACTION_SPECS, list_action_specs, ops_summary
from app.services.operator_console import list_opportunities
from app.services.paper_trading import ACTIVE_PAPER_STATUSES, list_paper_trades
from app.services.pilot_ops import adapter_health_summary, execution_gate_status, recent_audit_logs
from app.services.session_workflow import daily_briefing, operational_backlog, refresh_review_tasks, session_overview
from app.services.trade_tickets import get_trade_ticket_detail, list_trade_tickets


settings = get_settings()
ROOT = settings.repo_root


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
    overview = session_overview(session)
    gate = execution_gate_status(session)
    backlog = operational_backlog(session)
    briefing = daily_briefing(session)
    opportunities = list_opportunities(session)
    tickets = list_trade_tickets(session)
    active_paper_trades = list_paper_trades(session, statuses=ACTIVE_PAPER_STATUSES)
    shadow_divergence: list[dict[str, object]] = []
    for ticket in tickets:
        detail = get_trade_ticket_detail(session, ticket.ticket_id)
        if detail is None or detail.shadow_summary is None or not detail.shadow_summary.divergence_flag:
            continue
        shadow_divergence.append(
            {
                "ticket_id": detail.ticket_id,
                "symbol": detail.symbol,
                "reason": detail.shadow_summary.divergence_reason or "shadow_divergence",
                "observed_vs_plan_pct": detail.shadow_summary.observed_vs_plan_pct,
                "freshness_state": detail.shadow_summary.freshness_state,
            }
        )

    return DeskSummaryView(
        generated_at=naive_utc_now(),
        session_states=overview.states,
        execution_gate=gate,
        operational_backlog=backlog,
        review_tasks=refresh_review_tasks(session)[:8],
        degraded_sources=briefing.degraded_data_sources[:8],
        high_priority_signals=list_signal_views(session)[:8],
        high_risk_signals=list_high_risk_signal_views(session)[:6],
        focus_opportunities=opportunities.focus_queue[:6],
        open_tickets=tickets[:8],
        active_paper_trades=active_paper_trades[:8],
        shadow_divergence=shadow_divergence[:8],
        adapter_health=adapter_health_summary(session),
        audit_log_tail=recent_audit_logs(session, limit=8),
    )
