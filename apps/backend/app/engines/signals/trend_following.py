from __future__ import annotations

from typing import Any


def _float(feature: dict[str, Any], key: str, fallback: float = 0.0) -> float:
    try:
        return float(feature.get(key) or fallback)
    except (TypeError, ValueError):
        return fallback


def _entry_zone(close: float, atr: float, direction: str) -> dict[str, float]:
    width = max(atr * 0.35, close * 0.0025)
    if direction == "short":
        return {"low": round(close - width * 0.35, 4), "high": round(close + width, 4)}
    return {"low": round(close - width, 4), "high": round(close + width * 0.35, 4)}


def _targets(close: float, atr: float, direction: str) -> tuple[float, float]:
    if direction == "short":
        return round(close - atr * 1.35, 4), round(close - atr * 2.2, 4)
    return round(close + atr * 1.35, 4), round(close + atr * 2.2, 4)


def _setup_status(score: float, freshness: str, why_not_now: list[str]) -> str:
    if freshness in {"stale", "degraded", "unusable"}:
        return "stale"
    if any("lockout" in reason or "degraded" in reason for reason in why_not_now):
        return "candidate"
    if score >= 66 and not why_not_now:
        return "actionable"
    return "candidate"


def _signal_payload(
    feature: dict[str, Any],
    *,
    signal_type: str,
    direction: str,
    score: float,
    thesis: str,
    why_now: list[str],
    why_not_now: list[str],
    regime: str,
    expected_hold: str,
    trigger_timeframe: str,
    correlation_note: str,
) -> dict[str, Any]:
    close = _float(feature, "close")
    atr = max(_float(feature, "atr_14", close * 0.025), close * 0.006)
    entry_zone = _entry_zone(close, atr, direction)
    target_base, target_stretch = _targets(close, atr, direction)
    stop = round(close - atr * 1.05, 4) if direction != "short" else round(close + atr * 1.05, 4)
    freshness_state = str(feature.get("freshness_state") or "unknown")
    expected_r = abs((target_base - close) / max(abs(close - stop), 1e-6))
    feature_snapshot = {
        **feature,
        "setup_family": signal_type,
        "setup_status": _setup_status(score, freshness_state, why_not_now),
        "entry_zone": entry_zone,
        "stop_price": stop,
        "target_base": target_base,
        "target_stretch": target_stretch,
        "holding_window": expected_hold,
        "expected_r_multiple": round(expected_r, 2),
        "why_now": why_now,
        "why_not_now": why_not_now,
        "regime": regime,
        "trigger_timeframe": trigger_timeframe,
        "correlation_note": correlation_note,
        "freshness_state": freshness_state,
        "entry_reference": close,
    }
    confidence = min(max(score / 100, 0.18), 0.91)
    uncertainty = max(0.12, min(0.58, 1 - confidence + (0.08 if why_not_now else 0.0)))
    return {
        "symbol": feature["symbol"],
        "signal_type": signal_type,
        "direction": direction,
        "score": round(score, 2),
        "thesis": thesis,
        "timestamp": feature.get("timestamp"),
        "uncertainty": round(uncertainty, 3),
        "data_quality": str(feature.get("data_quality") or "fixture"),
        "feature_snapshot": feature_snapshot,
    }


def build_trend_breakout_signal(feature: dict[str, Any], correlation: float) -> dict[str, Any] | None:
    breakout_distance = _float(feature, "breakout_distance")
    rel_volume = _float(feature, "relative_volume")
    adx_proxy = _float(feature, "adx_proxy")
    ema_slope = _float(feature, "ema_slope_3")
    atr_pct = _float(feature, "atr_pct")
    trend_state = str(feature.get("trend_state") or "mixed")
    if trend_state != "uptrend" or breakout_distance <= 0.0012:
        return None
    score = (
        min(breakout_distance * 9000, 30)
        + min(rel_volume * 14, 24)
        + min(adx_proxy * 0.18, 18)
        + min(max(ema_slope, 0) * 6000, 16)
        + min(max(0.06 - atr_pct, 0) * 180, 12)
    )
    why_now = [
        "Trend structure is already aligned above the fast/slow trend stack.",
        f"Breakout distance is {breakout_distance * 100:.2f}% with relative volume {rel_volume:.2f}x.",
        f"Trend-strength proxy is {adx_proxy:.0f} and EMA slope is positive.",
    ]
    why_not_now = []
    if correlation >= 0.75 and feature["symbol"] in {"WTI", "GOLD", "SILVER"}:
        why_not_now.append("Cross-asset correlation is elevated; confirmation is still needed.")
    return _signal_payload(
        feature,
        signal_type="trend_breakout",
        direction="long",
        score=score,
        thesis="Trend breakout continuation is active above the recent range high.",
        why_now=why_now,
        why_not_now=why_not_now,
        regime="trend_breakout",
        expected_hold="4h to 2d",
        trigger_timeframe="5m retest / VWAP reclaim",
        correlation_note=f"cross-asset corr {correlation:.2f}",
    )


def build_pullback_continuation_signal(feature: dict[str, Any], correlation: float) -> dict[str, Any] | None:
    if not bool(feature.get("pullback_long_ready")):
        return None
    rel_volume = _float(feature, "relative_volume")
    vwap_distance = _float(feature, "vwap_distance_proxy")
    adx_proxy = _float(feature, "adx_proxy")
    score = min(rel_volume * 12, 20) + min(adx_proxy * 0.16, 18) + min(max(1.2 - abs(vwap_distance), 0) * 22, 24) + 18
    why_now = [
        "Price is pulling back into the fast trend envelope instead of chasing the breakout extension.",
        f"Distance versus trend baseline is {vwap_distance:.2f}% and relative volume is {rel_volume:.2f}x.",
    ]
    why_not_now = []
    if correlation <= -0.35:
        why_not_now.append("Cross-asset divergence is unusual; confirm the pullback is not a failed trend.")
    return _signal_payload(
        feature,
        signal_type="pullback_continuation",
        direction="long",
        score=score,
        thesis="Trend pullback continuation is forming near the trend baseline.",
        why_now=why_now,
        why_not_now=why_not_now,
        regime="pullback_continuation",
        expected_hold="1h to 1d",
        trigger_timeframe="1m / 5m reclaim",
        correlation_note=f"cross-asset corr {correlation:.2f}",
    )


def build_squeeze_expansion_signal(feature: dict[str, Any], correlation: float) -> dict[str, Any] | None:
    if not bool(feature.get("squeeze_ready")):
        return None
    breakout_distance = _float(feature, "breakout_distance")
    vol_percentile = _float(feature, "realized_vol_percentile")
    compression = _float(feature, "compression_score")
    rel_volume = _float(feature, "relative_volume")
    direction = "short" if breakout_distance < 0 else "long"
    score = 24 + min(abs(breakout_distance) * 8500, 20) + min(max(compression, 0) * 35, 18) + min(rel_volume * 10, 18) + min(max(55 - vol_percentile, 0) * 0.25, 10)
    why_now = [
        f"Compression score is {compression:.2f} with realized-vol percentile at {vol_percentile:.0f}.",
        f"Breakout impulse is {breakout_distance * 100:.2f}% and volume is {rel_volume:.2f}x baseline.",
    ]
    why_not_now = []
    if abs(correlation) >= 0.82:
        why_not_now.append("This squeeze is heavily coupled to the broader tape; wait for post-break stabilization.")
    return _signal_payload(
        feature,
        signal_type="squeeze_expansion",
        direction=direction,
        score=score,
        thesis="Compression is resolving into a volatility expansion setup.",
        why_now=why_now,
        why_not_now=why_not_now,
        regime="volatility_expansion",
        expected_hold="30m to 8h",
        trigger_timeframe="opening-range break / retest",
        correlation_note=f"cross-asset corr {correlation:.2f}",
    )


def build_range_reversion_signal(feature: dict[str, Any]) -> dict[str, Any] | None:
    long_ready = bool(feature.get("range_reversion_long_ready"))
    short_ready = bool(feature.get("range_reversion_short_ready"))
    if not long_ready and not short_ready:
        return None
    direction = "short" if short_ready else "long"
    range_position = _float(feature, "range_position")
    rsi_proxy = _float(feature, "rsi_14_proxy")
    vol_percentile = _float(feature, "realized_vol_percentile")
    score = 30 + min((1 - abs(0.5 - range_position)) * 12, 12) + min(max(65 - vol_percentile, 0) * 0.22, 14) + min(abs(rsi_proxy - 50) * 0.6, 18)
    why_now = [
        "The market is still in a range regime instead of a clean directional trend.",
        f"Range position is {range_position:.2f} and RSI proxy is {rsi_proxy:.0f}.",
    ]
    why_not_now = ["Range mean reversion should be skipped if a macro catalyst is too close."]
    return _signal_payload(
        feature,
        signal_type="range_mean_reversion",
        direction=direction,
        score=score,
        thesis="Range mean reversion is usable while the market remains rotational.",
        why_now=why_now,
        why_not_now=why_not_now,
        regime="range",
        expected_hold="15m to 6h",
        trigger_timeframe="VWAP reject / reclaim",
        correlation_note="range regime",
    )


def build_cross_asset_divergence_signal(feature: dict[str, Any], correlation: float) -> dict[str, Any] | None:
    symbol = str(feature.get("symbol") or "")
    breakout_distance = _float(feature, "breakout_distance")
    return_5 = _float(feature, "return_5")
    if symbol not in {"WTI", "GOLD", "SILVER"}:
        return None
    if abs(correlation) < 0.35 or abs(return_5) < 0.01:
        return None
    direction = "long" if return_5 > 0 else "short"
    score = 28 + min(abs(return_5) * 600, 22) + min(abs(correlation) * 18, 14) + min(abs(breakout_distance) * 7000, 16)
    why_now = [
        f"{symbol} is diverging from correlated context with a 5-bar move of {return_5 * 100:.2f}%.",
        f"Cross-asset correlation reference is {correlation:.2f}.",
    ]
    return _signal_payload(
        feature,
        signal_type="cross_asset_divergence",
        direction=direction,
        score=score,
        thesis="Cross-asset divergence is large enough to monitor for follow-through.",
        why_now=why_now,
        why_not_now=["Treat this as a candidate until the divergence holds through a retest."],
        regime="divergence",
        expected_hold="1h to 1d",
        trigger_timeframe="5m stabilization",
        correlation_note=f"cross-asset corr {correlation:.2f}",
    )
