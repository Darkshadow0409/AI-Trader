from __future__ import annotations

from app.services import polymarket


def test_polymarket_hunter_normalizes_live_payload(monkeypatch) -> None:
    polymarket._CACHE.update({"expires_at": 0.0, "events": [], "source_status": "fixture", "source_note": ""})
    monkeypatch.setattr(polymarket.settings, "use_sample_only", False)

    monkeypatch.setattr(
        polymarket,
        "fetch_events",
        lambda limit=40, active=True, closed=False: [
            {
                "id": "evt1",
                "title": "Bitcoin above $95k by March 31?",
                "slug": "bitcoin-above-95k",
                "endDate": "2026-03-31T23:59:00Z",
                "active": True,
                "closed": False,
                "liquidity": "1000",
                "liquidityClob": 1000,
                "volume": "5000",
                "volume24hr": 1200,
                "openInterest": "800",
                "tags": [{"label": "Crypto"}, {"label": "Finance"}],
                "markets": [
                    {
                        "id": "mkt1",
                        "question": "Will Bitcoin trade above $95,000 on March 31, 2026?",
                        "slug": "btc-above-95k",
                        "endDate": "2026-03-31T23:59:00Z",
                        "active": True,
                        "closed": False,
                        "volume": "5000",
                        "volumeNum": 5000,
                        "volume24hr": 1200,
                        "liquidity": "1000",
                        "liquidityNum": 1000,
                        "outcomes": "[\"Yes\", \"No\"]",
                        "outcomePrices": "[\"0.61\", \"0.39\"]",
                    }
                ],
            }
        ],
    )

    hunter = polymarket.polymarket_hunter(tag="Crypto")

    assert hunter.source_status == "live"
    assert hunter.available_tags == ["Crypto", "Finance"]
    assert len(hunter.markets) == 1
    assert hunter.markets[0].outcomes[0].label == "Yes"
    assert "BTC" in hunter.markets[0].related_assets


def test_polymarket_hunter_falls_back_to_fixture_when_live_unavailable(monkeypatch) -> None:
    polymarket._CACHE.update({"expires_at": 0.0, "events": [], "source_status": "fixture", "source_note": ""})
    monkeypatch.setattr(polymarket.settings, "use_sample_only", False)

    def broken_fetch_events(limit=40, active=True, closed=False):  # noqa: ARG001
        raise RuntimeError("blocked")

    monkeypatch.setattr(polymarket, "fetch_events", broken_fetch_events)

    hunter = polymarket.polymarket_hunter()

    assert hunter.source_status == "fixture_fallback"
    assert hunter.markets
    assert hunter.events


def test_polymarket_hunter_stays_fixture_only_in_sample_mode(monkeypatch) -> None:
    polymarket._CACHE.update({"expires_at": 0.0, "events": [], "source_status": "fixture", "source_note": ""})

    def unexpected_fetch_events(limit=40, active=True, closed=False):  # noqa: ARG001
        raise AssertionError("sample mode should not call live polymarket")

    monkeypatch.setattr(polymarket, "fetch_events", unexpected_fetch_events)

    hunter = polymarket.polymarket_hunter()

    assert hunter.source_status == "fixture"
    assert hunter.source_note == "Sample mode uses seeded Polymarket fixture data."
    assert hunter.markets


def test_related_polymarket_markets_prefers_commodity_macro_matches(monkeypatch) -> None:
    polymarket._CACHE.update({"expires_at": 0.0, "events": [], "source_status": "fixture", "source_note": ""})

    monkeypatch.setattr(
        polymarket,
        "polymarket_hunter",
        lambda limit=80: polymarket.PolymarketHunterView(
            generated_at=polymarket.naive_utc_now(),
            source_status="fixture",
            source_note="fixture",
            query="",
            tag="",
            sort="volume",
            available_tags=["Commodities", "Crypto", "Macro"],
            events=[],
            markets=[
                polymarket.PolymarketMarketView(
                    market_id="oil",
                    event_id="evt_oil",
                    event_title="WTI above $85 after EIA?",
                    question="Will WTI crude settle above $85 after the next EIA inventory report?",
                    slug="oil",
                    status="active",
                    active=True,
                    closed=False,
                    end_date=polymarket._parse_datetime("2026-04-02T00:00:00Z"),
                    volume=240000,
                    liquidity=90000,
                    recent_activity=80000,
                    primary_tag="Energy",
                    tags=["Commodities", "Macro", "Energy"],
                    category="commodities",
                    outcomes=[],
                    source_status="fixture",
                    source_note="fixture",
                    related_assets=["WTI"],
                    url="https://example.com/oil",
                ),
                polymarket.PolymarketMarketView(
                    market_id="inflation",
                    event_id="evt_macro",
                    event_title="CPI above 3% by June?",
                    question="Will CPI stay above 3% by June 2026?",
                    slug="inflation",
                    status="active",
                    active=True,
                    closed=False,
                    end_date=polymarket._parse_datetime("2026-04-10T00:00:00Z"),
                    volume=120000,
                    liquidity=50000,
                    recent_activity=45000,
                    primary_tag="Macro",
                    tags=["Macro", "Rates/Inflation"],
                    category="rates_inflation",
                    outcomes=[],
                    source_status="fixture",
                    source_note="fixture",
                    related_assets=[],
                    url="https://example.com/inflation",
                ),
                polymarket.PolymarketMarketView(
                    market_id="btc",
                    event_id="evt_btc",
                    event_title="Bitcoin above $95k?",
                    question="Will Bitcoin trade above $95,000 this month?",
                    slug="btc",
                    status="active",
                    active=True,
                    closed=False,
                    end_date=polymarket._parse_datetime("2026-05-01T00:00:00Z"),
                    volume=900000,
                    liquidity=200000,
                    recent_activity=150000,
                    primary_tag="Crypto",
                    tags=["Crypto"],
                    category="crypto",
                    outcomes=[],
                    source_status="fixture",
                    source_note="fixture",
                    related_assets=["BTC"],
                    url="https://example.com/btc",
                ),
            ],
        ),
    )

    markets = polymarket.related_polymarket_markets("WTI", "oil inflation recession geopolitics", limit=3)

    assert [market.market_id for market in markets] == ["oil", "inflation"]
    assert markets[0].relevance_score > markets[1].relevance_score
    assert "Direct wti linkage" in markets[0].relevance_reason


def test_related_polymarket_markets_suppresses_weak_matches(monkeypatch) -> None:
    monkeypatch.setattr(
        polymarket,
        "polymarket_hunter",
        lambda limit=80: polymarket.PolymarketHunterView(
            generated_at=polymarket.naive_utc_now(),
            source_status="fixture",
            source_note="fixture",
            query="",
            tag="",
            sort="volume",
            available_tags=["Politics"],
            events=[],
            markets=[
                polymarket.PolymarketMarketView(
                    market_id="politics",
                    event_id="evt_politics",
                    event_title="Election market",
                    question="Will candidate X win the election?",
                    slug="politics",
                    status="active",
                    active=True,
                    closed=False,
                    end_date=polymarket._parse_datetime("2026-11-01T00:00:00Z"),
                    volume=300000,
                    liquidity=100000,
                    recent_activity=20000,
                    primary_tag="Politics",
                    tags=["Politics"],
                    category="politics",
                    outcomes=[],
                    source_status="fixture",
                    source_note="fixture",
                    related_assets=[],
                    url="https://example.com/politics",
                )
            ],
        ),
    )

    assert polymarket.related_polymarket_markets("SILVER", "industrial metals", limit=3) == []


def test_polymarket_hunter_defaults_to_active_unresolved_trader_relevant_markets(monkeypatch) -> None:
    monkeypatch.setattr(
        polymarket,
        "_load_events",
        lambda: (
            [
                {
                    "id": "evt_btc",
                    "title": "Bitcoin above $95k by March 31?",
                    "slug": "btc-above-95k",
                    "endDate": "2026-03-31T23:59:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "1000",
                    "liquidityClob": 120000,
                    "volume": "5000",
                    "volume24hr": 42000,
                    "tags": [{"label": "Crypto"}],
                    "markets": [
                        {
                            "id": "btc",
                            "question": "Will Bitcoin trade above $95,000 on March 31, 2026?",
                            "slug": "btc",
                            "endDate": "2026-03-31T23:59:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "150000",
                            "volumeNum": 150000,
                            "volume24hr": 42000,
                            "liquidity": "120000",
                            "liquidityNum": 120000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.61\", \"0.39\"]",
                        }
                    ],
                },
                {
                    "id": "evt_worldcup",
                    "title": "Will Kim Kardashian win the 2028 Democratic presidential nomination?",
                    "slug": "kim-2028",
                    "endDate": "2028-11-01T00:00:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "50000",
                    "liquidityClob": 50000,
                    "volume": "300000",
                    "volume24hr": 10000,
                    "tags": [{"label": "Politics"}],
                    "markets": [
                        {
                            "id": "politics",
                            "question": "Will Kim Kardashian win the 2028 Democratic presidential nomination?",
                            "slug": "politics",
                            "endDate": "2028-11-01T00:00:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "300000",
                            "volumeNum": 300000,
                            "volume24hr": 10000,
                            "liquidity": "50000",
                            "liquidityNum": 50000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.15\", \"0.85\"]",
                        }
                    ],
                },
                {
                    "id": "evt_resolved",
                    "title": "MicroStrategy sells any Bitcoin in 2025?",
                    "slug": "mstr-2025",
                    "endDate": "2025-12-31T23:59:00Z",
                    "active": False,
                    "closed": True,
                    "liquidity": "90000",
                    "liquidityClob": 90000,
                    "volume": "400000",
                    "volume24hr": 0,
                    "tags": [{"label": "Crypto"}],
                    "markets": [
                        {
                            "id": "resolved",
                            "question": "Will MicroStrategy sell any Bitcoin in 2025?",
                            "slug": "resolved",
                            "endDate": "2025-12-31T23:59:00Z",
                            "active": False,
                            "closed": True,
                            "volume": "400000",
                            "volumeNum": 400000,
                            "volume24hr": 0,
                            "liquidity": "90000",
                            "liquidityNum": 90000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.0\", \"1.0\"]",
                        }
                    ],
                },
            ],
            "fixture",
            "fixture",
        ),
    )

    hunter = polymarket.polymarket_hunter()

    assert [market.market_id for market in hunter.markets] == ["btc"]
    assert hunter.events[0].event_id == "evt_btc"


def test_polymarket_hunter_falls_back_to_unresolved_non_political_discovery(monkeypatch) -> None:
    monkeypatch.setattr(
        polymarket,
        "_load_events",
        lambda: (
            [
                {
                    "id": "evt_fallback",
                    "title": "Will dry-bulk shipping rates keep rising this quarter?",
                    "slug": "shipping-rates",
                    "endDate": "2026-05-30T00:00:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "9000",
                    "liquidityClob": 9000,
                    "volume": "24000",
                    "volume24hr": 4200,
                    "tags": [{"label": "Shipping"}],
                    "markets": [
                        {
                            "id": "shipping",
                            "question": "Will dry-bulk shipping rates keep rising through Q2 2026?",
                            "slug": "shipping",
                            "endDate": "2026-05-30T00:00:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "24000",
                            "volumeNum": 24000,
                            "volume24hr": 4200,
                            "liquidity": "9000",
                            "liquidityNum": 9000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.58\", \"0.42\"]",
                        }
                    ],
                }
            ],
            "live",
            "live",
        ),
    )

    hunter = polymarket.polymarket_hunter()

    assert [market.market_id for market in hunter.markets] == ["shipping"]
    assert hunter.markets[0].status == "active"
    assert hunter.markets[0].closed is False


def test_polymarket_hunter_prefers_commodity_and_macro_discovery_over_crypto_when_available(monkeypatch) -> None:
    monkeypatch.setattr(
        polymarket,
        "_load_events",
        lambda: (
            [
                {
                    "id": "evt_oil",
                    "title": "Will WTI crude settle above $85 after the next EIA report?",
                    "slug": "wti-eia",
                    "endDate": "2026-04-02T00:00:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "60000",
                    "liquidityClob": 60000,
                    "volume": "180000",
                    "volume24hr": 42000,
                    "tags": [{"label": "Commodities"}, {"label": "Macro"}],
                    "markets": [
                        {
                            "id": "oil",
                            "question": "Will WTI crude settle above $85 after the next EIA inventory report?",
                            "slug": "oil",
                            "endDate": "2026-04-02T00:00:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "180000",
                            "volumeNum": 180000,
                            "volume24hr": 42000,
                            "liquidity": "60000",
                            "liquidityNum": 60000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.57\", \"0.43\"]",
                        }
                    ],
                },
                {
                    "id": "evt_gold",
                    "title": "Will gold hold above $3,000 through the next CPI print?",
                    "slug": "gold-cpi",
                    "endDate": "2026-04-10T00:00:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "45000",
                    "liquidityClob": 45000,
                    "volume": "125000",
                    "volume24hr": 28000,
                    "tags": [{"label": "Commodities"}, {"label": "Rates/Inflation"}],
                    "markets": [
                        {
                            "id": "gold",
                            "question": "Will gold hold above $3,000 through the next CPI print?",
                            "slug": "gold",
                            "endDate": "2026-04-10T00:00:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "125000",
                            "volumeNum": 125000,
                            "volume24hr": 28000,
                            "liquidity": "45000",
                            "liquidityNum": 45000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.55\", \"0.45\"]",
                        }
                    ],
                },
                {
                    "id": "evt_btc",
                    "title": "Bitcoin above $110k by quarter end?",
                    "slug": "btc-110k",
                    "endDate": "2026-05-01T00:00:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "220000",
                    "liquidityClob": 220000,
                    "volume": "900000",
                    "volume24hr": 180000,
                    "tags": [{"label": "Crypto"}],
                    "markets": [
                        {
                            "id": "btc",
                            "question": "Will Bitcoin trade above $110,000 by quarter end?",
                            "slug": "btc",
                            "endDate": "2026-05-01T00:00:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "900000",
                            "volumeNum": 900000,
                            "volume24hr": 180000,
                            "liquidity": "220000",
                            "liquidityNum": 220000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.63\", \"0.37\"]",
                        }
                    ],
                },
            ],
            "live",
            "live",
        ),
    )

    hunter = polymarket.polymarket_hunter()

    assert hunter.sort == "relevance"
    assert [market.market_id for market in hunter.markets[:2]] == ["oil", "gold"]
    assert "btc" not in [market.market_id for market in hunter.markets[:2]]


def test_infer_assets_avoids_substring_false_positives() -> None:
    assert polymarket._infer_assets("Will the Golden State Warriors win the title?") == []
    assert polymarket._infer_assets("Will the Edmonton Oilers win the Stanley Cup?") == []


def test_polymarket_hunter_excludes_uncategorized_sports_noise_from_default_discovery(monkeypatch) -> None:
    monkeypatch.setattr(
        polymarket,
        "_load_events",
        lambda: (
            [
                {
                    "id": "evt_oil",
                    "title": "Will WTI crude settle above $85 after the next EIA report?",
                    "slug": "wti-eia",
                    "endDate": "2026-04-02T00:00:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "60000",
                    "liquidityClob": 60000,
                    "volume": "180000",
                    "volume24hr": 42000,
                    "tags": [{"label": "Commodities"}, {"label": "Macro"}],
                    "markets": [
                        {
                            "id": "oil",
                            "question": "Will WTI crude settle above $85 after the next EIA inventory report?",
                            "slug": "oil",
                            "endDate": "2026-04-02T00:00:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "180000",
                            "volumeNum": 180000,
                            "volume24hr": 42000,
                            "liquidity": "60000",
                            "liquidityNum": 60000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.57\", \"0.43\"]",
                        }
                    ],
                },
                {
                    "id": "evt_sports",
                    "title": "Will the Golden State Warriors win the 2026 NBA Finals?",
                    "slug": "warriors-finals",
                    "endDate": "2026-06-20T00:00:00Z",
                    "active": True,
                    "closed": False,
                    "liquidity": "80000",
                    "liquidityClob": 80000,
                    "volume": "900000",
                    "volume24hr": 120000,
                    "tags": [{"label": "Sports"}],
                    "markets": [
                        {
                            "id": "sports",
                            "question": "Will the Golden State Warriors win the 2026 NBA Finals?",
                            "slug": "sports",
                            "endDate": "2026-06-20T00:00:00Z",
                            "active": True,
                            "closed": False,
                            "volume": "900000",
                            "volumeNum": 900000,
                            "volume24hr": 120000,
                            "liquidity": "80000",
                            "liquidityNum": 80000,
                            "outcomes": "[\"Yes\", \"No\"]",
                            "outcomePrices": "[\"0.52\", \"0.48\"]",
                        }
                    ],
                },
            ],
            "live",
            "live",
        ),
    )

    hunter = polymarket.polymarket_hunter()

    assert [market.market_id for market in hunter.markets] == ["oil"]


def test_related_polymarket_markets_ignore_closed_or_resolved_context(monkeypatch) -> None:
    monkeypatch.setattr(
        polymarket,
        "polymarket_hunter",
        lambda limit=80: polymarket.PolymarketHunterView(
            generated_at=polymarket.naive_utc_now(),
            source_status="fixture",
            source_note="fixture",
            query="",
            tag="",
            sort="volume",
            available_tags=["Crypto"],
            events=[],
            markets=[
                polymarket.PolymarketMarketView(
                    market_id="resolved",
                    event_id="evt_old",
                    event_title="Old Bitcoin event",
                    question="Will Bitcoin trade above $60,000 in 2025?",
                    slug="resolved",
                    status="closed",
                    active=False,
                    closed=True,
                    end_date=polymarket._parse_datetime("2025-12-31T00:00:00Z"),
                    volume=900000,
                    liquidity=150000,
                    recent_activity=0,
                    primary_tag="Crypto",
                    tags=["Crypto"],
                    category="crypto",
                    outcomes=[],
                    source_status="fixture",
                    source_note="fixture",
                    related_assets=["BTC"],
                    url="https://example.com/resolved",
                ),
            ],
        ),
    )

    assert polymarket.related_polymarket_markets("BTC", "bitcoin risk-on", limit=3) == []


def test_eth_relevance_reason_does_not_leak_btc_wording(monkeypatch) -> None:
    monkeypatch.setattr(
        polymarket,
        "polymarket_hunter",
        lambda limit=80: polymarket.PolymarketHunterView(
            generated_at=polymarket.naive_utc_now(),
            source_status="fixture",
            source_note="fixture",
            query="",
            tag="",
            sort="volume",
            available_tags=["Crypto"],
            events=[],
            markets=[
                polymarket.PolymarketMarketView(
                    market_id="eth",
                    event_id="evt_eth",
                    event_title="Ethereum above $4k?",
                    question="Will Ethereum trade above $4,000 this month?",
                    slug="eth",
                    status="active",
                    active=True,
                    closed=False,
                    end_date=polymarket._parse_datetime("2026-05-01T00:00:00Z"),
                    volume=450000,
                    liquidity=120000,
                    recent_activity=70000,
                    primary_tag="Crypto",
                    tags=["Crypto"],
                    category="crypto",
                    outcomes=[],
                    source_status="fixture",
                    source_note="fixture",
                    related_assets=["ETH"],
                    url="https://example.com/eth",
                ),
                polymarket.PolymarketMarketView(
                    market_id="btc",
                    event_id="evt_btc",
                    event_title="Bitcoin above $95k?",
                    question="Will Bitcoin trade above $95,000 this month?",
                    slug="btc",
                    status="active",
                    active=True,
                    closed=False,
                    end_date=polymarket._parse_datetime("2026-05-01T00:00:00Z"),
                    volume=900000,
                    liquidity=200000,
                    recent_activity=150000,
                    primary_tag="Crypto",
                    tags=["Crypto"],
                    category="crypto",
                    outcomes=[],
                    source_status="fixture",
                    source_note="fixture",
                    related_assets=["BTC"],
                    url="https://example.com/btc",
                ),
            ],
        ),
    )

    markets = polymarket.related_polymarket_markets("ETH", "ethereum staking risk-on", limit=3)

    assert markets
    assert markets[0].market_id == "eth"
    assert "btc" not in markets[0].relevance_reason.lower()
