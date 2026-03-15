from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from app.core.clock import naive_utc_now
from app.core.database import engine
from app.models.entities import AlertRecord, PaperTradeRecord, PaperTradeReviewRecord, RiskReport, SignalRecord
from app.models.schemas import PaperTradeProposalRequest
from app.services.operator_console import refresh_alerts
from app.services.paper_trading import create_proposed_paper_trade, get_paper_trade_detail
from app.services.pipeline import seed_and_refresh


def test_repeated_fixture_seed_runs_remain_stable() -> None:
    first = seed_and_refresh()
    with Session(engine) as session:
        first_trade_count = len(session.exec(select(PaperTradeRecord)).all())
        first_review_count = len(session.exec(select(PaperTradeReviewRecord)).all())
        first_signal_count = len(session.exec(select(SignalRecord)).all())
        first_risk_count = len(session.exec(select(RiskReport)).all())

    second = seed_and_refresh()
    with Session(engine) as session:
        second_trade_count = len(session.exec(select(PaperTradeRecord)).all())
        second_review_count = len(session.exec(select(PaperTradeReviewRecord)).all())
        second_signal_count = len(session.exec(select(SignalRecord)).all())
        second_risk_count = len(session.exec(select(RiskReport)).all())

    assert first.source_mode == second.source_mode == "sample"
    assert first.bars_ingested == second.bars_ingested == 1080
    assert first.signals_emitted == second.signals_emitted == 2
    assert first.risk_reports_built == second.risk_reports_built == 2
    assert first_trade_count == second_trade_count
    assert first_review_count == second_review_count
    assert first_signal_count == second_signal_count == 2
    assert first_risk_count == second_risk_count == 2


def test_duplicate_trade_actions_are_rejected(client) -> None:
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
            "strategy_id": "trend_breakout_v1_duplicate_guard",
            "symbol": "BTC",
            "side": "long",
            "notes": "duplicate action regression",
        },
    )
    assert created.status_code == 201
    trade_id = created.json()["trade_id"]

    first_open = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/open",
        json={"actual_entry": 71840, "actual_size": 0.4, "notes": "open once"},
    )
    second_open = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/open",
        json={"actual_entry": 71840, "actual_size": 0.4, "notes": "open twice"},
    )

    assert first_open.status_code == 200
    assert second_open.status_code == 400
    assert "Cannot open a paper trade" in second_open.json()["detail"]

    closed = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/close",
        json={"close_price": 73420, "close_reason": "manual_close", "notes": "closed"},
    )
    late_scale = client.post(
        f"/api/portfolio/paper-trades/{trade_id}/scale",
        json={"actual_entry": 71940, "added_size": 0.2, "notes": "late scale"},
    )

    assert closed.status_code == 200
    assert late_scale.status_code == 400
    assert "Cannot scale a paper trade" in late_scale.json()["detail"]


def test_refresh_alerts_does_not_duplicate_sent_alerts() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        refresh_alerts(session)
        first_sent = len([row for row in session.exec(select(AlertRecord)).all() if row.status == "sent"])
        refresh_alerts(session)
        second_sent = len([row for row in session.exec(select(AlertRecord)).all() if row.status == "sent"])

    assert first_sent > 0
    assert second_sent == first_sent


def test_paper_trade_detail_handles_missing_linked_objects() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        row = PaperTradeRecord(
            trade_id="paper_trade_missing_links",
            signal_id="sig_missing",
            risk_report_id="risk_missing",
            strategy_id="manual",
            symbol="BTC",
            side="long",
            proposed_entry_zone_json={"low": 70000, "high": 70500},
            actual_entry=70250,
            stop_price=69000,
            targets_json={"base": 71000, "stretch": 72000},
            size_plan_json={"size_band": "small"},
            actual_size=0.1,
            status="opened",
            opened_at=naive_utc_now() - timedelta(hours=2),
            notes="orphaned linkage regression",
            lifecycle_events_json=[],
            data_quality="fixture",
            updated_at=naive_utc_now(),
        )
        session.add(row)
        session.commit()

        detail = get_paper_trade_detail(session, row.trade_id)

    assert detail is not None
    assert detail.trade_id == "paper_trade_missing_links"
    assert detail.linked_signal is None
    assert detail.linked_risk is None


def test_stale_signal_trade_creation_adds_warning_note() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        signal = session.exec(select(SignalRecord).where(SignalRecord.symbol == "BTC")).first()
        assert signal is not None
        signal.timestamp = naive_utc_now() - timedelta(days=5)
        session.add(signal)
        session.commit()

        created = create_proposed_paper_trade(
            session,
            PaperTradeProposalRequest(
                signal_id=signal.signal_id,
                risk_report_id=None,
                strategy_id="trend_breakout_v1_stale_guard",
                symbol="BTC",
                side="long",
                notes="stale signal proposal",
            ),
        )

    assert "Freshness warning" in (created.notes or "")
    assert any("Freshness warning" in event["note"] for event in created.lifecycle_events)
