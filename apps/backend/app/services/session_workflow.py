from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, select

from app.alerting import choose_channel_targets, dispatch_alert, stable_alert_id
from app.core.clock import naive_utc_now
from app.models.entities import ReviewTaskRecord
from app.models.schemas import (
    AlertEnvelope,
    BriefingTradeAttentionView,
    DailyBriefingView,
    DegradedSourceView,
    OperationalBacklogItemView,
    OperationalBacklogView,
    ReviewTaskUpdateRequest,
    ReviewTaskView,
    SessionOverviewView,
    SessionStateView,
    StrategyDriftWarningView,
    WeeklyReviewView,
)
from app.services.dashboard_data import (
    dashboard_ribbon,
    list_high_risk_signal_views,
    list_risk_exposure_views,
    list_signal_views,
)
from app.services.operator_console import list_opportunities
from app.services.paper_trading import (
    ACTIVE_PAPER_STATUSES,
    CLOSED_PAPER_STATUSES,
    list_paper_trade_reviews,
    list_paper_trades,
    paper_trade_analytics,
)
from app.strategy_lab.service import get_strategy, list_strategies, strategy_detail_view


SESSION_TITLES = {
    "pre_session": "Pre Session",
    "live_session": "Live Session",
    "post_session": "Post Session",
    "weekly_review": "Weekly Review",
    "strategy_review": "Strategy Review",
}


def _stable_id(prefix: str, *parts: object) -> str:
    key = "|".join(str(part) for part in parts)
    return f"{prefix}_{uuid5(NAMESPACE_URL, key).hex}"


def _task_status(row: ReviewTaskRecord) -> tuple[str, bool]:
    overdue = row.state in {"open", "in_progress"} and row.due_at <= naive_utc_now()
    if overdue:
        return "overdue", True
    return row.state, False


def _freshness_minutes(timestamp) -> int:
    return max(0, int((naive_utc_now() - timestamp).total_seconds() // 60))


def _task_view(row: ReviewTaskRecord) -> ReviewTaskView:
    state, overdue = _task_status(row)
    return ReviewTaskView(
        task_id=row.task_id,
        task_type=row.task_type,
        title=row.title,
        summary=row.summary,
        state=state,
        priority=row.priority,
        session_state=row.session_state,
        linked_entity_type=row.linked_entity_type,
        linked_entity_id=row.linked_entity_id,
        linked_symbol=row.linked_symbol,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        trade_id=row.trade_id,
        strategy_name=row.strategy_name,
        due_at=row.due_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        completed_at=row.completed_at,
        freshness_minutes=_freshness_minutes(row.updated_at),
        overdue=overdue,
        notes=row.notes,
        metadata=row.metadata_json,
    )


def list_review_tasks_snapshot(session: Session, limit: int | None = None) -> list[ReviewTaskView]:
    rows = session.exec(
        select(ReviewTaskRecord).order_by(ReviewTaskRecord.due_at.asc(), ReviewTaskRecord.updated_at.desc())
    ).all()
    if limit is not None:
        rows = rows[:limit]
    return [_task_view(row) for row in rows]


def _upsert_task(session: Session, payload: dict[str, Any]) -> None:
    row = session.exec(select(ReviewTaskRecord).where(ReviewTaskRecord.task_id == payload["task_id"])).first()
    if row is None:
        row = ReviewTaskRecord(task_id=str(payload["task_id"]), created_at=naive_utc_now(), updated_at=naive_utc_now())
    previous_state = row.state
    for key, value in payload.items():
        setattr(row, key, value)
    if previous_state in {"done", "dismissed"}:
        row.state = previous_state
    row.updated_at = naive_utc_now()
    session.add(row)


def refresh_review_tasks(session: Session) -> list[ReviewTaskView]:
    opportunities = list_opportunities(session)
    signals = list_signal_views(session)
    active_paper = list_paper_trades(session, statuses=ACTIVE_PAPER_STATUSES)
    closed_paper = list_paper_trades(session, statuses=CLOSED_PAPER_STATUSES)
    reviews = {row.trade_id: row for row in list_paper_trade_reviews(session)}
    desired_task_ids: set[str] = set()

    for trade in active_paper:
        task_id = _stable_id("review_task", "open_trade_checkin", trade.trade_id)
        desired_task_ids.add(task_id)
        due_at = (trade.opened_at or naive_utc_now()) + timedelta(hours=12)
        attention_reason = "Open trade has aged into a required operator check-in."
        if trade.freshness_minutes >= 720:
            attention_reason = "Open trade is stale and needs attention."
        _upsert_task(
            session,
            {
                "task_id": task_id,
                "task_type": "open_trade_checkin",
                "title": f"{trade.symbol} open trade check-in",
                "summary": attention_reason,
                "state": "open",
                "priority": "high" if trade.freshness_minutes >= 720 else "medium",
                "session_state": "live_session",
                "linked_entity_type": "paper_trade",
                "linked_entity_id": trade.trade_id,
                "linked_symbol": trade.symbol,
                "signal_id": trade.signal_id,
                "risk_report_id": trade.risk_report_id,
                "trade_id": trade.trade_id,
                "strategy_name": trade.strategy_id,
                "due_at": due_at,
                "notes": "",
                "metadata_json": {"status": trade.status, "freshness_minutes": trade.freshness_minutes},
            },
        )

    for trade in closed_paper:
        if not trade.review_due:
            continue
        task_id = _stable_id("review_task", "post_trade_review_due", trade.trade_id)
        desired_task_ids.add(task_id)
        due_at = (trade.closed_at or naive_utc_now()) + timedelta(hours=24)
        _upsert_task(
            session,
            {
                "task_id": task_id,
                "task_type": "post_trade_review_due",
                "title": f"{trade.symbol} post-trade review due",
                "summary": "Closed paper trade is awaiting structured review.",
                "state": "open",
                "priority": "high",
                "session_state": "post_session",
                "linked_entity_type": "paper_trade_review",
                "linked_entity_id": trade.trade_id,
                "linked_symbol": trade.symbol,
                "signal_id": trade.signal_id,
                "risk_report_id": trade.risk_report_id,
                "trade_id": trade.trade_id,
                "strategy_name": trade.strategy_id,
                "due_at": due_at,
                "notes": "",
                "metadata_json": {"close_reason": trade.close_reason, "review_exists": trade.trade_id in reviews},
            },
        )

    for review in reviews.values():
        if not review.realism_warning_ignored:
            continue
        task_id = _stable_id("review_task", "realism_warning_violation_review", review.trade_id)
        desired_task_ids.add(task_id)
        _upsert_task(
            session,
            {
                "task_id": task_id,
                "task_type": "realism_warning_violation_review",
                "title": f"{review.trade_id} realism-warning review",
                "summary": "Operator ignored a realism warning on a reviewed paper trade.",
                "state": "open",
                "priority": "high",
                "session_state": "weekly_review",
                "linked_entity_type": "paper_trade_review",
                "linked_entity_id": review.trade_id,
                "linked_symbol": "",
                "signal_id": None,
                "risk_report_id": None,
                "trade_id": review.trade_id,
                "strategy_name": None,
                "due_at": review.updated_at + timedelta(days=2),
                "notes": "",
                "metadata_json": {"failure_categories": review.failure_categories},
            },
        )

    for signal in signals:
        if signal.data_reality is None:
            continue
        if signal.data_reality.freshness_state not in {"stale", "degraded", "unusable"}:
            continue
        task_id = _stable_id("review_task", "stale_signal_review", signal.signal_id)
        desired_task_ids.add(task_id)
        _upsert_task(
            session,
            {
                "task_id": task_id,
                "task_type": "stale_signal_review",
                "title": f"{signal.symbol} stale signal review",
                "summary": signal.data_reality.ui_warning,
                "state": "open",
                "priority": "medium" if signal.data_reality.freshness_state == "stale" else "high",
                "session_state": "pre_session",
                "linked_entity_type": "signal",
                "linked_entity_id": signal.signal_id,
                "linked_symbol": signal.symbol,
                "signal_id": signal.signal_id,
                "risk_report_id": None,
                "trade_id": None,
                "strategy_name": None,
                "due_at": signal.timestamp + timedelta(hours=6),
                "notes": "",
                "metadata_json": {"freshness_state": signal.data_reality.freshness_state},
            },
        )

    for opportunity in opportunities.focus_queue:
        if opportunity.data_reality is None:
            continue
        if opportunity.data_reality.freshness_state == "fresh" and opportunity.data_reality.execution_suitability not in {"context_only", "research_only"}:
            continue
        task_id = _stable_id("review_task", "degraded_source_focus_asset", opportunity.symbol)
        desired_task_ids.add(task_id)
        _upsert_task(
            session,
            {
                "task_id": task_id,
                "task_type": "degraded_source_focus_asset",
                "title": f"{opportunity.symbol} source degradation review",
                "summary": opportunity.data_reality.ui_warning,
                "state": "open",
                "priority": "high",
                "session_state": "pre_session",
                "linked_entity_type": "asset",
                "linked_entity_id": opportunity.symbol,
                "linked_symbol": opportunity.symbol,
                "signal_id": opportunity.signal_id,
                "risk_report_id": opportunity.risk_report_id,
                "trade_id": None,
                "strategy_name": None,
                "due_at": naive_utc_now() + timedelta(hours=4),
                "notes": "",
                "metadata_json": {
                    "freshness_state": opportunity.data_reality.freshness_state,
                    "source_timing": opportunity.data_reality.provenance.source_timing,
                },
            },
        )

    for entry in list_strategies(session):
        if entry.lifecycle_state != "promoted":
            continue
        detail = strategy_detail_view(session, get_strategy(session, entry.name))
        feedback = detail.operator_feedback_summary
        if feedback is None or feedback.drift_indicator == "stable":
            continue
        task_id = _stable_id("review_task", "promoted_strategy_re_evaluation", entry.name)
        desired_task_ids.add(task_id)
        _upsert_task(
            session,
            {
                "task_id": task_id,
                "task_type": "promoted_strategy_re_evaluation",
                "title": f"{entry.name} promoted strategy re-evaluation",
                "summary": "Promoted strategy shows drift and should be re-evaluated.",
                "state": "open",
                "priority": "high",
                "session_state": "strategy_review",
                "linked_entity_type": "strategy",
                "linked_entity_id": entry.name,
                "linked_symbol": entry.underlying_symbol,
                "signal_id": None,
                "risk_report_id": None,
                "trade_id": None,
                "strategy_name": entry.name,
                "due_at": naive_utc_now() + timedelta(days=2),
                "notes": "",
                "metadata_json": {"drift_indicator": feedback.drift_indicator, "notes": feedback.notes},
            },
        )

    existing_rows = session.exec(select(ReviewTaskRecord)).all()
    for row in existing_rows:
        if row.task_id in desired_task_ids:
            continue
        if row.state in {"done", "dismissed"}:
            continue
        row.state = "resolved"
        row.updated_at = naive_utc_now()
        session.add(row)

    session.commit()
    rows = session.exec(select(ReviewTaskRecord).order_by(ReviewTaskRecord.due_at.asc())).all()
    return [_task_view(row) for row in rows]


def update_review_task(session: Session, task_id: str, payload: ReviewTaskUpdateRequest) -> ReviewTaskView | None:
    row = session.exec(select(ReviewTaskRecord).where(ReviewTaskRecord.task_id == task_id)).first()
    if row is None:
        return None
    row.state = payload.state
    if payload.notes:
        row.notes = payload.notes
    row.updated_at = naive_utc_now()
    row.completed_at = naive_utc_now() if payload.state == "done" else None
    session.add(row)
    session.commit()
    session.refresh(row)
    return _task_view(row)


def _attention_rows(session: Session) -> list[BriefingTradeAttentionView]:
    rows: list[BriefingTradeAttentionView] = []
    for trade in list_paper_trades(session, statuses=ACTIVE_PAPER_STATUSES):
        reason = "Active paper trade requires monitoring."
        if trade.freshness_minutes >= 720:
            reason = "Active paper trade is stale."
        elif trade.data_reality and trade.data_reality.freshness_state in {"stale", "degraded", "unusable"}:
            reason = f"Trade context is {trade.data_reality.freshness_state}."
        rows.append(
            BriefingTradeAttentionView(
                trade_id=trade.trade_id,
                symbol=trade.symbol,
                status=trade.status,
                attention_reason=reason,
                freshness_minutes=trade.freshness_minutes,
                signal_id=trade.signal_id,
                risk_report_id=trade.risk_report_id,
            )
        )
    return sorted(rows, key=lambda item: (-item.freshness_minutes, item.symbol))


def _strategy_drift_warnings(session: Session) -> list[StrategyDriftWarningView]:
    warnings: list[StrategyDriftWarningView] = []
    for entry in list_strategies(session):
        detail = strategy_detail_view(session, get_strategy(session, entry.name))
        feedback = detail.operator_feedback_summary
        if feedback is None:
            continue
        if entry.lifecycle_state == "promoted" and feedback.drift_indicator != "stable":
            warnings.append(
                StrategyDriftWarningView(
                    strategy_name=entry.name,
                    lifecycle_state=entry.lifecycle_state,
                    drift_indicator=feedback.drift_indicator,
                    note=feedback.notes[0] if feedback.notes else "Promoted strategy requires review.",
                )
            )
    return warnings


def daily_briefing(session: Session) -> DailyBriefingView:
    opportunities = list_opportunities(session)
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
    return DailyBriefingView(
        generated_at=naive_utc_now(),
        top_ranked_signals=list_signal_views(session)[:5],
        high_risk_setups=list_high_risk_signal_views(session)[:5],
        open_trades_needing_attention=_attention_rows(session)[:5],
        exposure_summary=list_risk_exposure_views(session),
        degraded_data_sources=degraded[:5],
        scout_to_focus_promotions=list_opportunities(session).focus_queue[:5],
        promoted_strategy_drift_warnings=_strategy_drift_warnings(session),
    )


def weekly_review(session: Session) -> WeeklyReviewView:
    analytics = paper_trade_analytics(session)
    reviews = [row for row in list_paper_trade_reviews(session) if row.realism_warning_ignored]
    closed_trades = list_paper_trades(session, statuses=CLOSED_PAPER_STATUSES)
    distribution: dict[str, int] = {
        "wins": sum(1 for row in closed_trades if row.status == "closed_win"),
        "losses": sum(1 for row in closed_trades if row.status == "closed_loss"),
        "invalidated": sum(1 for row in closed_trades if row.status == "invalidated"),
        "timed_out": sum(1 for row in closed_trades if row.status == "timed_out"),
        "cancelled": sum(1 for row in closed_trades if row.status == "cancelled"),
    }
    return WeeklyReviewView(
        generated_at=naive_utc_now(),
        signal_family_outcomes=analytics.by_signal_family,
        adherence_trend=analytics.hygiene_summary,
        failure_attribution_trend=analytics.failure_categories,
        realism_warning_violations=reviews,
        strategy_promotion_health=_strategy_drift_warnings(session),
        paper_trade_outcome_distribution=distribution,
    )


def operational_backlog(session: Session) -> OperationalBacklogView:
    tasks = refresh_review_tasks(session)
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
    for trade in _attention_rows(session):
        if trade.freshness_minutes < 720:
            continue
        items.append(
            OperationalBacklogItemView(
                item_id=_stable_id("backlog", "stale_trade", trade.trade_id),
                category="stale_open_trade",
                title=f"{trade.symbol} stale open trade",
                priority="high",
                status="open",
                linked_symbol=trade.symbol,
                linked_entity_type="paper_trade",
                linked_entity_id=trade.trade_id,
                due_at=None,
                freshness_minutes=trade.freshness_minutes,
                note=trade.attention_reason,
            )
        )
    sorted_items = sorted(
        items,
        key=lambda item: (
            {"high": 0, "medium": 1, "low": 2}.get(item.priority, 3),
            0 if item.status == "overdue" else 1,
            item.due_at or naive_utc_now(),
        ),
    )
    return OperationalBacklogView(
        generated_at=naive_utc_now(),
        overdue_count=sum(1 for item in sorted_items if item.status == "overdue"),
        high_priority_count=sum(1 for item in sorted_items if item.priority == "high"),
        items=sorted_items[:20],
    )


def session_overview(session: Session) -> SessionOverviewView:
    tasks = refresh_review_tasks(session)
    briefing = daily_briefing(session)
    weekly = weekly_review(session)
    backlog = operational_backlog(session)
    state_map = {
        "pre_session": [task for task in tasks if task.session_state == "pre_session"],
        "live_session": [task for task in tasks if task.session_state == "live_session"],
        "post_session": [task for task in tasks if task.session_state == "post_session"],
        "weekly_review": [task for task in tasks if task.session_state == "weekly_review"],
        "strategy_review": [task for task in tasks if task.session_state == "strategy_review"],
    }
    ribbon = dashboard_ribbon(session)
    states: list[SessionStateView] = []
    for state, rows in state_map.items():
        states.append(
            SessionStateView(
                state=state,
                title=SESSION_TITLES[state],
                headline=f"{len(rows)} active items",
                summary=f"{sum(1 for row in rows if row.priority == 'high')} high-priority tasks and {sum(1 for row in rows if row.overdue)} overdue items.",
                item_count=len(rows),
                overdue_count=sum(1 for row in rows if row.overdue),
                high_priority_count=sum(1 for row in rows if row.priority == "high"),
                freshness_status=ribbon.freshness_status,
            )
        )
    return SessionOverviewView(
        generated_at=naive_utc_now(),
        states=states,
        review_tasks=tasks,
        daily_briefing=briefing,
        weekly_review=weekly,
        operational_backlog=backlog,
    )


def refresh_session_alerts(session: Session) -> None:
    tasks = refresh_review_tasks(session)
    overdue = [task for task in tasks if task.overdue]
    if overdue:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("review_due", len(overdue)),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=sorted({task.linked_symbol for task in overdue if task.linked_symbol}),
                severity="warning",
                category="review_due",
                channel_targets=choose_channel_targets("warning"),
                title="Review tasks overdue",
                body=f"{len(overdue)} review tasks are overdue in the operator queue.",
                tags=["review", "overdue"],
                dedupe_key=f"review_due:{len(overdue)}",
                data_quality="fixture",
            ),
        )
    backlog = operational_backlog(session)
    if backlog.overdue_count:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("overdue_journal", backlog.overdue_count),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=[],
                severity="info",
                category="overdue_journal",
                channel_targets=choose_channel_targets("info"),
                title="Operational review backlog",
                body=f"{backlog.overdue_count} backlog items are overdue.",
                tags=["review_backlog", "operator_console"],
                dedupe_key=f"overdue_journal:{backlog.overdue_count}",
                data_quality="fixture",
            ),
        )
    degraded_assets = daily_briefing(session).degraded_data_sources
    focus_assets = [row.symbol for row in daily_briefing(session).scout_to_focus_promotions]
    degraded_focus = [row for row in degraded_assets if row.symbol in focus_assets]
    if degraded_focus:
        dispatch_alert(
            session,
            AlertEnvelope(
                alert_id=stable_alert_id("degraded_source_focus_asset", *(row.symbol for row in degraded_focus)),
                created_at=naive_utc_now(),
                signal_id=None,
                risk_report_id=None,
                asset_ids=[row.symbol for row in degraded_focus],
                severity="warning",
                category="degraded_source_focus_asset",
                channel_targets=choose_channel_targets("warning"),
                title="Degraded source on focus assets",
                body="One or more focus assets are currently running with degraded or context-only data reality.",
                tags=["data_reality", "focus_queue"],
                dedupe_key="degraded_source_focus_asset:" + ",".join(sorted(row.symbol for row in degraded_focus)),
                data_quality="fixture",
            ),
        )
