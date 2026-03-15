from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.models.entities import Asset, NewsItem, PipelineRun
from app.models.schemas import AssetProvenanceView, DataRealityView, DataRealismPenaltyView


@dataclass(frozen=True)
class ProvenanceSeed:
    name: str
    asset_class: str
    venue: str
    underlying_asset: str
    research_symbol: str
    tradable_symbol: str
    intended_venue: str
    intended_instrument: str
    source_name: str
    source_type: str
    source_timing: str
    freshness_sla_minutes: int
    realism_grade: str
    proxy_mapping_notes: str


PROVENANCE_DEFAULTS: dict[str, ProvenanceSeed] = {
    "BTC": ProvenanceSeed(
        name="Bitcoin",
        asset_class="crypto",
        venue="binance",
        underlying_asset="BTC",
        research_symbol="BTCUSD",
        tradable_symbol="BTCUSD",
        intended_venue="binance_spot",
        intended_instrument="spot_pair",
        source_name="fixture_bars",
        source_type="fixture",
        source_timing="fixture",
        freshness_sla_minutes=1440,
        realism_grade="B",
        proxy_mapping_notes="Direct crypto spot mapping in fixture mode.",
    ),
    "ETH": ProvenanceSeed(
        name="Ethereum",
        asset_class="crypto",
        venue="binance",
        underlying_asset="ETH",
        research_symbol="ETHUSD",
        tradable_symbol="ETHUSD",
        intended_venue="binance_spot",
        intended_instrument="spot_pair",
        source_name="fixture_bars",
        source_type="fixture",
        source_timing="fixture",
        freshness_sla_minutes=1440,
        realism_grade="B",
        proxy_mapping_notes="Direct crypto spot mapping in fixture mode.",
    ),
    "WTI": ProvenanceSeed(
        name="WTI crude proxy",
        asset_class="commodity",
        venue="macro",
        underlying_asset="WTI",
        research_symbol="WTI_CTX",
        tradable_symbol="USO",
        intended_venue="nyse_arca",
        intended_instrument="etf_proxy",
        source_name="macro_fixture_proxy",
        source_type="proxy",
        source_timing="end_of_day",
        freshness_sla_minutes=1440,
        realism_grade="E",
        proxy_mapping_notes="WTI research uses contextual proxy bars and should not be treated like direct CL futures pricing.",
    ),
    "GOLD": ProvenanceSeed(
        name="Gold",
        asset_class="commodity",
        venue="macro",
        underlying_asset="GOLD",
        research_symbol="XAU_CTX",
        tradable_symbol="GLD",
        intended_venue="nyse_arca",
        intended_instrument="etf_proxy",
        source_name="macro_fixture_proxy",
        source_type="proxy",
        source_timing="end_of_day",
        freshness_sla_minutes=1440,
        realism_grade="D",
        proxy_mapping_notes="Gold research uses proxy-grade ETF alignment rather than direct bullion or futures pricing.",
    ),
    "SILVER": ProvenanceSeed(
        name="Silver",
        asset_class="commodity",
        venue="macro",
        underlying_asset="SILVER",
        research_symbol="XAG_CTX",
        tradable_symbol="SLV",
        intended_venue="nyse_arca",
        intended_instrument="etf_proxy",
        source_name="macro_fixture_proxy",
        source_type="proxy",
        source_timing="end_of_day",
        freshness_sla_minutes=1440,
        realism_grade="D",
        proxy_mapping_notes="Silver research uses proxy-grade ETF alignment rather than direct bullion or futures pricing.",
    ),
    "DXY": ProvenanceSeed(
        name="US Dollar Index",
        asset_class="macro",
        venue="macro",
        underlying_asset="DXY",
        research_symbol="DXY_CTX",
        tradable_symbol="UUP",
        intended_venue="arca",
        intended_instrument="macro_proxy_etf",
        source_name="macro_fixture_proxy",
        source_type="delayed",
        source_timing="delayed",
        freshness_sla_minutes=1440,
        realism_grade="C",
        proxy_mapping_notes="Dollar context is delayed macro context, not a tradable dollar index future.",
    ),
    "US10Y": ProvenanceSeed(
        name="US 10Y Treasury",
        asset_class="macro",
        venue="macro",
        underlying_asset="US10Y",
        research_symbol="US10Y_CTX",
        tradable_symbol="IEF",
        intended_venue="nasdaq",
        intended_instrument="bond_etf_proxy",
        source_name="macro_fixture_proxy",
        source_type="delayed",
        source_timing="delayed",
        freshness_sla_minutes=1440,
        realism_grade="C",
        proxy_mapping_notes="Treasury context is delayed macro proxy context rather than live rates futures.",
    ),
    "VIX": ProvenanceSeed(
        name="CBOE Volatility Index",
        asset_class="macro",
        venue="macro",
        underlying_asset="VIX",
        research_symbol="VIX_CTX",
        tradable_symbol="VIXY",
        intended_venue="bats",
        intended_instrument="volatility_etf_proxy",
        source_name="macro_fixture_proxy",
        source_type="delayed",
        source_timing="delayed",
        freshness_sla_minutes=1440,
        realism_grade="D",
        proxy_mapping_notes="VIX context is delayed volatility context rather than live futures execution data.",
    ),
}

GRADE_TO_SCORE = {"A": 96.0, "B": 86.0, "C": 74.0, "D": 60.0, "E": 48.0}
SOURCE_TYPE_TO_PENALTY = {"live": 0.0, "near_live": 3.0, "delayed": 8.0, "proxy": 14.0, "fixture": 18.0}
SOURCE_TIMING_TO_PENALTY = {"live": 0.0, "near_live": 3.0, "delayed": 8.0, "end_of_day": 14.0, "fixture": 6.0}
FRESHNESS_STATE_PENALTY = {
    "fresh": 0.0,
    "aging": 4.0,
    "stale": 12.0,
    "degraded": 24.0,
    "unusable": 40.0,
}


def latest_pipeline_run(session: Session) -> PipelineRun | None:
    return session.exec(select(PipelineRun).order_by(desc(PipelineRun.started_at))).first()


def _source_name_for(symbol: str, source_mode: str) -> str:
    if symbol in {"BTC", "ETH"} and source_mode == "live":
        return "ccxt_live"
    seed = PROVENANCE_DEFAULTS.get(symbol)
    return seed.source_name if seed else "fixture"


def _source_type_for(symbol: str, source_mode: str) -> str:
    if symbol in {"WTI", "GOLD", "SILVER"}:
        return "proxy"
    if symbol in {"DXY", "US10Y", "VIX"}:
        return "delayed"
    return "live" if symbol in {"BTC", "ETH"} and source_mode == "live" else "fixture"


def _source_timing_for(symbol: str, source_mode: str) -> str:
    if symbol in {"BTC", "ETH"} and source_mode == "live":
        return "live"
    seed = PROVENANCE_DEFAULTS.get(symbol)
    return seed.source_timing if seed else "fixture"


def _realism_grade_for(symbol: str, source_mode: str) -> str:
    if symbol in {"BTC", "ETH"} and source_mode == "live":
        return "A"
    return PROVENANCE_DEFAULTS.get(symbol, PROVENANCE_DEFAULTS["BTC"]).realism_grade


def sync_asset_provenance(session: Session, source_mode: str) -> None:
    changed = False
    for asset in session.exec(select(Asset)).all():
        seed = PROVENANCE_DEFAULTS.get(asset.symbol)
        if seed is None:
            continue
        updates = {
            "name": seed.name,
            "asset_class": seed.asset_class,
            "venue": seed.venue,
            "underlying_asset": seed.underlying_asset,
            "research_symbol": seed.research_symbol,
            "tradable_symbol": seed.tradable_symbol,
            "intended_venue": seed.intended_venue,
            "intended_instrument": seed.intended_instrument,
            "source_name": _source_name_for(asset.symbol, source_mode),
            "source_type": _source_type_for(asset.symbol, source_mode),
            "source_timing": _source_timing_for(asset.symbol, source_mode),
            "freshness_sla_minutes": seed.freshness_sla_minutes,
            "realism_grade": _realism_grade_for(asset.symbol, source_mode),
            "proxy_mapping_notes": seed.proxy_mapping_notes,
        }
        for field, value in updates.items():
            if getattr(asset, field) != value:
                setattr(asset, field, value)
                changed = True
        session.add(asset)
    if changed:
        session.commit()


def default_provenance(symbol: str, source_mode: str = "sample") -> AssetProvenanceView:
    seed = PROVENANCE_DEFAULTS.get(symbol, PROVENANCE_DEFAULTS["BTC"])
    return AssetProvenanceView(
        symbol=symbol,
        underlying_asset=seed.underlying_asset,
        research_symbol=seed.research_symbol,
        tradable_symbol=seed.tradable_symbol,
        intended_venue=seed.intended_venue,
        intended_instrument=seed.intended_instrument,
        source_name=_source_name_for(symbol, source_mode),
        source_type=_source_type_for(symbol, source_mode),
        source_timing=_source_timing_for(symbol, source_mode),
        freshness_sla_minutes=seed.freshness_sla_minutes,
        realism_grade=_realism_grade_for(symbol, source_mode),
        proxy_mapping_notes=seed.proxy_mapping_notes,
        asset_class=seed.asset_class,
    )


def asset_provenance_view(asset: Asset | None, source_mode: str = "sample", symbol: str | None = None) -> AssetProvenanceView:
    if asset is None:
        fallback_symbol = symbol or "BTC"
        return default_provenance(fallback_symbol, source_mode=source_mode)
    return AssetProvenanceView(
        symbol=asset.symbol,
        underlying_asset=asset.underlying_asset or asset.symbol,
        research_symbol=asset.research_symbol or asset.symbol,
        tradable_symbol=asset.tradable_symbol or asset.symbol,
        intended_venue=asset.intended_venue or asset.venue,
        intended_instrument=asset.intended_instrument or "unknown",
        source_name=asset.source_name or _source_name_for(asset.symbol, source_mode),
        source_type=asset.source_type or _source_type_for(asset.symbol, source_mode),
        source_timing=asset.source_timing or _source_timing_for(asset.symbol, source_mode),
        freshness_sla_minutes=int(
            asset.freshness_sla_minutes or PROVENANCE_DEFAULTS.get(asset.symbol, PROVENANCE_DEFAULTS["BTC"]).freshness_sla_minutes
        ),
        realism_grade=asset.realism_grade or _realism_grade_for(asset.symbol, source_mode),
        proxy_mapping_notes=asset.proxy_mapping_notes or PROVENANCE_DEFAULTS.get(asset.symbol, PROVENANCE_DEFAULTS["BTC"]).proxy_mapping_notes,
        asset_class=asset.asset_class,
    )


def freshness_minutes(as_of: datetime) -> int:
    return max(0, int((naive_utc_now() - as_of).total_seconds() // 60))


def freshness_state(minutes: int, sla_minutes: int) -> str:
    if minutes <= sla_minutes:
        return "fresh"
    if minutes <= sla_minutes * 2:
        return "aging"
    if minutes <= sla_minutes * 4:
        return "stale"
    if minutes <= sla_minutes * 8:
        return "degraded"
    return "unusable"


def _penalty(code: str, severity: str, summary: str, score_penalty: float) -> DataRealismPenaltyView:
    return DataRealismPenaltyView(
        code=code,
        severity=severity,
        summary=summary,
        score_penalty=round(score_penalty, 1),
    )


def _missing_confirmation(features: dict[str, Any] | None) -> bool:
    if not features:
        return True
    positive = features.get("cross_asset_positive", [])
    if isinstance(positive, list):
        return len(positive) == 0
    return True


def _has_direct_alignment(underlying_asset: str, tradable_symbol: str) -> bool:
    normalized_underlying = underlying_asset.upper()
    normalized_tradable = tradable_symbol.upper()
    return normalized_tradable == normalized_underlying or normalized_tradable.startswith(normalized_underlying)


def _timing_note(source_timing: str) -> str:
    return {
        "live": "Live timing semantics support immediate signal interpretation.",
        "near_live": "Near-live timing semantics are suitable for reactive monitoring but not perfect execution benchmarking.",
        "delayed": "Delayed timing semantics are useful for macro context, not precise short-horizon execution.",
        "end_of_day": "End-of-day timing semantics support swing research but not intraday execution claims.",
        "fixture": "Fixture timing semantics support deterministic local testing only.",
    }.get(source_timing, "Timing semantics are conservative because the source is not directly venue-timed.")


def _execution_suitability(provenance: AssetProvenanceView, state: str) -> str:
    if state in {"degraded", "unusable"}:
        return "unusable"
    if provenance.asset_class == "crypto" and provenance.source_timing == "live" and provenance.source_type == "live":
        return "intraday_suitable"
    if provenance.asset_class == "crypto" and provenance.source_timing == "near_live" and provenance.source_type == "live":
        return "monitor_only"
    if provenance.source_type == "proxy":
        return "context_only"
    if provenance.source_timing in {"delayed", "end_of_day"}:
        return "swing_only"
    if provenance.source_timing == "fixture":
        return "research_only"
    return "monitor_only"


def _news_suitability(provenance: AssetProvenanceView, event_recency_minutes: int | None) -> str:
    if provenance.underlying_asset == "WTI":
        if event_recency_minutes is not None and event_recency_minutes <= 720:
            return "news_context_only"
        return "macro_context"
    if provenance.asset_class == "crypto" and provenance.source_timing in {"live", "near_live"}:
        return "reactive"
    if provenance.source_timing in {"delayed", "end_of_day"}:
        return "context_only"
    if provenance.source_timing == "fixture":
        return "research_only"
    return "monitor_only"


def _event_context_for_symbol(session: Session, symbol: str) -> tuple[int | None, str]:
    if symbol != "WTI":
        return None, ""
    latest_eia = session.exec(
        select(NewsItem).where(NewsItem.source == "EIA").order_by(desc(NewsItem.published_at))
    ).first()
    if latest_eia is None:
        return None, "EIA release window is relevant for oil context, but no local release item is currently loaded."
    recency = freshness_minutes(latest_eia.published_at)
    if recency <= 180:
        release_window = "inside or near the latest EIA release window"
    elif recency <= 720:
        release_window = "recent enough for oil news context"
    else:
        release_window = "outside the immediate oil release window"
    note = (
        f"EIA schedule awareness: weekly petroleum context is anchored to the Wednesday 10:30 ET release window; "
        f"the latest local EIA item is {recency} minutes old and is {release_window}."
    )
    return recency, note


def build_data_reality(
    provenance: AssetProvenanceView,
    *,
    as_of: datetime | None,
    data_quality: str,
    source_mode: str,
    features: dict[str, Any] | None = None,
    tradable_symbol: str | None = None,
    event_recency_minutes: int | None = None,
    event_context_note: str = "",
) -> DataRealityView:
    minutes = freshness_minutes(as_of) if as_of is not None else 9999
    state = freshness_state(minutes, provenance.freshness_sla_minutes)
    penalties: list[DataRealismPenaltyView] = []

    if source_mode == "sample" or data_quality == "fixture":
        penalties.append(
            _penalty(
                "fixture_only",
                "warning",
                "Current context is running in deterministic fixture-first mode.",
                14.0 if provenance.asset_class == "crypto" else 18.0,
            )
        )

    source_penalty = SOURCE_TYPE_TO_PENALTY.get(provenance.source_type, 10.0)
    if provenance.source_type == "proxy":
        penalties.append(
            _penalty(
                "proxy_grade_mapping",
                "warning",
                provenance.proxy_mapping_notes or "Tradable mapping is proxy-grade rather than direct.",
                source_penalty,
            )
        )
    elif provenance.source_type == "delayed":
        penalties.append(
            _penalty(
                "delayed_source",
                "warning",
                "Source is delayed relative to direct live market data.",
                source_penalty,
            )
        )
    elif provenance.source_type == "fixture":
        penalties.append(
            _penalty(
                "fixture_source",
                "info",
                "Source is fixture-backed rather than exchange-verified.",
                source_penalty,
            )
        )

    timing_penalty = SOURCE_TIMING_TO_PENALTY.get(provenance.source_timing, 10.0)
    if provenance.source_timing != "live":
        severity = "info" if provenance.source_timing in {"near_live", "fixture"} else "warning"
        penalties.append(
            _penalty(
                f"timing_{provenance.source_timing}",
                severity,
                _timing_note(provenance.source_timing),
                timing_penalty,
            )
        )

    if state != "fresh":
        severity = "warning" if state in {"aging", "stale"} else "critical"
        penalties.append(
            _penalty(
                f"freshness_{state}",
                severity,
                f"Freshness policy is {state} at {minutes} minutes against an SLA of {provenance.freshness_sla_minutes}.",
                FRESHNESS_STATE_PENALTY[state],
            )
        )

    active_tradable = tradable_symbol or provenance.tradable_symbol
    if active_tradable and not _has_direct_alignment(provenance.underlying_asset, active_tradable):
        penalties.append(
            _penalty(
                "tradable_mismatch",
                "warning",
                f"Research symbol {provenance.research_symbol} and underlying {provenance.underlying_asset} are aligned through tradable proxy {active_tradable}.",
                8.0 if provenance.asset_class == "crypto" else 12.0,
            )
        )

    if provenance.source_type in {"proxy", "delayed"} and provenance.asset_class in {"commodity", "macro"}:
        penalties.append(
            _penalty(
                "contextual_price_only",
                "warning",
                "Current series is suitable for contextual research, not direct execution benchmarking.",
                10.0,
            )
        )

    if provenance.source_timing in {"delayed", "end_of_day", "fixture"} and provenance.asset_class in {"commodity", "macro"}:
        penalties.append(
            _penalty(
                "timing_too_weak_for_intraday",
                "warning",
                "Price timing is too weak for intraday-style execution claims on this asset class.",
                10.0 if provenance.asset_class == "commodity" else 8.0,
            )
        )

    if _missing_confirmation(features):
        penalties.append(
            _penalty(
                "missing_cross_asset_confirmation",
                "info",
                "Cross-asset confirmation is weak or missing in the latest context.",
                6.0,
            )
        )

    if provenance.underlying_asset == "WTI":
        penalties.append(
            _penalty(
                "weak_oil_realism",
                "critical" if provenance.source_timing != "live" else "warning",
                "Oil context is materially weaker than direct venue-grade futures data.",
                20.0 if provenance.source_timing != "live" else 6.0,
            )
        )
        if event_recency_minutes is not None and event_recency_minutes <= 720:
            penalties.append(
                _penalty(
                    "oil_release_window_proxy",
                    "critical",
                    "Recent EIA release context is useful for news interpretation, but the current oil price mapping is not intraday-execution-suitable.",
                    12.0,
                )
            )
    elif provenance.underlying_asset in {"GOLD", "SILVER"}:
        penalties.append(
            _penalty(
                "weak_metals_realism",
                "warning",
                "Metals context is proxy-backed and should be treated more conservatively than crypto spot data.",
                14.0,
            )
        )

    base_score = GRADE_TO_SCORE.get(provenance.realism_grade, 60.0)
    total_penalty = sum(item.score_penalty for item in penalties)
    realism_score = max(0.0, round(base_score - total_penalty, 1))
    execution_suitability = _execution_suitability(provenance, state)
    news_suitability = _news_suitability(provenance, event_recency_minutes)
    promotion_blocked = state in {"degraded", "unusable"} or realism_score < 45.0 or execution_suitability in {"context_only", "unusable"}
    alert_allowed = state not in {"degraded", "unusable"} and realism_score >= 35.0
    warning_parts = [item.summary for item in penalties if item.severity in {"warning", "critical"}]
    tradable_alignment_note = (
        f"{provenance.underlying_asset} research symbol {provenance.research_symbol} aligns directly with {active_tradable} on {provenance.intended_venue}."
        if _has_direct_alignment(provenance.underlying_asset, active_tradable)
        else f"{provenance.underlying_asset} research symbol {provenance.research_symbol} is mapped to tradable proxy {active_tradable} on {provenance.intended_venue}."
    )
    return DataRealityView(
        provenance=provenance,
        freshness_minutes=minutes,
        freshness_state=state,
        event_recency_minutes=event_recency_minutes,
        realism_score=realism_score,
        ranking_penalty=round(total_penalty, 1),
        promotion_blocked=promotion_blocked,
        alert_allowed=alert_allowed,
        execution_suitability=execution_suitability,
        news_suitability=news_suitability,
        ui_warning=" | ".join(warning_parts[:3]),
        timing_semantics_note=_timing_note(provenance.source_timing),
        event_context_note=event_context_note,
        penalties=penalties,
        tradable_alignment_note=tradable_alignment_note,
    )


def asset_reality(
    session: Session,
    symbol: str,
    *,
    as_of: datetime | None,
    data_quality: str,
    features: dict[str, Any] | None = None,
    tradable_symbol: str | None = None,
) -> DataRealityView:
    latest_run = latest_pipeline_run(session)
    source_mode = latest_run.source_mode if latest_run else "sample"
    asset = session.exec(select(Asset).where(Asset.symbol == symbol)).first()
    provenance = asset_provenance_view(asset, source_mode=source_mode, symbol=symbol)
    event_recency, event_note = _event_context_for_symbol(session, symbol)
    return build_data_reality(
        provenance,
        as_of=as_of,
        data_quality=data_quality,
        source_mode=source_mode,
        features=features,
        tradable_symbol=tradable_symbol,
        event_recency_minutes=event_recency,
        event_context_note=event_note,
    )
