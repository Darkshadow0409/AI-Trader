from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.engines.risk.cluster_exposure import cluster_for_symbol
from app.engines.risk.scenario_shocks import build_scenario_shocks
from app.engines.risk.size_band_logic import assign_size_band
from app.engines.risk.stop_logic import compute_stop_price


def build_risk_report(signal: dict[str, Any]) -> dict[str, Any]:
    feature = signal["feature_snapshot"]
    close = float(feature["close"])
    atr = float(feature.get("atr_14") or close * 0.03)
    stop_price = compute_stop_price(close, atr, str(signal["direction"]))
    position_band, max_risk_pct = assign_size_band(float(signal["score"]), float(signal["uncertainty"]))
    cluster = cluster_for_symbol(str(signal["symbol"]))
    shocks = build_scenario_shocks(str(signal["symbol"]))
    return {
        "symbol": signal["symbol"],
        "as_of": datetime.now(timezone.utc),
        "stop_price": stop_price,
        "size_band": position_band,
        "max_portfolio_risk_pct": max_risk_pct,
        "cluster": cluster,
        "exposure_cluster": cluster,
        "uncertainty": signal["uncertainty"],
        "data_quality": signal["data_quality"],
        "report_json": {
            "entry_reference": close,
            "atr_14": round(atr, 4),
            "scenario_shocks": shocks,
            "risk_notes": [
                "No live execution is enabled in this platform.",
                "Macro event proximity should reduce conviction when high-impact releases are pending.",
            ],
        },
    }
