from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, uuid5

from app.engines.risk.cluster_exposure import cluster_for_symbol
from app.engines.risk.scenario_shocks import build_scenario_shocks
from app.engines.risk.size_band_logic import assign_size_band
from app.engines.risk.stop_logic import compute_stop_price


def build_risk_report(signal: dict[str, Any]) -> dict[str, Any]:
    feature = signal["feature_snapshot"]
    close = float(feature["close"])
    atr = float(feature.get("atr_14") or close * 0.03)
    feature_stop = feature.get("stop_price")
    if feature_stop is not None:
        stop_price = float(feature_stop)
        if str(signal["direction"]) != "short":
            stop_price = max(stop_price, max(close * 0.05, 0.01))
    else:
        stop_price = compute_stop_price(close, atr, str(signal["direction"]))
    position_band, max_risk_pct = assign_size_band(float(signal["score"]), float(signal["uncertainty"]))
    cluster = cluster_for_symbol(str(signal["symbol"]))
    shocks = build_scenario_shocks(str(signal["symbol"]))
    signal_id = str(signal["signal_id"])
    risk_report_id = f"risk_{uuid5(NAMESPACE_URL, f'risk|{signal_id}').hex}"
    stop_distance = abs(close - stop_price)
    stop_distance_pct = (stop_distance / close) * 100 if close else 0.0
    atr_stop_multiple = stop_distance / atr if atr else 0.0
    setup_family = str(feature.get("setup_family") or signal.get("signal_type") or "setup")
    event_lockout = setup_family == "macro_event_reaction" or signal.get("signal_type") == "event_driven"
    leverage_band = "1.0x"
    leverage_cap = 1.0
    if position_band == "tight":
        leverage_band = "0.75x to 1.5x"
        leverage_cap = 1.5
    elif position_band == "standard":
        leverage_band = "0.5x to 1.0x"
    else:
        leverage_band = "0.25x to 0.75x"
        leverage_cap = 0.75
    expected_holding = str(feature.get("holding_window") or "intraday")
    expected_r = float(feature.get("expected_r_multiple") or 0.0)
    mfe_estimate = round(expected_r * 1.1, 2)
    mae_estimate = round(min(1.0, atr_stop_multiple * 0.85), 2)
    slippage_expectation_bps = round(6 + (4 if cluster in {"energy", "precious_metals"} else 0) + (4 if signal["data_quality"] != "live" else 0), 2)
    scenario_notes = [
        f"{key.replace('_', ' ')} {value:+.2f}%"
        for key, value in list(shocks.items())[:3]
    ]
    risk_notes = [
        "Paper execution only. No broker order placement is available.",
        f"Signal family: {setup_family.replace('_', ' ')}.",
        f"Expected holding window: {expected_holding}.",
    ]
    if event_lockout:
        risk_notes.append("Event lockout applies. Treat the setup as reduced-size until the release clears.")
    if signal["data_quality"] != "live":
        risk_notes.append("Current setup uses degraded or proxy-grade context. Keep conviction below live-broker assumptions.")
    return {
        "risk_report_id": risk_report_id,
        "signal_id": signal_id,
        "symbol": signal["symbol"],
        "as_of": signal.get("timestamp"),
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
            "setup_family": setup_family,
            "setup_status": feature.get("setup_status"),
            "entry_zone": feature.get("entry_zone"),
            "stop_distance": round(stop_distance, 4),
            "stop_distance_pct": round(stop_distance_pct, 2),
            "atr_stop_multiple": round(atr_stop_multiple, 2),
            "risk_band": position_band,
            "size_band": position_band,
            "size_band_note": f"{position_band} size band under {cluster.replace('_', ' ')} exposure.",
            "leverage_band": leverage_band,
            "leverage_cap": leverage_cap,
            "liquidation_buffer_estimate_pct": round(max(8.0, stop_distance_pct * 3.2), 2),
            "slippage_expectation_bps": slippage_expectation_bps,
            "mfe_estimate_r": mfe_estimate,
            "mae_estimate_r": mae_estimate,
            "event_lockout": event_lockout,
            "expected_holding_window": expected_holding,
            "expected_r_multiple": expected_r,
            "cross_asset_positive": list(feature.get("cross_asset_positive") or []),
            "scenario_shocks": shocks,
            "scenario_notes": scenario_notes,
            "risk_notes": risk_notes,
        },
    }
