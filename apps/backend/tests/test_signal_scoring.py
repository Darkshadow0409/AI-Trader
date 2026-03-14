from app.engines.signals.signal_ranker import rank_signals
from app.engines.signals.trend_following import build_trend_breakout_signal


def test_trend_breakout_signal_scores_constructive_setup() -> None:
    feature = {
        "symbol": "BTC",
        "breakout_distance": 0.031,
        "ema_vs_sma50": 0.024,
        "relative_volume": 1.8,
        "atr_pct": 0.034,
        "return_5": 0.067,
        "trend_state": "uptrend",
        "data_quality": 0.93,
        "close": 71200.0,
        "atr_14": 1800.0,
    }
    signal = build_trend_breakout_signal(feature, correlation=0.72)
    assert signal is not None
    assert signal["signal_type"] == "trend_breakout"
    assert signal["score"] > 45


def test_signal_ranker_penalizes_uncertainty() -> None:
    ranked = rank_signals(
        [
            {"score": 70, "uncertainty": 0.4, "data_quality": 0.9},
            {"score": 66, "uncertainty": 0.1, "data_quality": 0.95},
        ]
    )
    assert ranked[0]["uncertainty"] == 0.1

