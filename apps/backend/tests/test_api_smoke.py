from fastapi.testclient import TestClient

from app.main import app
from app.services.pipeline import seed_and_refresh


def test_api_starts_and_loads_sample_data() -> None:
    seed_and_refresh()
    client = TestClient(app)
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    signals = client.get("/api/signals")
    assert signals.status_code == 200
    assert isinstance(signals.json(), list)

    news = client.get("/api/news")
    watchlist = client.get("/api/watchlist")
    risk = client.get("/api/risk/latest")
    exposure = client.get("/api/risk/exposure")
    bars = client.get("/api/market/bars/BTC")
    strategies = client.get("/api/strategies")
    backtests = client.get("/api/backtests")
    overview = client.get("/api/dashboard/overview")
    research = client.get("/api/research")
    high_risk = client.get("/api/signals/high-risk")
    signal_detail = client.get(f"/api/signals/{signals.json()[0]['signal_id']}") if signals.json() else None
    asset_context = client.get("/api/dashboard/assets/BTC")
    active_trades = client.get("/api/portfolio/active-trades")
    wallet = client.get("/api/portfolio/wallet-balance")
    journal = client.get("/api/journal")
    opportunities = client.get("/api/watchlist/opportunity-hunter")
    alerts = client.get("/api/alerts")
    risk_detail = client.get(f"/api/risk/{risk.json()[0]['risk_report_id']}") if risk.json() else None
    proposed_paper = client.get("/api/portfolio/paper-trades/proposed")
    active_paper = client.get("/api/portfolio/paper-trades/active")
    closed_paper = client.get("/api/portfolio/paper-trades/closed")
    paper_analytics = client.get("/api/portfolio/paper-trades/analytics")
    paper_reviews = client.get("/api/journal/paper-trade-reviews")
    refresh = client.post("/api/system/refresh")
    assert news.status_code == 200
    assert watchlist.status_code == 200
    assert risk.status_code == 200
    assert exposure.status_code == 200
    assert bars.status_code == 200
    assert strategies.status_code == 200
    assert backtests.status_code == 200
    assert overview.status_code == 200
    assert research.status_code == 200
    assert high_risk.status_code == 200
    assert signal_detail is not None and signal_detail.status_code == 200
    assert asset_context.status_code == 200
    assert active_trades.status_code == 200
    assert wallet.status_code == 200
    assert journal.status_code == 200
    assert opportunities.status_code == 200
    assert alerts.status_code == 200
    assert risk_detail is not None and risk_detail.status_code == 200
    assert proposed_paper.status_code == 200
    assert active_paper.status_code == 200
    assert closed_paper.status_code == 200
    assert paper_analytics.status_code == 200
    assert paper_reviews.status_code == 200
    assert refresh.status_code == 200
    assert len(bars.json()) > 0
    assert len(strategies.json()) >= 3
    assert len(backtests.json()) >= 1
    assert "macro_regime" in overview.json()
    assert isinstance(research.json(), list)
    assert isinstance(active_trades.json(), list)
    assert isinstance(wallet.json(), list)
    assert isinstance(journal.json(), list)
    assert "focus_queue" in opportunities.json()
    assert isinstance(alerts.json(), list)
    assert isinstance(proposed_paper.json(), list)
    assert isinstance(active_paper.json(), list)
    assert isinstance(closed_paper.json(), list)
    assert "by_asset" in paper_analytics.json()
    assert isinstance(paper_reviews.json(), list)
    assert "channel_targets" in alerts.json()[0]
    assert "status" in alerts.json()[0]
    assert "evidence" in signal_detail.json()
    assert "data_reality" in signal_detail.json()
    assert "stop_logic" in risk_detail.json()
    assert "data_reality" in risk_detail.json()
    assert "data_reality" in asset_context.json()
    assert refresh.json()["source_mode"] == "sample"

    active_paper_detail = client.get(f"/api/portfolio/paper-trades/{active_paper.json()[0]['trade_id']}") if active_paper.json() else None
    assert active_paper_detail is not None and active_paper_detail.status_code == 200
    assert "outcome" in active_paper_detail.json()
    assert "lifecycle_events" in active_paper_detail.json()

    created_trade = client.post(
        "/api/portfolio/active-trades",
        json={
            "symbol": "BTC",
            "strategy_name": "manual_track_v1",
            "side": "long",
            "entry_time": "2026-03-15T11:30:00Z",
            "entry_price": 70000,
            "current_price": 70500,
            "stop_price": 69000,
            "target_price": 73000,
            "size_band": "small",
            "status": "open",
            "thesis": "Manual tracking regression.",
            "signal_id": signals.json()[0]["signal_id"],
            "risk_report_id": risk.json()[0]["risk_report_id"],
            "notes": "created in smoke test",
        },
    )
    assert created_trade.status_code == 201
    trade_id = created_trade.json()["trade_id"]
    updated_trade = client.patch(
        f"/api/portfolio/active-trades/{trade_id}",
        json={"current_price": 70650, "notes": "updated in smoke test"},
    )
    assert updated_trade.status_code == 200
    assert updated_trade.json()["current_price"] == 70650
    deleted_trade = client.delete(f"/api/portfolio/active-trades/{trade_id}")
    assert deleted_trade.status_code == 204

    created_journal = client.post(
        "/api/journal",
        json={
            "symbol": "BTC",
            "entered_at": "2026-03-15T11:30:00Z",
            "entry_type": "pre_trade",
            "note": "Pre-trade regression entry.",
            "mood": "focused",
            "tags": ["regression"],
            "signal_id": signals.json()[0]["signal_id"],
            "risk_report_id": risk.json()[0]["risk_report_id"],
        },
    )
    assert created_journal.status_code == 201
    journal_id = created_journal.json()["journal_id"]
    updated_journal = client.patch(
        f"/api/journal/{journal_id}",
        json={"lessons": "Preserved fixture-mode journaling flow.", "review_status": "in_review"},
    )
    assert updated_journal.status_code == 200
    assert updated_journal.json()["review_status"] == "in_review"

    strategy_detail = client.get(f"/api/strategies/{strategies.json()[0]['name']}")
    backtest_detail = client.get(f"/api/backtests/{backtests.json()[0]['id']}")
    created = client.post(
        "/api/backtests/run",
        json={"strategy_name": "trend_breakout_v1", "search_method": "grid", "max_trials": 4},
    )
    assert strategy_detail.status_code == 200
    assert backtest_detail.status_code == 200
    assert created.status_code == 200
    assert "search_space" in strategy_detail.json()
    assert "data_reality" in strategy_detail.json()
    assert "equity_curve" in backtest_detail.json()
    assert "data_reality" in backtest_detail.json()
    assert created.json()["strategy_name"] == "trend_breakout_v1"
