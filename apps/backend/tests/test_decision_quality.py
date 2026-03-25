from __future__ import annotations

from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.database import engine
from app.models.entities import AlertRecord, PaperTradeReviewRecord
from app.services.paper_trading import refresh_paper_trade_alerts
from app.services.pipeline import seed_and_refresh


def test_paper_trade_review_persists_adherence_and_failure_tags(client) -> None:
    seed_and_refresh()

    updated = client.put(
        "/api/journal/paper-trades/paper_trade_invalidated_eth/review",
        json={
            "thesis_respected": False,
            "invalidation_respected": False,
            "entered_inside_suggested_zone": True,
            "time_stop_respected": None,
            "entered_too_early": True,
            "entered_too_late": False,
            "oversized": True,
            "undersized": False,
            "realism_warning_ignored": True,
            "size_plan_respected": False,
            "exited_per_plan": False,
            "catalyst_mattered": True,
            "failure_category": "operator_timing",
            "failure_categories": ["operator_timing", "realism_ignored", "execution_plan_violation"],
            "operator_notes": "Operator entered before the event cleared.",
        },
    )

    assert updated.status_code == 200
    payload = updated.json()
    assert payload["entered_inside_suggested_zone"] is True
    assert payload["size_plan_respected"] is False
    assert "realism_ignored" in payload["failure_categories"]


def test_paper_trade_analytics_exposes_hygiene_and_diagnostics(client) -> None:
    seed_and_refresh()

    response = client.get("/api/portfolio/paper-trades/analytics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["by_asset_class"]
    assert payload["by_realism_grade"]
    assert payload["by_freshness_state"]
    assert payload["by_strategy_lifecycle_state"]
    assert payload["failure_categories"]
    assert payload["hygiene_summary"]["reviewed_trade_count"] >= 2
    assert payload["hygiene_summary"]["adherence_rate"] >= 0


def test_strategy_detail_includes_operator_feedback_summary(client) -> None:
    seed_and_refresh()

    response = client.get("/api/strategies/trend_breakout_v1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["operator_feedback_summary"] is not None
    assert "adherence_adjusted_expectancy_proxy" in payload["operator_feedback_summary"]
    assert isinstance(payload["operator_feedback_summary"]["notes"], list)


def test_refresh_generates_repeated_hygiene_alerts(seeded_summary) -> None:
    assert seeded_summary.signals_emitted >= 3
    with Session(engine) as session:
        session.exec(delete(AlertRecord))
        session.commit()

        btc_review = session.exec(
            select(PaperTradeReviewRecord).where(PaperTradeReviewRecord.trade_id == "paper_trade_closed_btc")
        ).first()
        eth_review = session.exec(
            select(PaperTradeReviewRecord).where(PaperTradeReviewRecord.trade_id == "paper_trade_invalidated_eth")
        ).first()
        assert btc_review is not None
        assert eth_review is not None

        btc_review.realism_warning_ignored = True
        btc_review.invalidation_respected = False
        btc_review.size_plan_respected = False
        btc_review.exited_per_plan = False
        btc_review.failure_category = "execution_plan_violation"
        btc_review.failure_categories_json = ["execution_plan_violation", "realism_ignored"]
        session.add(btc_review)
        session.add(eth_review)
        session.commit()

        refresh_paper_trade_alerts(session)
        categories = {row.category for row in session.exec(select(AlertRecord)).all()}

    assert "repeated_realism_warning_violation" in categories
    assert "repeated_invalidation_breaches" in categories
