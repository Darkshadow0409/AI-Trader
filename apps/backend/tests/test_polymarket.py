from __future__ import annotations

from app.services import polymarket


def test_polymarket_hunter_normalizes_live_payload(monkeypatch) -> None:
    polymarket._CACHE.update({"expires_at": 0.0, "events": [], "source_status": "fixture", "source_note": ""})

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

    def broken_fetch_events(limit=40, active=True, closed=False):  # noqa: ARG001
        raise RuntimeError("blocked")

    monkeypatch.setattr(polymarket, "fetch_events", broken_fetch_events)

    hunter = polymarket.polymarket_hunter()

    assert hunter.source_status == "fixture_fallback"
    assert hunter.markets
    assert hunter.events


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
