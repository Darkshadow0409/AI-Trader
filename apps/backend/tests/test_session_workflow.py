from __future__ import annotations

from sqlmodel import Session, select

from app.core.database import engine
from app.models.entities import ReviewTaskRecord
from app.services.pipeline import seed_and_refresh
from app.services.session_workflow import daily_briefing, operational_backlog, refresh_review_tasks, session_overview, weekly_review


def test_review_task_generation_persists_deterministically(seeded_summary) -> None:
    assert seeded_summary.signals_emitted >= 3

    with Session(engine) as session:
        tasks = refresh_review_tasks(session)
        persisted = session.exec(select(ReviewTaskRecord)).all()

    assert tasks
    assert persisted
    assert any(task.task_type == "open_trade_checkin" for task in tasks)
    assert any(task.task_type in {"realism_warning_violation_review", "degraded_source_focus_asset"} for task in tasks)
    assert any(task.state in {"open", "overdue"} for task in tasks)


def test_daily_briefing_aggregates_core_operator_views(client) -> None:
    seed_and_refresh()

    response = client.get("/api/session/daily-briefing")

    assert response.status_code == 200
    payload = response.json()
    assert payload["top_ranked_signals"]
    assert "open_trades_needing_attention" in payload
    assert "exposure_summary" in payload
    assert "degraded_data_sources" in payload


def test_weekly_review_and_backlog_prioritize_attention() -> None:
    seed_and_refresh()

    with Session(engine) as session:
        weekly = weekly_review(session)
        backlog = operational_backlog(session)
        overview = session_overview(session)

    assert weekly.signal_family_outcomes
    assert weekly.adherence_trend.trade_count >= 1
    assert isinstance(weekly.paper_trade_outcome_distribution, dict)
    assert backlog.high_priority_count >= 0
    assert backlog.items
    assert overview.states
    assert any(state.state == "weekly_review" for state in overview.states)
