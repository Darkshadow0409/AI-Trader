from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.database import engine
from app.main import app
from app.models.entities import JournalEntry
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
    market_chart = client.get("/api/market/chart/BTC?timeframe=1d")
    market_chart_alias = client.get("/api/market/chart/USOUSD?timeframe=1d")
    market_chart_unknown = client.get("/api/market/chart/SPY?timeframe=1d")
    market_chart_empty = client.get("/api/market/chart/BTC?timeframe=15m")
    strategies = client.get("/api/strategies")
    backtests = client.get("/api/backtests")
    overview = client.get("/api/dashboard/overview")
    desk = client.get("/api/dashboard/desk")
    research = client.get("/api/research")
    high_risk = client.get("/api/signals/high-risk")
    signal_detail = client.get(f"/api/signals/{signals.json()[0]['signal_id']}") if signals.json() else None
    asset_context = client.get("/api/dashboard/assets/BTC")
    asset_context_oil = client.get("/api/dashboard/assets/USOUSD")
    asset_context_oil_research = client.get("/api/dashboard/assets/WTI")
    asset_context_gold = client.get("/api/dashboard/assets/XAUUSD")
    asset_context_silver = client.get("/api/dashboard/assets/XAGUSD")
    active_trades = client.get("/api/portfolio/active-trades")
    wallet = client.get("/api/portfolio/wallet-balance")
    journal = client.get("/api/journal")
    opportunities = client.get("/api/watchlist/opportunity-hunter")
    watchlist_summary = client.get("/api/watchlist/summary")
    alerts = client.get("/api/alerts")
    risk_detail = client.get(f"/api/risk/{risk.json()[0]['risk_report_id']}") if risk.json() else None
    proposed_paper = client.get("/api/portfolio/paper-trades/proposed")
    active_paper = client.get("/api/portfolio/paper-trades/active")
    closed_paper = client.get("/api/portfolio/paper-trades/closed")
    paper_analytics = client.get("/api/portfolio/paper-trades/analytics")
    paper_reviews = client.get("/api/journal/paper-trade-reviews")
    session_overview = client.get("/api/session/overview")
    review_tasks = client.get("/api/session/review-tasks")
    daily_briefing = client.get("/api/session/daily-briefing")
    weekly_review = client.get("/api/session/weekly-review")
    operational_backlog = client.get("/api/session/operational-backlog")
    pilot_metrics = client.get("/api/session/pilot-metrics")
    execution_gate = client.get("/api/session/execution-gate")
    pilot_dashboard = client.get("/api/session/pilot-dashboard")
    adapter_health = client.get("/api/session/adapter-health")
    audit_logs = client.get("/api/session/audit-logs")
    replay = client.get("/api/replay?symbol=BTC")
    scenario_stress = client.get("/api/replay/scenario-stress?symbol=BTC")
    tickets = client.get("/api/tickets")
    shadow_mode = client.get("/api/tickets/shadow-mode")
    broker_snapshot = client.get("/api/tickets/broker-snapshot")
    refresh = client.post("/api/system/refresh")
    control_center = client.get("/api/system/control-center")
    pilot_export = client.post("/api/system/pilot-export")
    polymarket = client.get("/api/polymarket/hunter")
    ai_status = client.get("/api/ai/status")
    ai_advisor = client.post(
        "/api/ai/advisor",
        json={
            "query": "What matters most right now for BTC?",
            "symbol": "BTC",
            "timeframe": "1d",
        },
    )
    assert news.status_code == 200
    assert watchlist.status_code == 200
    assert risk.status_code == 200
    assert exposure.status_code == 200
    assert bars.status_code == 200
    assert market_chart.status_code == 200
    assert market_chart_alias.status_code == 200
    assert market_chart_unknown.status_code == 200
    assert market_chart_empty.status_code == 200
    assert strategies.status_code == 200
    assert backtests.status_code == 200
    assert overview.status_code == 200
    assert desk.status_code == 200
    assert research.status_code == 200
    assert high_risk.status_code == 200
    assert signal_detail is not None and signal_detail.status_code == 200
    assert asset_context.status_code == 200
    assert asset_context_oil.status_code == 200
    assert asset_context_oil_research.status_code == 200
    assert asset_context_gold.status_code == 200
    assert asset_context_silver.status_code == 200
    assert active_trades.status_code == 200
    assert wallet.status_code == 200
    assert journal.status_code == 200
    assert opportunities.status_code == 200
    assert watchlist_summary.status_code == 200
    assert alerts.status_code == 200
    assert risk_detail is not None and risk_detail.status_code == 200
    assert proposed_paper.status_code == 200
    assert active_paper.status_code == 200
    assert closed_paper.status_code == 200
    assert paper_analytics.status_code == 200
    assert paper_reviews.status_code == 200
    assert session_overview.status_code == 200
    assert review_tasks.status_code == 200
    assert daily_briefing.status_code == 200
    assert weekly_review.status_code == 200
    assert operational_backlog.status_code == 200
    assert pilot_metrics.status_code == 200
    assert execution_gate.status_code == 200
    assert pilot_dashboard.status_code == 200
    assert adapter_health.status_code == 200
    assert audit_logs.status_code == 200
    assert replay.status_code == 200
    assert scenario_stress.status_code == 200
    assert tickets.status_code == 200
    assert shadow_mode.status_code == 200
    assert broker_snapshot.status_code == 200
    assert refresh.status_code == 200
    assert control_center.status_code == 200
    assert pilot_export.status_code == 200
    assert polymarket.status_code == 200
    assert ai_status.status_code == 200
    assert ai_advisor.status_code == 200
    assert len(bars.json()) > 0
    assert market_chart.json()["status"] in {"ok", "stale", "degraded", "unusable"}
    assert market_chart.json()["bars"]
    assert market_chart.json()["indicators"]["ema_20"] is not None
    assert market_chart.json()["market_data_mode"] in {"fixture", "public_live", "broker_live"}
    assert market_chart.json()["instrument_mapping"]["broker_symbol"]
    assert market_chart_alias.json()["symbol"] == "WTI"
    assert market_chart_alias.json()["instrument_mapping"]["broker_symbol"] == "USOUSD"
    assert market_chart_unknown.json()["instrument_mapping"]["canonical_symbol"] == "SPY"
    assert market_chart_unknown.json()["instrument_mapping"]["broker_symbol"] == "SPY"
    assert market_chart_empty.json()["status"] in {"ok", "stale", "degraded", "unusable"}
    assert "available_timeframes" in market_chart_empty.json()
    assert len(strategies.json()) >= 3
    assert len(backtests.json()) >= 1
    assert "macro_regime" in overview.json()
    assert "market_data_as_of" in overview.json()
    assert "system_refresh_minutes" in overview.json()
    assert "data_mode_label" in overview.json()
    assert "feed_source_label" in overview.json()
    assert "mode_explainer" in overview.json()
    assert "execution_gate" in desk.json()
    assert "section_readiness" in desk.json()
    assert "section_notes" in desk.json()
    assert isinstance(research.json(), list)
    assert isinstance(active_trades.json(), list)
    assert isinstance(wallet.json(), list)
    assert isinstance(journal.json(), list)
    assert "focus_queue" in opportunities.json()
    summary_by_symbol = {row["symbol"]: row for row in watchlist_summary.json()}
    wti_opportunity = next(
        row
        for row in [*opportunities.json()["focus_queue"], *opportunities.json()["scout_queue"]]
        if row["symbol"] == "WTI"
    )
    assert wti_opportunity["freshness_minutes"] == summary_by_symbol["WTI"]["freshness_minutes"]
    assert wti_opportunity["data_reality"]["freshness_state"] == summary_by_symbol["WTI"]["freshness_state"]
    assert isinstance(watchlist_summary.json(), list)
    assert "sparkline" in watchlist_summary.json()[0]
    assert "instrument_mapping" in watchlist_summary.json()[0]
    assert "freshness_state" in watchlist.json()[0]
    assert [row["symbol"] for row in watchlist_summary.json()[:3]] == ["WTI", "GOLD", "SILVER"]
    assert isinstance(alerts.json(), list)
    assert isinstance(proposed_paper.json(), list)
    assert isinstance(active_paper.json(), list)
    assert isinstance(closed_paper.json(), list)
    assert "by_asset" in paper_analytics.json()
    assert isinstance(paper_reviews.json(), list)
    assert "states" in session_overview.json()
    assert isinstance(review_tasks.json(), list)
    assert "top_ranked_signals" in daily_briefing.json()
    assert "signal_family_outcomes" in weekly_review.json()
    assert "items" in operational_backlog.json()
    assert "ticket_conversion" in pilot_metrics.json()
    assert "status" in execution_gate.json()
    assert "execution_gate" in pilot_dashboard.json()
    assert isinstance(adapter_health.json(), list)
    assert isinstance(audit_logs.json(), list)
    assert "channel_targets" in alerts.json()[0]
    assert "status" in alerts.json()[0]
    assert "evidence" in signal_detail.json()
    assert "data_reality" in signal_detail.json()
    assert "event_relevance" in news.json()[0]
    assert "market_data_mode" in news.json()[0]
    assert "stop_logic" in risk_detail.json()
    assert "data_reality" in risk_detail.json()
    assert "data_reality" in asset_context.json()
    assert asset_context_oil.json()["symbol"] == "WTI"
    assert asset_context_oil.json()["data_reality"]["provenance"]["tradable_symbol"] == "USOUSD"
    assert asset_context_oil_research.json()["symbol"] == "WTI"
    assert asset_context_oil_research.json()["data_reality"]["provenance"]["tradable_symbol"] == "USOUSD"
    assert asset_context_gold.json()["symbol"] == "GOLD"
    assert asset_context_gold.json()["data_reality"]["provenance"]["tradable_symbol"] == "XAUUSD"
    assert asset_context_silver.json()["symbol"] == "SILVER"
    assert asset_context_silver.json()["data_reality"]["provenance"]["tradable_symbol"] == "XAGUSD"
    assert refresh.json()["source_mode"] == "sample"
    assert "runtime_status" in control_center.json()
    assert "report_path" in pilot_export.json()
    assert "markets" in polymarket.json()
    assert "available_tags" in polymarket.json()
    assert ai_status.json()["provider"] == "openai"
    assert ai_status.json()["status"] in {"oauth_not_configured", "auth_required", "connected", "session_expired", "auth_unavailable"}
    assert len(ai_advisor.json()["agent_results"]) == 4
    assert ai_advisor.json()["provider_status"]["provider"] == "openai"
    assert ai_advisor.json()["final_answer"]
    assert ai_advisor.json()["context_snapshot"]["selected_instrument"]
    assert ai_advisor.json()["context_snapshot"]["active_workspace"]
    assert ai_advisor.json()["market_view"]
    assert ai_advisor.json()["why_it_matters_now"]
    assert ai_advisor.json()["key_levels"]
    assert ai_advisor.json()["catalysts"]
    assert ai_advisor.json()["invalidation"]
    assert ai_advisor.json()["risk_frame"]
    assert ai_advisor.json()["related_markets"]
    assert ai_advisor.json()["next_actions"]

    active_paper_detail = client.get(f"/api/portfolio/paper-trades/{active_paper.json()[0]['trade_id']}") if active_paper.json() else None
    assert active_paper_detail is not None and active_paper_detail.status_code == 200
    assert "outcome" in active_paper_detail.json()
    assert "lifecycle_events" in active_paper_detail.json()
    assert "execution_realism" in active_paper_detail.json()
    assert "execution_quality" in active_paper_detail.json()
    assert active_paper_detail.json()["paper_account"]["account_size"] == 10000
    assert "timeline" in active_paper_detail.json()
    assert "scenario_stress" in active_paper_detail.json()
    active_paper_timeline = client.get(f"/api/portfolio/paper-trades/{active_paper.json()[0]['trade_id']}/timeline") if active_paper.json() else None
    active_paper_stress = client.get(f"/api/portfolio/paper-trades/{active_paper.json()[0]['trade_id']}/scenario-stress") if active_paper.json() else None
    assert active_paper_timeline is not None and active_paper_timeline.status_code == 200
    assert active_paper_stress is not None and active_paper_stress.status_code == 200
    assert "frames" in replay.json()
    assert "signal_impacts" in scenario_stress.json()
    assert isinstance(tickets.json(), list)
    assert isinstance(shadow_mode.json(), list)
    assert "balances" in broker_snapshot.json()

    ticket_detail = client.get(f"/api/tickets/{tickets.json()[0]['ticket_id']}") if tickets.json() else None
    assert ticket_detail is not None and ticket_detail.status_code == 200
    assert "checklist_status" in ticket_detail.json()
    assert "manual_fills" in ticket_detail.json()
    assert ticket_detail.json()["paper_account"]["account_size"] == 10000
    assert "shadow_summary" in ticket_detail.json()

    if review_tasks.json():
        task_id = review_tasks.json()[0]["task_id"]
        updated_task = client.patch(f"/api/session/review-tasks/{task_id}", json={"state": "done", "notes": "smoke"})
        assert updated_task.status_code == 200
        assert updated_task.json()["state"] == "done"

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
    created_ticket = client.post(
        "/api/tickets",
        json={
            "signal_id": signals.json()[0]["signal_id"],
            "risk_report_id": risk.json()[0]["risk_report_id"],
            "symbol": "BTC",
            "side": "long",
            "notes": "smoke ticket",
        },
    )
    assert created_ticket.status_code == 201
    ticket_id = created_ticket.json()["ticket_id"]
    updated_ticket = client.patch(
        f"/api/tickets/{ticket_id}",
        json={
            "checklist_status": {
                "freshness_acceptable": True,
                "realism_acceptable": True,
                "risk_budget_available": True,
                "cluster_exposure_acceptable": True,
                "review_complete": True,
                "operator_acknowledged": True,
            }
        },
    )
    assert updated_ticket.status_code == 200
    approval_ticket = client.post(
        f"/api/tickets/{ticket_id}/approval",
        json={"approval_status": "approved", "approval_notes": "smoke approval"},
    )
    assert approval_ticket.status_code == 200
    assert approval_ticket.json()["approval_status"] == "approved"
    created_fill = client.post(
        f"/api/tickets/{ticket_id}/fills",
        json={"fill_price": 71900, "fill_size": 0.25, "fees": 5.0, "notes": "smoke fill"},
    )
    assert created_fill.status_code == 201
    imported_fills = client.post(
        f"/api/tickets/{ticket_id}/fills/import",
        json={"fills": [{"fill_price": 71910, "fill_size": 0.1, "fees": 2.0, "notes": "imported smoke fill"}], "import_batch_id": "smoke_batch"},
    )
    assert imported_fills.status_code == 201
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


def test_journal_route_heals_legacy_blank_entry_type() -> None:
    seed_and_refresh()
    journal_id = ""
    with Session(engine) as session:
        row = session.exec(select(JournalEntry)).first()
        assert row is not None
        journal_id = row.journal_id
        row.entry_type = ""
        session.add(row)
        session.commit()

    client = TestClient(app)
    response = client.get("/api/journal")

    assert response.status_code == 200
    healed = next(item for item in response.json() if item["journal_id"] == journal_id)
    assert healed["entry_type"] == "review"
