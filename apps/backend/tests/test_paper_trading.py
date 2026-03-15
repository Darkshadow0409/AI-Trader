from __future__ import annotations

from sqlmodel import Session, select

from app.core.clock import naive_utc_now
from app.core.database import engine
from app.models.entities import AlertRecord, PaperTradeRecord
from app.services.paper_trading import refresh_paper_trade_alerts
from app.services.pipeline import seed_and_refresh


def test_paper_trade_seeded_lists_and_detail(client) -> None:
    seed_and_refresh()

    proposed = client.get("/api/portfolio/paper-trades/proposed")
    active = client.get("/api/portfolio/paper-trades/active")
    closed = client.get("/api/portfolio/paper-trades/closed")

    assert proposed.status_code == 200
    assert active.status_code == 200
    assert closed.status_code == 200
    assert len(proposed.json()) >= 1
    assert len(active.json()) >= 1
    assert len(closed.json()) >= 2

    detail = client.get(f"/api/portfolio/paper-trades/{closed.json()[0]['trade_id']}")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["trade_id"].startswith("paper_trade_")
    assert "entry_quality_label" in payload["outcome"]
    assert isinstance(payload["lifecycle_events"], list)


def test_paper_trade_lifecycle_and_review_routes(client) -> None:
    seed_and_refresh()
    signals = client.get("/api/signals").json()
    risks = client.get("/api/risk/latest").json()
    btc_signal = next(item for item in signals if item["symbol"] == "BTC")
    btc_risk = next(item for item in risks if item["symbol"] == "BTC")

    created = client.post(
        "/api/portfolio/paper-trades/proposed",
        json={
            "signal_id": btc_signal["signal_id"],
            "risk_report_id": btc_risk["risk_report_id"],
            "strategy_id": "trend_breakout_v1",
            "symbol": "BTC",
            "side": "long",
            "notes": "Lifecycle regression.",
        },
    )
    assert created.status_code == 201
    trade_id = created.json()["trade_id"]

    opened = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/open",
        json={"actual_entry": 71840, "actual_size": 0.4, "notes": "opened for regression"},
    )
    assert opened.status_code == 200
    assert opened.json()["status"] == "opened"

    scaled = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/scale",
        json={"actual_entry": 71940, "added_size": 0.2, "notes": "scaled for regression"},
    )
    assert scaled.status_code == 200
    assert scaled.json()["status"] == "scaled_in"
    assert scaled.json()["actual_size"] == 0.6

    partial = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/partial-exit",
        json={"exit_price": 73120, "exit_size": 0.2, "close_reason": "target_partial", "notes": "trimmed"},
    )
    assert partial.status_code == 200
    assert partial.json()["status"] == "partially_exited"
    assert partial.json()["actual_size"] == 0.4

    closed = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/close",
        json={"close_price": 73420, "close_reason": "manual_close", "notes": "closed for regression"},
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed_win"
    assert closed.json()["outcome"]["realized_pnl_pct"] > 0

    reviewed = client.put(
        f"/api/journal/paper-trades/{trade_id}/review",
        json={
            "thesis_respected": True,
            "invalidation_respected": True,
            "entered_too_early": False,
            "entered_too_late": False,
            "oversized": False,
            "undersized": False,
            "realism_warning_ignored": False,
            "catalyst_mattered": True,
            "failure_category": "",
            "operator_notes": "Lifecycle regression review saved.",
        },
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["trade_id"] == trade_id

    reviews = client.get("/api/journal/paper-trade-reviews")
    analytics = client.get("/api/portfolio/paper-trades/analytics")
    assert reviews.status_code == 200
    assert analytics.status_code == 200
    assert any(item["trade_id"] == trade_id for item in reviews.json())
    assert any(bucket["key"] == "BTC" for bucket in analytics.json()["by_asset"])


def test_paper_trade_alert_generation_handles_target_and_invalidation(seeded_summary) -> None:
    assert seeded_summary.signals_emitted == 2
    with Session(engine) as session:
        session.add(
            PaperTradeRecord(
                trade_id="paper_trade_alert_target",
                signal_id="sig_8dca021b9c1256658b09a4fa6e218485",
                risk_report_id="risk_28782b441c135ccf921f5dbc7f3d6d77",
                strategy_id="trend_breakout_v1",
                symbol="BTC",
                side="long",
                proposed_entry_zone_json={"low": 70000, "high": 70800},
                actual_entry=70400,
                stop_price=68450,
                targets_json={"base": 71000, "stretch": 71500},
                size_plan_json={"size_band": "small"},
                actual_size=0.5,
                status="opened",
                opened_at=naive_utc_now().replace(day=14, hour=9, minute=0, second=0, microsecond=0),
                lifecycle_events_json=[],
                data_quality="paper",
                updated_at=naive_utc_now().replace(day=15, hour=9, minute=0, second=0, microsecond=0),
            )
        )
        session.add(
            PaperTradeRecord(
                trade_id="paper_trade_alert_invalidation",
                signal_id="sig_342ef03a8f4a559b9b1773fc5fd9f4ae",
                risk_report_id="risk_3490fc4bf0305fbcbe6c1765fcc4fed8",
                strategy_id="event_continuation_v1",
                symbol="ETH",
                side="long",
                proposed_entry_zone_json={"low": 3560, "high": 3600},
                actual_entry=3588,
                stop_price=5000,
                targets_json={"base": 3745, "stretch": 3810},
                size_plan_json={"size_band": "small"},
                actual_size=0.5,
                status="opened",
                opened_at=naive_utc_now().replace(day=14, hour=9, minute=0, second=0, microsecond=0),
                lifecycle_events_json=[],
                data_quality="paper",
                updated_at=naive_utc_now().replace(day=15, hour=9, minute=0, second=0, microsecond=0),
            )
        )
        session.commit()

        refresh_paper_trade_alerts(session)
        categories = {row.category for row in session.exec(select(AlertRecord)).all()}

    assert "paper_trade_review_due" in categories
    assert "paper_trade_time_stop" in categories
    assert "paper_trade_stale_open" in categories
    assert "paper_trade_target_reached" in categories
    assert "paper_trade_invalidation_breached" in categories
