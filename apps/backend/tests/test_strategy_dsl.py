from pathlib import Path

from app.strategy_lab.spec_dsl import load_strategy_spec, parse_strategy_spec


def test_strategy_spec_parses_real_fixture() -> None:
    spec = load_strategy_spec(
        Path("apps/backend/fixtures/strategy_specs/trend_breakout_v1.yaml")
    )
    assert spec.name == "trend_breakout_v1"
    assert spec.execution.fees_bps == 10
    assert spec.tradable_symbol == "USOUSD"
    assert spec.validation.walk_forward_required is True


def test_strategy_spec_requires_fees_and_slippage() -> None:
    try:
        parse_strategy_spec(
            """
name: broken_spec
version: "1.0"
template: trend_breakout
description: broken
universe: [BTC]
underlying_symbol: BTC
tradable_symbol: BTC
timeframe: 1d
rules: {entry: x, exit: y}
execution: {}
validation:
  warmup_bars: 20
  train_bars: 90
  test_bars: 30
  step_bars: 30
"""
        )
    except Exception as exc:  # noqa: BLE001
        assert "fees_bps" in str(exc)
    else:
        raise AssertionError("Expected fees/slippage validation error")
