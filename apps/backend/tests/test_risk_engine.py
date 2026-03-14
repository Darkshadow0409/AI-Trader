from app.engines.risk.risk_report_builder import build_risk_report
from app.engines.risk.size_band_logic import assign_size_band
from app.engines.risk.stop_logic import compute_stop_price


def test_stop_logic_uses_atr_multiple() -> None:
    assert compute_stop_price(100.0, 5.0, "long") == 89.0


def test_size_band_logic_maps_score_and_uncertainty() -> None:
    band, max_risk = assign_size_band(72.0, 0.18)
    assert band == "standard"
    assert max_risk == 0.012


def test_risk_report_builder_includes_shocks() -> None:
    report = build_risk_report(
        {
            "symbol": "ETH",
            "score": 58.0,
            "direction": "long",
            "uncertainty": 0.22,
            "data_quality": 0.9,
            "feature_snapshot": {"close": 3850.0, "atr_14": 145.0},
        }
    )
    assert report["cluster"] == "crypto_beta"
    assert report["report_json"]["scenario_shocks"]["risk_off_pct"] < 0

