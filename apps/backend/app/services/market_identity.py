from __future__ import annotations

import json
from dataclasses import dataclass

from sqlmodel import Session

from app.core.settings import get_settings
from app.models.schemas import InstrumentMappingView
from app.services.data_reality import latest_pipeline_run


@dataclass(frozen=True)
class InstrumentMapping:
    canonical_symbol: str
    trader_symbol: str
    display_symbol: str
    display_name: str
    underlying_asset: str
    research_symbol: str
    public_symbol: str
    broker_symbol: str
    broker_truth: bool
    mapping_notes: str
    aliases: tuple[str, ...]


DEFAULT_MAPPINGS: dict[str, InstrumentMapping] = {
    "BTC": InstrumentMapping(
        canonical_symbol="BTC",
        trader_symbol="BTCUSD",
        display_symbol="BTC / BTCUSD",
        display_name="Bitcoin",
        underlying_asset="BTC",
        research_symbol="BTCUSD",
        public_symbol="BTCUSD",
        broker_symbol="BTCUSD",
        broker_truth=True,
        mapping_notes="Crypto research and broker symbol align directly on BTCUSD.",
        aliases=("BTC", "BTCUSD"),
    ),
    "ETH": InstrumentMapping(
        canonical_symbol="ETH",
        trader_symbol="ETHUSD",
        display_symbol="ETH / ETHUSD",
        display_name="Ethereum",
        underlying_asset="ETH",
        research_symbol="ETHUSD",
        public_symbol="ETHUSD",
        broker_symbol="ETHUSD",
        broker_truth=True,
        mapping_notes="Crypto research and broker symbol align directly on ETHUSD.",
        aliases=("ETH", "ETHUSD"),
    ),
    "WTI": InstrumentMapping(
        canonical_symbol="WTI",
        trader_symbol="USOUSD",
        display_symbol="USOUSD / WTI context",
        display_name="Oil / USOUSD",
        underlying_asset="WTI",
        research_symbol="WTI_CTX",
        public_symbol="USO",
        broker_symbol="USOUSD",
        broker_truth=False,
        mapping_notes="USOUSD is the trader-facing oil instrument. Research still uses WTI context and public fallback may rely on USO proxy data when direct broker-truth oil data is unavailable.",
        aliases=("WTI", "USO", "USOUSD", "USOIL"),
    ),
    "GOLD": InstrumentMapping(
        canonical_symbol="GOLD",
        trader_symbol="XAUUSD",
        display_symbol="Gold / XAUUSD",
        display_name="Gold",
        underlying_asset="GOLD",
        research_symbol="XAU_CTX",
        public_symbol="GLD",
        broker_symbol="XAUUSD",
        broker_truth=False,
        mapping_notes="Gold is surfaced with broker-style XAUUSD mapping, but current public/fixture context remains proxy-grade unless a broker feed is available.",
        aliases=("GOLD", "XAUUSD", "GLD"),
    ),
    "SILVER": InstrumentMapping(
        canonical_symbol="SILVER",
        trader_symbol="XAGUSD",
        display_symbol="Silver / XAGUSD",
        display_name="Silver",
        underlying_asset="SILVER",
        research_symbol="XAG_CTX",
        public_symbol="SLV",
        broker_symbol="XAGUSD",
        broker_truth=False,
        mapping_notes="Silver is surfaced with broker-style XAGUSD mapping, but current public/fixture context remains proxy-grade unless a broker feed is available.",
        aliases=("SILVER", "XAGUSD", "SLV"),
    ),
    "DXY": InstrumentMapping(
        canonical_symbol="DXY",
        trader_symbol="DXY",
        display_symbol="DXY",
        display_name="US Dollar Index",
        underlying_asset="DXY",
        research_symbol="DXY_CTX",
        public_symbol="UUP",
        broker_symbol="DXY",
        broker_truth=False,
        mapping_notes="DXY is contextual macro data rather than direct broker-truth execution data.",
        aliases=("DXY", "UUP"),
    ),
    "US10Y": InstrumentMapping(
        canonical_symbol="US10Y",
        trader_symbol="US10Y",
        display_symbol="US10Y",
        display_name="US 10Y Yield",
        underlying_asset="US10Y",
        research_symbol="US10Y_CTX",
        public_symbol="IEF",
        broker_symbol="US10Y",
        broker_truth=False,
        mapping_notes="US10Y remains a contextual macro series and is not broker-truth execution data.",
        aliases=("US10Y", "IEF"),
    ),
    "VIX": InstrumentMapping(
        canonical_symbol="VIX",
        trader_symbol="VIX",
        display_symbol="VIX",
        display_name="Volatility Index",
        underlying_asset="VIX",
        research_symbol="VIX_CTX",
        public_symbol="VIXY",
        broker_symbol="VIX",
        broker_truth=False,
        mapping_notes="VIX remains contextual and should not be treated as broker-truth execution data.",
        aliases=("VIX", "VIXY"),
    ),
}

PRIMARY_COMMODITY_CLUSTER: tuple[str, ...] = ("WTI", "GOLD", "SILVER")
TERMINAL_FOCUS_ORDER: tuple[str, ...] = (*PRIMARY_COMMODITY_CLUSTER, "BTC", "ETH", "DXY", "US10Y", "VIX")


def _configured_mappings() -> dict[str, InstrumentMapping]:
    settings = get_settings()
    if not settings.symbol_mapping_json.strip():
        return DEFAULT_MAPPINGS
    try:
        payload = json.loads(settings.symbol_mapping_json)
    except json.JSONDecodeError:
        return DEFAULT_MAPPINGS
    merged = dict(DEFAULT_MAPPINGS)
    for canonical_symbol, value in payload.items():
        if canonical_symbol not in merged or not isinstance(value, dict):
            continue
        base = merged[canonical_symbol]
        merged[canonical_symbol] = InstrumentMapping(
            canonical_symbol=canonical_symbol,
            trader_symbol=str(value.get("trader_symbol", base.trader_symbol)),
            display_symbol=str(value.get("display_symbol", base.display_symbol)),
            display_name=str(value.get("display_name", base.display_name)),
            underlying_asset=str(value.get("underlying_asset", base.underlying_asset)),
            research_symbol=str(value.get("research_symbol", base.research_symbol)),
            public_symbol=str(value.get("public_symbol", base.public_symbol)),
            broker_symbol=str(value.get("broker_symbol", base.broker_symbol)),
            broker_truth=bool(value.get("broker_truth", base.broker_truth)),
            mapping_notes=str(value.get("mapping_notes", base.mapping_notes)),
            aliases=tuple(str(item).upper() for item in value.get("aliases", base.aliases)),
        )
    return merged


def resolve_symbol(symbol: str) -> str:
    requested = symbol.upper()
    for mapping in _configured_mappings().values():
        if requested in mapping.aliases:
            return mapping.canonical_symbol
    return requested


def has_instrument_mapping(symbol: str) -> bool:
    requested = symbol.upper()
    mappings = _configured_mappings()
    if requested in mappings:
        return True
    return any(requested in mapping.aliases for mapping in mappings.values())


def instrument_mapping_view(symbol: str, requested_symbol: str | None = None) -> InstrumentMappingView:
    requested = (requested_symbol or symbol).upper()
    canonical_symbol = resolve_symbol(symbol)
    mapping = _configured_mappings().get(canonical_symbol)
    if mapping is None:
        return InstrumentMappingView(
            requested_symbol=requested,
            canonical_symbol=canonical_symbol,
            trader_symbol=canonical_symbol,
            display_symbol=canonical_symbol,
            display_name=canonical_symbol,
            underlying_asset=canonical_symbol,
            research_symbol=canonical_symbol,
            public_symbol=canonical_symbol,
            broker_symbol=canonical_symbol,
            broker_truth=False,
            mapping_notes="No explicit symbol mapping is configured for this instrument yet.",
        )
    return InstrumentMappingView(
        requested_symbol=requested,
        canonical_symbol=mapping.canonical_symbol,
        trader_symbol=mapping.trader_symbol,
        display_symbol=mapping.display_symbol,
        display_name=mapping.display_name,
        underlying_asset=mapping.underlying_asset,
        research_symbol=mapping.research_symbol,
        public_symbol=mapping.public_symbol,
        broker_symbol=mapping.broker_symbol,
        broker_truth=mapping.broker_truth,
        mapping_notes=mapping.mapping_notes,
    )


def market_data_mode(session: Session) -> str:
    settings = get_settings()
    latest_run = latest_pipeline_run(session)
    if latest_run is None or latest_run.source_mode == "sample" or settings.use_sample_only:
        return "fixture"
    if settings.broker_market_data_enabled:
        return "broker_live"
    return "public_live"


def terminal_focus_priority(symbol: str) -> int:
    canonical_symbol = resolve_symbol(symbol)
    try:
        return TERMINAL_FOCUS_ORDER.index(canonical_symbol)
    except ValueError:
        return len(TERMINAL_FOCUS_ORDER) + 50


def is_primary_commodity(symbol: str) -> bool:
    return resolve_symbol(symbol) in PRIMARY_COMMODITY_CLUSTER
