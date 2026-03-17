from __future__ import annotations

from collections import Counter, defaultdict

from sqlmodel import Session

from app.core.clock import naive_utc_now
from app.models.schemas import HomeOperatorSummaryView, PilotSummaryView, ReviewSummaryView, SignalsSummaryView, TicketSummaryView
from app.services.operator_desk import desk_summary
from app.services.paper_trading import paper_trade_analytics
from app.services.pilot_ops import adapter_health_summary, execution_gate_status, pilot_dashboard, recent_audit_logs
from app.services.session_workflow import operational_backlog, session_overview, weekly_review
from app.services.trade_tickets import get_trade_ticket_detail, list_trade_tickets
from app.services.dashboard_data import list_signal_views


def home_operator_summary(session: Session) -> HomeOperatorSummaryView:
    desk = desk_summary(session)
    state = next((row.state for row in desk.session_states if row.high_priority_count or row.overdue_count), None) or "pre_session"
    open_ticket_counts = Counter(ticket.status for ticket in desk.open_tickets)
    active_trade_counts = Counter(trade.status for trade in desk.active_paper_trades)
    adapter_status_counts = Counter(item.status for item in desk.adapter_health)
    divergence_count = len(desk.shadow_divergence)
    max_divergence = max((float(item.get("observed_vs_plan_pct", 0.0)) for item in desk.shadow_divergence), default=0.0)
    return HomeOperatorSummaryView(
        generated_at=naive_utc_now(),
        session_states=desk.session_states,
        session_state=state,
        pilot_gate_state=desk.execution_gate.status,
        degraded_source_count=len(desk.degraded_sources),
        review_backlog_counts={
            "overdue": desk.operational_backlog.overdue_count,
            "high_priority": desk.operational_backlog.high_priority_count,
            "open_reviews": len(desk.review_tasks),
        },
        top_signals_summary=desk.high_priority_signals[:6],
        open_ticket_counts=dict(open_ticket_counts),
        active_trade_counts=dict(active_trade_counts),
        shadow_divergence_summary={"count": divergence_count, "max_observed_vs_plan_pct": round(max_divergence, 2)},
        adapter_health_summary=dict(adapter_status_counts),
    )


def signals_summary(session: Session) -> SignalsSummaryView:
    signals = list_signal_views(session)
    family_counts: Counter[str] = Counter()
    realism_counts: Counter[str] = Counter()
    freshness_counts: Counter[str] = Counter()
    direction_counts: Counter[str] = Counter()
    warning_counts = {
        "high_risk": 0,
        "stale_or_degraded": 0,
        "proxy_or_context_only": 0,
        "promotion_blocked": 0,
    }
    symbols: set[str] = set()
    families: set[str] = set()
    freshness_states: set[str] = set()
    realism_grades: set[str] = set()
    for signal in signals:
        family_counts.update([signal.signal_type])
        direction_counts.update([signal.direction])
        symbols.add(signal.symbol)
        families.add(signal.signal_type)
        if signal.noise_probability >= 0.35:
            warning_counts["high_risk"] += 1
        if signal.data_reality is None:
            freshness_counts.update(["unknown"])
            realism_counts.update(["unknown"])
            continue
        freshness = signal.data_reality.freshness_state
        grade = signal.data_reality.provenance.realism_grade
        freshness_counts.update([freshness])
        realism_counts.update([grade])
        freshness_states.add(freshness)
        realism_grades.add(grade)
        if freshness in {"stale", "degraded", "unusable"}:
            warning_counts["stale_or_degraded"] += 1
        if signal.data_reality.execution_suitability in {"context_only", "research_only"}:
            warning_counts["proxy_or_context_only"] += 1
        if signal.data_reality.promotion_blocked:
            warning_counts["promotion_blocked"] += 1
    return SignalsSummaryView(
        generated_at=naive_utc_now(),
        filter_metadata={
            "symbols": sorted(symbols),
            "families": sorted(families),
            "directions": sorted(direction_counts),
            "freshness_states": sorted(freshness_states),
            "realism_grades": sorted(realism_grades),
        },
        grouped_counts={
            "family": dict(family_counts),
            "direction": dict(direction_counts),
            "realism": dict(realism_counts),
            "freshness": dict(freshness_counts),
        },
        top_ranked_signals=sorted(signals, key=lambda item: item.score, reverse=True)[:8],
        warning_counts=warning_counts,
    )


def ticket_summary(session: Session) -> TicketSummaryView:
    tickets = list_trade_tickets(session)
    counts_by_state = Counter(ticket.status for ticket in tickets)
    blockers: Counter[str] = Counter()
    reconciliation_needed = 0
    for ticket in tickets:
        for blocker in ticket.checklist_status.blocked_reasons:
            blockers.update([blocker])
        detail = get_trade_ticket_detail(session, ticket.ticket_id)
        if detail is not None:
            reconciliation_needed += sum(1 for fill in detail.manual_fills if fill.reconciliation.requires_review)
    return TicketSummaryView(
        generated_at=naive_utc_now(),
        counts_by_state=dict(counts_by_state),
        checklist_blockers=dict(blockers),
        shadow_active_count=counts_by_state.get("shadow_active", 0),
        reconciliation_needed_count=reconciliation_needed,
        ready_for_review_count=counts_by_state.get("ready_for_review", 0),
    )


def review_summary(session: Session) -> ReviewSummaryView:
    backlog = operational_backlog(session)
    weekly = weekly_review(session)
    analytics = paper_trade_analytics(session)
    failures = {row.category: row.trade_count for row in weekly.failure_attribution_trend}
    return ReviewSummaryView(
        generated_at=naive_utc_now(),
        overdue_reviews=backlog.overdue_count,
        adherence_summary={
            "adherence_rate": analytics.hygiene_summary.adherence_rate,
            "invalidation_discipline_rate": analytics.hygiene_summary.invalidation_discipline_rate,
            "review_completion_rate": analytics.hygiene_summary.review_completion_rate,
        },
        failure_attribution_summary=failures,
        realism_warning_violations=len(weekly.realism_warning_violations),
        review_completion_trend={
            "review_backlog": float(analytics.hygiene_summary.review_backlog),
            "poor_adherence_streak": float(analytics.hygiene_summary.poor_adherence_streak),
            "reviewed_trade_count": float(analytics.hygiene_summary.reviewed_trade_count),
        },
    )


def pilot_summary(session: Session) -> PilotSummaryView:
    dashboard = pilot_dashboard(session)
    anomaly_logs = [
        row
        for row in recent_audit_logs(session, limit=12)
        if row.event_type in {"checklist_override", "manual_fill_entry", "ticket_approval"}
    ]
    trust_split: defaultdict[str, list[float]] = defaultdict(list)
    for item in dashboard.trust_by_asset_class:
        trust_split[str(item.get("asset_class", "unknown"))].append(float(item.get("avg_realism_score", 0.0)))
    return PilotSummaryView(
        generated_at=naive_utc_now(),
        gate_state=dashboard.execution_gate.status,
        blockers=dashboard.execution_gate.blockers,
        ticket_funnel=dashboard.pilot_metrics.ticket_conversion,
        divergence_metrics=dashboard.pilot_metrics.shadow_metrics,
        adapter_health=adapter_health_summary(session),
        audit_anomalies=anomaly_logs[:8],
        asset_class_trust_split=dashboard.trust_by_asset_class,
    )
