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
        assert detail_payload["assumptions"]["assumption_schema_version"] == "legacy.reconstructed"
        assert detail_payload["assumptions"]["assumptions_complete"] is False
        assert detail_payload["assumptions"]["fee_bps"] > 0
        assert detail_payload["assumptions"]["slippage_bps"] > 0
        assert detail_payload["assumptions"]["candle_fill_rule"] == "close_only"
        assert detail_payload["validation_metadata"]["no_lookahead"] is True
        assert detail_payload["validation_metadata"]["assumptions_complete"] is False
        assert detail_payload["metrics_audit"]["trade_count"] == detail_payload["trade_count"]
        assert "broker-ready" not in str(detail_payload).lower()
        assert "execution-ready" not in str(detail_payload).lower()

        created = client.post(
            "/api/backtests/run",
            json={"strategy_name": detail_payload["strategy_name"], "search_method": "grid", "max_trials": 3},
        )
        assert created.status_code == 200
        created_payload = created.json()
        assert created_payload["assumptions"]["assumption_schema_version"] == "phase9b.v1"
        assert created_payload["assumptions"]["assumptions_complete"] is True
        assert created_payload["assumptions"]["spread_model_label"] == "not modeled separately; folded into slippage"
        assert created_payload["validation_metadata"]["no_lookahead"] is True
        assert created_payload["validation_metadata"]["walk_forward_enabled"] is True
        assert created_payload["validation_metadata"]["walk_forward_window_count"] == len(created_payload["validation_metadata"]["walk_forward_windows"])
        assert created_payload["metrics_audit"]["total_return"] == created_payload["net_return_pct"]
