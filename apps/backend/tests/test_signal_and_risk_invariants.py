from __future__ import annotations

from math import isfinite


def test_signal_payloads_expose_required_fields_and_sane_ranges(client, seeded_summary) -> None:
    response = client.get("/api/signals")

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == seeded_summary.signals_emitted

    for row in rows:
        assert row["symbol"]
        assert row["signal_type"]
        assert row["timestamp"]
        assert row["direction"]
        assert isfinite(row["score"])
        assert 0.0 <= row["score"] <= 100.0
        assert isfinite(row["confidence"])
        assert 0.0 <= row["confidence"] <= 1.0
        assert isfinite(row["noise_probability"])
        assert 0.0 <= row["noise_probability"] <= 1.0
        assert isfinite(row["invalidation"])
        assert row["targets"]
        assert all(isfinite(value) for value in row["targets"].values())
        assert row["data_quality"]
        assert row["features"]
        assert row["symbol"] in row["affected_assets"]
        for field in ("symbol", "signal_type", "timestamp", "score", "confidence", "noise_probability", "invalidation"):
            assert row[field] is not None


def test_risk_payloads_expose_required_fields_and_non_empty_shocks(client, seeded_summary) -> None:
    response = client.get("/api/risk/latest")

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == seeded_summary.risk_reports_built

    for row in rows:
        assert row["symbol"]
        assert row["size_band"]
        assert isfinite(row["stop_price"])
        assert row["stop_price"] > 0
        assert isfinite(row["max_portfolio_risk_pct"])
        assert row["max_portfolio_risk_pct"] >= 0
        assert row["exposure_cluster"]
        assert row["scenario_shocks"]
        assert all(isfinite(value) for value in row["scenario_shocks"].values())
        assert row["report"].get("atr_14") is not None


def test_risk_exposure_rows_remain_sane(client, seeded_summary) -> None:
    response = client.get("/api/risk/exposure")

    assert response.status_code == 200
    rows = response.json()
    assert rows

    for row in rows:
        assert row["cluster"]
        assert row["symbols"]
        assert isfinite(row["gross_risk_pct"])
        assert row["gross_risk_pct"] >= 0
        assert isfinite(row["worst_scenario_pct"])
