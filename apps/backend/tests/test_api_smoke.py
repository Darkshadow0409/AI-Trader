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
    asset_context = client.get("/api/dashboard/assets/BTC")
    active_trades = client.get("/api/portfolio/active-trades")
    wallet = client.get("/api/portfolio/wallet-balance")
    journal = client.get("/api/journal")
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
    assert asset_context.status_code == 200
    assert active_trades.status_code == 200
    assert wallet.status_code == 200
    assert journal.status_code == 200
    assert refresh.status_code == 200
    assert len(bars.json()) > 0
    assert len(strategies.json()) >= 3
    assert len(backtests.json()) >= 1
    assert "macro_regime" in overview.json()
    assert isinstance(research.json(), list)
    assert isinstance(active_trades.json(), list)
    assert isinstance(wallet.json(), list)
    assert isinstance(journal.json(), list)
    assert refresh.json()["source_mode"] == "sample"

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
    assert "equity_curve" in backtest_detail.json()
    assert created.json()["strategy_name"] == "trend_breakout_v1"
