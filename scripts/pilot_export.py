from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "apps" / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlmodel import Session, select  # noqa: E402

from app.core.clock import naive_utc_now  # noqa: E402
from app.core.database import engine, init_db  # noqa: E402
from app.models.entities import PaperTradeReviewRecord, SignalRecord  # noqa: E402
from app.services.paper_trading import paper_trade_analytics  # noqa: E402
from app.services.pilot_ops import execution_gate_status, pilot_dashboard, pilot_metric_summary  # noqa: E402
from app.services.pipeline import seed_and_refresh  # noqa: E402
from app.services.session_workflow import daily_briefing, operational_backlog, weekly_review  # noqa: E402
from app.services.trade_tickets import get_trade_ticket_detail, list_trade_tickets  # noqa: E402
from app.strategy_lab.service import list_strategies, strategy_detail_view  # noqa: E402


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _ticket_funnel_payload(session: Session) -> dict[str, Any]:
    tickets = list_trade_tickets(session)
    by_status: dict[str, int] = {}
    by_approval: dict[str, int] = {}
    for ticket in tickets:
        by_status[ticket.status] = by_status.get(ticket.status, 0) + 1
        by_approval[ticket.approval_status] = by_approval.get(ticket.approval_status, 0) + 1
    return {
        "generated_at": naive_utc_now().isoformat(),
        "total_tickets": len(tickets),
        "by_status": by_status,
        "by_approval_status": by_approval,
    }


def _divergence_payload(session: Session) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    reasons: dict[str, int] = {}
    for ticket in list_trade_tickets(session):
        detail = get_trade_ticket_detail(session, ticket.ticket_id)
        if detail is None or detail.shadow_summary is None or not detail.shadow_summary.divergence_flag:
            continue
        reason = detail.shadow_summary.divergence_reason or "shadow_divergence"
        reasons[reason] = reasons.get(reason, 0) + 1
        rows.append(
            {
                "ticket_id": ticket.ticket_id,
                "signal_id": ticket.signal_id,
                "symbol": ticket.symbol,
                "reason": reason,
                "freshness_state": detail.shadow_summary.freshness_state,
                "observed_vs_plan_pct": detail.shadow_summary.observed_vs_plan_pct,
                "market_path_note": detail.shadow_summary.market_path_note,
            }
        )
    return {
        "generated_at": naive_utc_now().isoformat(),
        "count": len(rows),
        "by_reason": reasons,
        "rows": rows,
    }


def _adherence_payload(session: Session) -> dict[str, Any]:
    analytics = paper_trade_analytics(session)
    return {
        "generated_at": analytics.generated_at.isoformat(),
        "hygiene_summary": analytics.hygiene_summary.model_dump(mode="json"),
        "by_signal_family": [row.model_dump(mode="json") for row in analytics.by_signal_family],
        "by_asset_class": [row.model_dump(mode="json") for row in analytics.by_asset_class],
        "by_realism_grade": [row.model_dump(mode="json") for row in analytics.by_realism_grade],
        "by_freshness_state": [row.model_dump(mode="json") for row in analytics.by_freshness_state],
    }


def _realism_warning_payload(session: Session) -> dict[str, Any]:
    rows = session.exec(select(PaperTradeReviewRecord)).all()
    violations = [
        {
            "trade_id": row.trade_id,
            "signal_id": row.signal_id,
            "risk_report_id": row.risk_report_id,
            "realism_warning_ignored": row.realism_warning_ignored,
            "failure_categories": row.failure_categories_json,
            "operator_notes": row.operator_notes,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
        if bool(row.realism_warning_ignored)
    ]
    return {
        "generated_at": naive_utc_now().isoformat(),
        "count": len(violations),
        "violations": violations,
    }


def _strategy_degradation_payload(session: Session) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for strategy in list_strategies(session):
        detail = strategy_detail_view(session, strategy)
        if detail.lifecycle_state != "promoted" and detail.promotion_rationale.recommended_state != "demoted":
            continue
        rows.append(
            {
                "name": detail.name,
                "lifecycle_state": detail.lifecycle_state,
                "recommended_state": detail.promotion_rationale.recommended_state,
                "gate_results": detail.promotion_rationale.gate_results,
                "penalties": [item.model_dump(mode="json") for item in detail.promotion_rationale.penalties],
                "notes": detail.promotion_rationale.notes,
                "forward_validation_summary": detail.forward_validation_summary.model_dump(mode="json"),
                "operator_feedback_summary": detail.operator_feedback_summary.model_dump(mode="json")
                if detail.operator_feedback_summary is not None
                else None,
            }
        )
    return {
        "generated_at": naive_utc_now().isoformat(),
        "count": len(rows),
        "strategies": rows,
    }


def _summary_markdown(payloads: dict[str, Any]) -> str:
    pilot_metrics = payloads["pilot_metrics"]
    gate = payloads["execution_gate"]
    divergences = payloads["divergence_summaries"]
    realism = payloads["realism_warning_violations"]
    strategy = payloads["strategy_degradation_summaries"]
    return "\n".join(
        [
            "# Pilot Export Summary",
            "",
            f"- generated_at: `{payloads['generated_at']}`",
            f"- gate_status: `{gate['status']}`",
            f"- gate_blockers: `{len(gate['blockers'])}`",
            f"- tickets_created: `{int(pilot_metrics['ticket_conversion']['created'])}`",
            f"- approved_rate: `{pilot_metrics['ticket_conversion']['approved_rate']}`",
            f"- shadow_divergence_rate: `{pilot_metrics['shadow_metrics']['divergence_rate']}`",
            f"- reconciliation_drift_count: `{int(pilot_metrics['slippage_metrics']['reconciliation_drift_count'])}`",
            f"- review_backlog: `{int(pilot_metrics['review_backlog_metrics']['review_backlog'])}`",
            f"- realism_warning_violations: `{realism['count']}`",
            f"- divergence_rows: `{divergences['count']}`",
            f"- promoted_or_degrading_strategies: `{strategy['count']}`",
            "",
            "## Gate Blockers",
            *([f"- {item}" for item in gate["blockers"]] or ["- none"]),
            "",
            "## Top Divergence Reasons",
            *([f"- {key}: {value}" for key, value in divergences["by_reason"].items()] or ["- none"]),
        ]
    ) + "\n"


def build_export(output_root: Path, refresh: bool) -> Path:
    if refresh:
        seed_and_refresh()
    else:
        init_db()
        with Session(engine) as session:
            if session.exec(select(SignalRecord)).first() is None:
                seed_and_refresh()

    timestamp = naive_utc_now().strftime("%Y%m%d_%H%M%S")
    report_dir = output_root / f"pilot_report_{timestamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    with Session(engine) as session:
        payloads: dict[str, Any] = {
            "generated_at": naive_utc_now().isoformat(),
            "pilot_metrics": pilot_metric_summary(session).model_dump(mode="json"),
            "ticket_funnel": _ticket_funnel_payload(session),
            "divergence_summaries": _divergence_payload(session),
            "adherence_summaries": _adherence_payload(session),
            "realism_warning_violations": _realism_warning_payload(session),
            "strategy_degradation_summaries": _strategy_degradation_payload(session),
            "execution_gate": execution_gate_status(session).model_dump(mode="json"),
            "pilot_dashboard": pilot_dashboard(session).model_dump(mode="json"),
            "daily_briefing": daily_briefing(session).model_dump(mode="json"),
            "weekly_review": weekly_review(session).model_dump(mode="json"),
            "operational_backlog": operational_backlog(session).model_dump(mode="json"),
        }

    for name, payload in payloads.items():
        if name == "generated_at":
            continue
        _write_json(report_dir / f"{name}.json", payload)
    (report_dir / "SUMMARY.md").write_text(_summary_markdown(payloads), encoding="utf-8")
    return report_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Export current pilot-mode operational summaries.")
    parser.add_argument(
        "--output-root",
        default=str(ROOT / "data" / "exports"),
        help="Folder where timestamped pilot export directories will be created.",
    )
    parser.add_argument(
        "--no-refresh",
        action="store_true",
        help="Do not refresh the fixture pipeline before export. If the local DB is empty, a seed refresh still runs.",
    )
    args = parser.parse_args()

    report_dir = build_export(Path(args.output_root), refresh=not args.no_refresh)
    print(report_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
