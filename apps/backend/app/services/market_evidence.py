from __future__ import annotations

from uuid import uuid4

from sqlalchemy.exc import OperationalError
from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.models.entities import BacktestResult, SignalRecord, StrategyRegistryEntry
from app.models.schemas import (
    MarketEvidenceProviderDescriptor,
    MarketEvidenceProviderReadinessView,
    MarketEvidenceSnapshot,
)
from app.services.market_views import market_chart_view
from app.services.market_identity import resolve_symbol


LOCAL_PROVIDER_ID = "local_ai_trader_snapshot"


def _first_or_none(session: Session, statement):
    try:
        return session.exec(statement).first()
    except OperationalError:
        return None


def _all_or_empty(session: Session, statement) -> list:
    try:
        return list(session.exec(statement).all())
    except OperationalError:
        return []


def _snapshot_id() -> str:
    return f"market_evidence_{uuid4().hex[:16]}"


def list_market_evidence_providers() -> list[MarketEvidenceProviderDescriptor]:
    now = naive_utc_now()
    return [
        MarketEvidenceProviderDescriptor(
            provider_id=LOCAL_PROVIDER_ID,
            display_name="AI Trader local snapshot",
            provider_type="local_snapshot",
            enabled=True,
            configured=True,
            paper_research_only=True,
            supports_symbols=["USOUSD", "XAGUSD", "XAUUSD", "BTCUSD", "ETHUSD"],
            supports_timeframes=["15m", "1h", "4h", "1d"],
            freshness_policy="Uses the latest locally seeded or configured chart, signal, strategy, and backtest records; freshness is reported from the local chart view.",
            limitations=[
                "No external API is called by this provider.",
                "Fixture or proxy-grade rows remain labeled as degraded research evidence.",
                "This provider does not create proposals, simulated orders, ledger rows, or risk decisions.",
            ],
            last_checked_at=now,
        ),
        MarketEvidenceProviderDescriptor(
            provider_id="openbb_future_adapter",
            display_name="OpenBB future data adapter",
            provider_type="unavailable_external",
            enabled=False,
            configured=False,
            paper_research_only=True,
            supports_symbols=[],
            supports_timeframes=[],
            freshness_policy="Placeholder only. No OpenBB dependency, API key, or network call is configured in Phase 9J.",
            limitations=[
                "Not configured in this phase.",
                "No credentials are required.",
                "Shown only to document future adapter direction.",
            ],
            last_checked_at=None,
        ),
    ]


def get_market_evidence_provider(provider_id: str = LOCAL_PROVIDER_ID) -> MarketEvidenceProviderDescriptor:
    providers = list_market_evidence_providers()
    return next((provider for provider in providers if provider.provider_id == provider_id), providers[0])


def provider_readiness_summary(session: Session) -> list[MarketEvidenceProviderReadinessView]:
    providers = list_market_evidence_providers()
    local_snapshot = market_evidence_snapshot(session, "USOUSD", "1d")
    readiness: list[MarketEvidenceProviderReadinessView] = []
    for provider in providers:
        if provider.provider_id == LOCAL_PROVIDER_ID:
            degraded = local_snapshot.data_quality in {"partial", "degraded", "unavailable"} or local_snapshot.freshness_status in {"stale", "degraded", "unavailable"}
            readiness.append(
                MarketEvidenceProviderReadinessView(
                    provider_id=provider.provider_id,
                    display_name=provider.display_name,
                    enabled=provider.enabled,
                    configured=provider.configured,
                    readiness_status="degraded" if degraded else "ready_local",
                    paper_research_only=True,
                    supported_symbols=provider.supports_symbols,
                    supported_timeframes=provider.supports_timeframes,
                    latest_snapshot_status=f"{local_snapshot.freshness_status}/{local_snapshot.data_quality}",
                    missing_requirements=local_snapshot.missing_inputs,
                    limitations=provider.limitations,
                    next_setup_step=local_snapshot.suggested_next_inspection,
                    external_dependency_required=False,
                    network_calls_enabled=False,
                    secrets_required=False,
                    execution_capable=False,
                )
            )
            continue
        readiness.append(
            MarketEvidenceProviderReadinessView(
                provider_id=provider.provider_id,
                display_name=provider.display_name,
                enabled=provider.enabled,
                configured=provider.configured,
                readiness_status="not_configured",
                paper_research_only=True,
                supported_symbols=provider.supports_symbols,
                supported_timeframes=provider.supports_timeframes,
                latest_snapshot_status=None,
                missing_requirements=[
                    "future_dependency_not_installed",
                    "provider_not_configured",
                    "no_network_calls_enabled",
                ],
                limitations=provider.limitations,
                next_setup_step="Keep this placeholder disabled until a later paper/research data-adapter phase explicitly adds configuration and tests.",
                external_dependency_required=True,
                network_calls_enabled=False,
                secrets_required=True,
                execution_capable=False,
            )
        )
    return readiness


def _trend_summary(closes: list[float]) -> str | None:
    if len(closes) < 2:
        return None
    delta = closes[-1] - closes[0]
    pct = (delta / closes[0] * 100) if closes[0] else 0.0
    direction = "higher" if delta > 0 else "lower" if delta < 0 else "flat"
    return f"Last {len(closes)} local closes are {direction} by {pct:.2f}%."


def _volatility_summary(highs: list[float], lows: list[float], closes: list[float]) -> str | None:
    if not highs or not lows or not closes:
        return None
    latest_close = closes[-1]
    average_range = sum(max(high - low, 0.0) for high, low in zip(highs, lows, strict=False)) / len(closes)
    pct = (average_range / latest_close * 100) if latest_close else 0.0
    return f"Average local high-low range is {pct:.2f}% of latest close."


def market_evidence_snapshot(session: Session, symbol: str, timeframe: str = "1d") -> MarketEvidenceSnapshot:
    requested_symbol = symbol.upper()
    canonical_symbol = resolve_symbol(requested_symbol)
    normalized_timeframe = timeframe.lower()
    created_at = naive_utc_now()
    provider = get_market_evidence_provider()
    chart = market_chart_view(session, canonical_symbol, normalized_timeframe)
    display_symbol = chart.instrument_mapping.trader_symbol or requested_symbol
    bars = chart.bars
    latest_bar = bars[-1] if bars else None
    latest_signal = _first_or_none(
        session,
        select(SignalRecord)
        .where(SignalRecord.symbol.in_([requested_symbol, canonical_symbol]))
        .order_by(desc(SignalRecord.timestamp))
        .limit(1),
    )
    strategies = _all_or_empty(session, select(StrategyRegistryEntry).order_by(StrategyRegistryEntry.name))
    strategy_for_symbol = next((row for row in strategies if row.tradable_symbol == canonical_symbol), None)
    latest_backtest = _first_or_none(
        session,
        select(BacktestResult)
        .where(BacktestResult.symbol.in_([requested_symbol, canonical_symbol]))
        .order_by(desc(BacktestResult.created_at))
        .limit(1),
    )

    missing_inputs: list[str] = []
    degraded_notes: list[str] = []
    if not bars:
        missing_inputs.append("local_chart_bars")
        degraded_notes.append(chart.status_note)
    if latest_signal is None:
        missing_inputs.append("local_signal")
        degraded_notes.append("No local signal row matched this symbol.")
    if strategy_for_symbol is None:
        missing_inputs.append("strategy_contract")
        degraded_notes.append("No strategy contract matched the trader-facing symbol.")
    if latest_backtest is None:
        missing_inputs.append("backtest_result")
        degraded_notes.append("No symbol-specific backtest result is loaded.")
    if chart.freshness_state in {"stale", "degraded", "unusable"}:
        degraded_notes.append(f"Local chart freshness is {chart.freshness_state}.")
    if chart.is_fixture_mode:
        degraded_notes.append("Local chart context is fixture or sample-backed.")

    if not bars:
        freshness_status = "unavailable"
        data_quality = "unavailable"
    elif chart.freshness_state in {"fresh", "aging"} and not chart.is_fixture_mode:
        freshness_status = "fresh"
        data_quality = "good"
    elif chart.freshness_state in {"fresh", "aging"}:
        freshness_status = "degraded"
        data_quality = "partial"
    else:
        freshness_status = chart.freshness_state
        data_quality = "degraded"

    closes = [bar.close for bar in bars[-20:]]
    highs = [bar.high for bar in bars[-20:]]
    lows = [bar.low for bar in bars[-20:]]
    signal_summary = (
        f"{latest_signal.signal_type} / {latest_signal.direction} score {latest_signal.score:.1f}: {latest_signal.thesis}"
        if latest_signal
        else None
    )
    backtest_summary = (
        f"{latest_backtest.strategy_name} {latest_backtest.status}: return {latest_backtest.net_return_pct:.2f}%, max drawdown {latest_backtest.max_drawdown_pct:.2f}%."
        if latest_backtest
        else None
    )
    assumptions_summary = None
    if latest_backtest:
        assumptions = (latest_backtest.metadata_json or {}).get("assumptions", {})
        validation = (latest_backtest.validation_json or {}).get("validation_metadata", {})
        assumptions_summary = (
            f"fee={assumptions.get('fee_bps', latest_backtest.fees_bps)} bps, "
            f"slippage={assumptions.get('slippage_bps', latest_backtest.slippage_bps)} bps, "
            f"no-lookahead={validation.get('no_lookahead', 'unknown')}"
        )

    if data_quality in {"good", "partial"} and freshness_status != "unavailable":
        suggested_next = "Compare Strategy Lab contract requirements with the latest Backtests assumptions before the next paper/research decision."
    else:
        suggested_next = "Refresh local chart/signal/backtest evidence before relying on this cockpit summary."

    return MarketEvidenceSnapshot(
        snapshot_id=_snapshot_id(),
        created_at=created_at,
        symbol=display_symbol,
        timeframe=normalized_timeframe,
        source_family=chart.source_mode,
        provider_id=provider.provider_id,
        provider_display_name=provider.display_name,
        freshness_status=freshness_status,
        data_quality=data_quality,
        latest_price=latest_bar.close if latest_bar else None,
        latest_timestamp=latest_bar.timestamp if latest_bar else None,
        trend_summary=_trend_summary(closes),
        volatility_summary=_volatility_summary(highs, lows, closes),
        signal_summary=signal_summary,
        backtest_summary=backtest_summary,
        assumptions_summary=assumptions_summary,
        missing_inputs=missing_inputs,
        degraded_notes=list(dict.fromkeys(degraded_notes)),
        suggested_next_inspection=suggested_next,
        paper_research_only=True,
    )
