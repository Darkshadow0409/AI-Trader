from fastapi.testclient import TestClient

from app.main import app
from app.services.pipeline import seed_and_refresh
from app.strategy_lab.signal_factory import build_signal_frame, prepare_frame
from app.strategy_lab.template_library import get_strategy_spec


FORBIDDEN_COPY = ("fake-live", "broker-ready", "execution-ready", "execution-grade")


def test_strategy_and_backtest_routes_serialize() -> None:
    seed_and_refresh()
    with TestClient(app) as client:
        strategies = client.get("/api/strategies")
        assert strategies.status_code == 200
        strategy_payload = strategies.json()
        assert len(strategy_payload) >= 5
        assert strategy_payload[0]["fees_bps"] > 0
        for strategy in strategy_payload:
            contract = strategy["contract"]
            assert contract["contract_schema_version"] == "phase9c.v1"
            assert contract["strategy_key"] == strategy["name"]
            assert contract["strategy_version"] == strategy["version"]
            assert contract["deterministic"] is True
            assert contract["contract_hash"]
            assert contract["compatible_candle_fill_rules"] == ["close_only"]
            assert "fee_bps" in contract["required_assumption_fields"]
            assert "slippage_bps" in contract["required_assumption_fields"]
            assert "candle_fill_rule" in contract["required_assumption_fields"]
            assert "future_candles" in contract["forbidden_inputs"]
            assert "live_order_route" in contract["forbidden_inputs"]
            assert "future" in contract["lookahead_policy"].lower() or "shifted" in contract["lookahead_policy"].lower()

        by_name = {strategy["name"]: strategy for strategy in strategy_payload}
        assert by_name["trend_following_baseline"]["contract"]["allowed_symbols"] == ["USOUSD"]
        assert by_name["trend_following_baseline"]["contract"]["research_only_symbols"] == ["WTI", "WTI_CTX"]
        assert by_name["mean_reversion_baseline"]["contract"]["allowed_symbols"] == ["XAGUSD"]
        assert "SILVER" in by_name["mean_reversion_baseline"]["contract"]["research_only_symbols"]

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


def test_strategy_contract_detail_is_stable_and_research_only() -> None:
    seed_and_refresh()
    with TestClient(app) as client:
        first = client.get("/api/strategies/trend_following_baseline")
        second = client.get("/api/strategies/trend_following_baseline")

    assert first.status_code == 200
    assert second.status_code == 200
    first_payload = first.json()
    second_payload = second.json()
    contract = first_payload["contract"]
    assert contract["contract_hash"] == second_payload["contract"]["contract_hash"]
    assert contract["strategy_family"] == "trend_breakout"
    assert contract["output_signal_type"] == "long_flat"
    assert contract["min_bars_required"] >= contract["warmup_bars"]
    assert contract["parameter_defaults"]["breakout_window"] == 20
    assert first_payload["tradable_symbol"] == "USOUSD"
    assert "WTI_CTX" in contract["research_only_symbols"]
    serialized = str(first_payload).lower()
    for forbidden in FORBIDDEN_COPY:
        assert forbidden not in serialized


def test_deterministic_sample_strategies_emit_stable_signals() -> None:
    rows = [
        {"timestamp": f"2026-01-{day:02d}T00:00:00", "open": 100 + day * 0.1, "high": 101 + day * 0.1, "low": 99 + day * 0.1, "close": 100 + day * 0.1, "volume": 1000 + day}
        for day in range(1, 29)
    ]
    rows.extend(
        [
            {"timestamp": "2026-02-01T00:00:00", "open": 102, "high": 104, "low": 101, "close": 104, "volume": 1500},
            {"timestamp": "2026-02-02T00:00:00", "open": 104, "high": 107, "low": 103, "close": 107, "volume": 1600},
            {"timestamp": "2026-02-03T00:00:00", "open": 107, "high": 108, "low": 106, "close": 106, "volume": 1300},
        ]
    )
    trend = get_strategy_spec("trend_following_baseline")
    frame = prepare_frame(rows)
    first = build_signal_frame(frame, trend, trend.default_parameters, event_times=[], activation_index=trend.validation.warmup_bars)
    second = build_signal_frame(frame, trend, trend.default_parameters, event_times=[], activation_index=trend.validation.warmup_bars)
    assert first[["Entry", "Exit"]].equals(second[["Entry", "Exit"]])

    mean_reversion = get_strategy_spec("mean_reversion_baseline")
    first_mean = build_signal_frame(frame, mean_reversion, mean_reversion.default_parameters, event_times=[], activation_index=mean_reversion.validation.warmup_bars)
    second_mean = build_signal_frame(frame, mean_reversion, mean_reversion.default_parameters, event_times=[], activation_index=mean_reversion.validation.warmup_bars)
    assert first_mean[["Entry", "Exit"]].equals(second_mean[["Entry", "Exit"]])
