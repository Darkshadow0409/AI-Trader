from __future__ import annotations

import json
import math
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.connectors.polymarket_client import fetch_events
from app.core.clock import naive_utc_now
from app.core.settings import get_settings
from app.models.schemas import PolymarketEventView, PolymarketHunterView, PolymarketMarketView, PolymarketOutcomeView


settings = get_settings()
FIXTURE_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "polymarket_events.json"
_CACHE: dict[str, Any] = {"expires_at": 0.0, "events": [], "source_status": "fixture", "source_note": "Not loaded yet."}

CATEGORY_KEYWORDS: dict[str, set[str]] = {
    "crypto": {"btc", "bitcoin", "eth", "ethereum", "crypto", "sol", "defi", "etf"},
    "macro": {"macro", "growth", "recession", "economy", "gdp", "global", "risk", "risk-off", "risk on"},
    "commodities": {"oil", "wti", "crude", "brent", "energy", "gold", "silver", "xau", "xag", "metals", "bullion"},
    "politics": {"trump", "biden", "election", "president", "congress", "politics", "geopolitics", "war"},
    "rates_inflation": {"fed", "fomc", "cpi", "inflation", "rates", "rate cut", "rate hike", "yield", "treasury", "dxy", "dollar", "usd"},
    "broad_market_narrative": {"stocks", "equities", "market", "nasdaq", "spx", "s&p", "volatility", "vix"},
}

ASSET_PROFILES: dict[str, dict[str, tuple[str, ...] | str]] = {
    "BTC": {
        "direct": ("btc", "bitcoin", "crypto", "spot bitcoin", "bitcoin etf"),
        "macro": ("rates", "fed", "inflation", "dollar", "risk-on", "risk off", "liquidity"),
        "category": "crypto",
    },
    "ETH": {
        "direct": ("eth", "ethereum", "crypto", "defi", "layer 2", "staking"),
        "macro": ("rates", "fed", "inflation", "dollar", "risk-on", "risk off", "liquidity"),
        "category": "crypto",
    },
    "WTI": {
        "direct": ("wti", "oil", "crude", "energy", "brent", "eia", "opec", "uso", "inventory"),
        "macro": ("inflation", "recession", "geopolitics", "growth", "demand", "supply", "fed"),
        "category": "commodities",
    },
    "GOLD": {
        "direct": ("gold", "xau", "bullion", "precious metals"),
        "macro": ("inflation", "rates", "fed", "dollar", "recession", "risk-off", "safe haven"),
        "category": "commodities",
    },
    "SILVER": {
        "direct": ("silver", "xag", "metals", "bullion", "precious metals"),
        "macro": ("inflation", "rates", "fed", "dollar", "recession", "risk-off", "industrial demand"),
        "category": "commodities",
    },
    "DXY": {
        "direct": ("dxy", "dollar", "usd", "us dollar"),
        "macro": ("fed", "rates", "inflation", "yield", "treasury", "macro"),
        "category": "rates_inflation",
    },
    "US10Y": {
        "direct": ("10y", "10-year", "yield", "yields", "treasury", "us10y"),
        "macro": ("fed", "rates", "inflation", "dollar", "cpi", "fomc"),
        "category": "rates_inflation",
    },
}


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(UTC).replace(tzinfo=None)
    except ValueError:
        return None


def _parse_float(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _parse_json_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _fixture_events() -> list[dict[str, Any]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _load_events() -> tuple[list[dict[str, Any]], str, str]:
    now = time.time()
    if now < float(_CACHE["expires_at"]):
        return _CACHE["events"], _CACHE["source_status"], _CACHE["source_note"]

    source_status = "fixture"
    source_note = "Using seeded Polymarket fixture data."
    events: list[dict[str, Any]] = []
    if settings.polymarket_enabled:
        try:
            events = fetch_events(limit=40, active=True, closed=False)
            source_status = "live"
            source_note = "Live read-only Polymarket Gamma API."
        except Exception:
            events = []
    if not events:
        events = _fixture_events()
        if settings.polymarket_enabled:
            source_status = "fixture_fallback"
            source_note = "Polymarket API unavailable; showing fixture fallback."

    _CACHE.update(
        {
            "expires_at": now + max(settings.polymarket_cache_seconds, 30),
            "events": events,
            "source_status": source_status,
            "source_note": source_note,
        }
    )
    return events, source_status, source_note


def _infer_assets(*parts: Any) -> list[str]:
    haystack = " ".join(str(part or "") for part in parts).lower()
    matched = [
        symbol
        for symbol, profile in ASSET_PROFILES.items()
        if any(keyword in haystack for keyword in (*profile["direct"], *profile["macro"]))
    ]
    return sorted(set(matched))


def _normalize_text(*parts: Any) -> str:
    return " ".join(str(part or "") for part in parts).lower()


def _infer_category(*parts: Any) -> str:
    haystack = _normalize_text(*parts)
    best_category = "broad_market_narrative"
    best_score = 0
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in haystack)
        if score > best_score:
            best_category = category
            best_score = score
    return best_category


def _liquidity_score(value: float) -> float:
    return min(math.log10(max(value, 1.0)), 6.0) / 6.0


def _recency_score(end_date: datetime | None) -> float:
    if end_date is None:
        return 0.2
    delta_days = (end_date - naive_utc_now()).total_seconds() / 86400
    if delta_days < -1:
        return -0.2
    if delta_days <= 7:
        return 1.0
    if delta_days <= 30:
        return 0.7
    if delta_days <= 90:
        return 0.4
    return 0.1


def _activity_score(market: PolymarketMarketView) -> float:
    return (_liquidity_score(market.recent_activity) * 0.6) + (_liquidity_score(market.volume) * 0.4)


def _asset_relevance(normalized_symbol: str, market: PolymarketMarketView, query_hint: str) -> tuple[float, list[str]]:
    profile = ASSET_PROFILES.get(normalized_symbol)
    if profile is None:
        return 0.0, []

    haystack = _normalize_text(market.question, market.event_title, market.primary_tag, " ".join(market.tags), query_hint)
    direct_hits = sum(1 for keyword in profile["direct"] if keyword in haystack)
    macro_hits = sum(1 for keyword in profile["macro"] if keyword in haystack)
    category_match = market.category == profile["category"]

    score = 0.0
    reasons: list[str] = []
    if normalized_symbol in market.related_assets:
        score += 4.0
        reasons.append(f"direct {normalized_symbol.lower()} linkage")
    elif market.related_assets:
        score -= 3.5
    if direct_hits:
        score += min(direct_hits, 3) * 1.4
        reasons.append("asset-specific wording")
    if macro_hits:
        score += min(macro_hits, 3) * 0.8
        reasons.append("macro narrative overlap")
    if category_match:
        score += 1.2
        reasons.append(f"{market.category.replace('_', '/')} category fit")
    elif market.category == "crypto" and profile["category"] == "commodities":
        score -= 1.5
    elif profile["category"] == "crypto" and market.category == "commodities":
        score -= 1.5
    return score, reasons


def _market_relevance(normalized_symbol: str, market: PolymarketMarketView, query_hint: str) -> tuple[float, str]:
    asset_score, reasons = _asset_relevance(normalized_symbol, market, query_hint)
    liquidity_score = _liquidity_score(market.liquidity)
    volume_score = _liquidity_score(market.volume)
    recent_score = _activity_score(market)
    expiry_score = _recency_score(market.end_date)

    score = asset_score + (liquidity_score * 1.0) + (volume_score * 0.8) + (recent_score * 1.0) + (expiry_score * 0.8)
    if market.closed:
        score -= 2.0
    if market.status != "active":
        score -= 0.5
    if market.related_assets and normalized_symbol not in market.related_assets:
        score -= 2.0

    reason_parts: list[str] = []
    if reasons:
        reason_parts.append(", ".join(reasons[:2]))
    if market.volume >= 100000:
        reason_parts.append("high volume")
    elif market.volume >= 25000:
        reason_parts.append("solid volume")
    if market.recent_activity >= 25000:
        reason_parts.append("active recent trading")
    if expiry_score >= 0.7:
        reason_parts.append("near-term expiry")
    elif market.end_date is None:
        reason_parts.append("open-ended narrative")

    reason = ". ".join(part.capitalize() for part in reason_parts[:3]) or "Broad narrative market with limited direct asset linkage."
    return round(score, 3), reason


def _outcome_views(market: dict[str, Any]) -> list[PolymarketOutcomeView]:
    outcomes = [str(item) for item in _parse_json_list(market.get("outcomes"))]
    prices = [_parse_float(item) for item in _parse_json_list(market.get("outcomePrices"))]
    payload: list[PolymarketOutcomeView] = []
    for index, label in enumerate(outcomes):
        payload.append(PolymarketOutcomeView(label=label, probability=prices[index] if index < len(prices) else 0.0))
    return payload


def _status_label(active: bool, closed: bool, archived: bool = False) -> str:
    if closed:
        return "closed"
    if archived:
        return "archived"
    if active:
        return "active"
    return "inactive"


def _tag_labels(event: dict[str, Any]) -> list[str]:
    payload: list[str] = []
    for tag in event.get("tags", []):
        if isinstance(tag, dict):
            label = str(tag.get("label") or tag.get("slug") or "").strip()
            if label:
                payload.append(label)
        elif tag:
            payload.append(str(tag))
    return sorted(set(payload))


def _market_view(event: dict[str, Any], market: dict[str, Any], source_status: str, source_note: str) -> PolymarketMarketView:
    tags = _tag_labels(event)
    related_assets = _infer_assets(event.get("title"), market.get("question"), market.get("description"), " ".join(tags))
    category = _infer_category(event.get("title"), market.get("question"), market.get("description"), " ".join(tags))
    return PolymarketMarketView(
        market_id=str(market.get("id") or ""),
        event_id=str(event.get("id") or ""),
        event_title=str(event.get("title") or ""),
        question=str(market.get("question") or event.get("title") or ""),
        slug=str(market.get("slug") or event.get("slug") or ""),
        status=_status_label(bool(market.get("active")), bool(market.get("closed")), bool(market.get("archived"))),
        active=bool(market.get("active")),
        closed=bool(market.get("closed")),
        end_date=_parse_datetime(market.get("endDate") or event.get("endDate")),
        volume=_parse_float(market.get("volumeNum") or market.get("volume")),
        liquidity=_parse_float(market.get("liquidityNum") or market.get("liquidity") or event.get("liquidityClob") or event.get("liquidity")),
        recent_activity=_parse_float(market.get("volume24hr") or market.get("volume24hrClob") or event.get("volume24hr")),
        open_interest=_parse_float(event.get("openInterest")),
        primary_tag=tags[0] if tags else "",
        tags=tags,
        category=category,
        outcomes=_outcome_views(market),
        source_status=source_status,
        source_note=source_note,
        related_assets=related_assets,
        relevance_score=0.0,
        relevance_reason="",
        url=f"https://polymarket.com/event/{event.get('slug') or market.get('slug')}",
    )


def _event_view(event: dict[str, Any], source_status: str, source_note: str) -> PolymarketEventView:
    tags = _tag_labels(event)
    related_assets = _infer_assets(event.get("title"), event.get("description"), " ".join(tags))
    markets = [_market_view(event, market, source_status, source_note) for market in event.get("markets", []) if isinstance(market, dict)]
    category = _infer_category(event.get("title"), event.get("description"), " ".join(tags))
    return PolymarketEventView(
        event_id=str(event.get("id") or ""),
        title=str(event.get("title") or ""),
        slug=str(event.get("slug") or ""),
        status=_status_label(bool(event.get("active")), bool(event.get("closed")), bool(event.get("archived"))),
        active=bool(event.get("active")),
        closed=bool(event.get("closed")),
        end_date=_parse_datetime(event.get("endDate")),
        volume=_parse_float(event.get("volume")),
        liquidity=_parse_float(event.get("liquidityClob") or event.get("liquidity")),
        recent_activity=_parse_float(event.get("volume24hr")),
        category=category,
        primary_tag=tags[0] if tags else "",
        tags=tags,
        market_count=len(markets),
        markets=markets,
        source_status=source_status,
        source_note=source_note,
        related_assets=related_assets,
    )


def _sort_markets(rows: list[PolymarketMarketView], sort: str) -> list[PolymarketMarketView]:
    key_name = {"liquidity": "liquidity", "recent": "recent_activity", "relevance": "relevance_score"}.get(sort, "volume")
    return sorted(rows, key=lambda row: getattr(row, key_name), reverse=True)


def _rank_market_for_symbol(market: PolymarketMarketView, symbol: str, query_hint: str) -> PolymarketMarketView:
    score, reason = _market_relevance(symbol.upper(), market, query_hint)
    return market.model_copy(update={"relevance_score": score, "relevance_reason": reason})


def polymarket_hunter(query: str = "", tag: str = "", sort: str = "volume", limit: int = 30) -> PolymarketHunterView:
    raw_events, source_status, source_note = _load_events()
    events = [_event_view(event, source_status, source_note) for event in raw_events]
    normalized_query = query.strip().lower()
    normalized_tag = tag.strip().lower()

    if normalized_query:
        events = [
            event
            for event in events
            if normalized_query in event.title.lower()
            or any(normalized_query in market.question.lower() for market in event.markets)
            or any(normalized_query in item.lower() for item in event.tags)
        ]
    if normalized_tag:
        events = [event for event in events if normalized_tag in {tag_name.lower() for tag_name in event.tags}]

    markets = _sort_markets([market for event in events for market in event.markets], sort)[:limit]
    available_tags = sorted({tag_name for event in [_event_view(event, source_status, source_note) for event in raw_events] for tag_name in event.tags})
    return PolymarketHunterView(
        generated_at=naive_utc_now(),
        source_status=source_status,
        source_note=source_note,
        query=query,
        tag=tag,
        sort=sort,
        available_tags=available_tags,
        events=events[: max(1, min(limit, 12))],
        markets=markets,
    )


def polymarket_market_detail(market_id: str) -> PolymarketMarketView | None:
    hunter = polymarket_hunter(limit=80)
    return next((market for market in hunter.markets if market.market_id == market_id), None)


def related_polymarket_markets(symbol: str, *context_parts: Any, limit: int = 3) -> list[PolymarketMarketView]:
    normalized_symbol = symbol.upper()
    query_hint = " ".join(str(part or "") for part in context_parts).lower()
    ranked = [_rank_market_for_symbol(market, normalized_symbol, query_hint) for market in polymarket_hunter(limit=80).markets]
    strong_matches = [market for market in ranked if market.relevance_score >= 4.5]
    strong_matches.sort(key=lambda market: (market.relevance_score, market.recent_activity, market.volume), reverse=True)
    return strong_matches[:limit]


def crowd_implied_narrative(symbol: str, *context_parts: Any) -> str:
    markets = related_polymarket_markets(symbol, *context_parts, limit=2)
    if not markets:
        return ""
    top_market = markets[0]
    leading_outcome = max(top_market.outcomes, key=lambda item: item.probability, default=None)
    if leading_outcome is None:
        return f"Polymarket has active {symbol} narrative markets, but outcome pricing is unavailable."
    return (
        f"Crowd-implied narrative: {leading_outcome.label} at {leading_outcome.probability * 100:.0f}% "
        f"in '{top_market.question}' with volume {top_market.volume:,.0f}. {top_market.relevance_reason}"
    )
