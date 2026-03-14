from fastapi.testclient import TestClient

from app.main import app
from app.services.pipeline import seed_and_refresh


def test_strategy_and_backtest_routes_serialize() -> None:
    seed_and_refresh()
    with TestClient(app) as client:
        strategies = client.get("/api/strategies")
        assert strategies.status_code == 200
        strategy_payload = strategies.json()
        assert len(strategy_payload) >= 3
        assert strategy_payload[0]["fees_bps"] > 0

        backtests = client.get("/api/backtests")
        assert backtests.status_code == 200
        backtest_payload = backtests.json()
        assert len(backtest_payload) >= 1

        detail = client.get(f"/api/backtests/{backtest_payload[0]['id']}")
        assert detail.status_code == 200
        detail_payload = detail.json()
        assert "equity_curve" in detail_payload
        assert "stability_heatmap" in detail_payload
