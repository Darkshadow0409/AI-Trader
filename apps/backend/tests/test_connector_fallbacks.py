from __future__ import annotations

from pathlib import Path

import pytest

from app.connectors.eia_client import EIAClient
from app.connectors.fred_client import FredClient
from app.services.pipeline import _collect_market_data


FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def test_default_collection_stays_fixture_only(monkeypatch: pytest.MonkeyPatch) -> None:
    def unexpected_call(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("live connector should not be called in default sample mode")

    monkeypatch.setattr("app.connectors.binance_market_data.BinanceMarketData.fetch_daily_bars", unexpected_call)
    monkeypatch.setattr("app.connectors.coinbase_market_data.CoinbaseMarketData.fetch_daily_bars", unexpected_call)

    bars, source_mode = _collect_market_data(force_live=False)

    assert source_mode == "sample"
    assert len(bars) == 1080


def test_live_collection_falls_back_gracefully_when_connectors_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    def connector_failure(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("offline")

    monkeypatch.setattr("app.connectors.binance_market_data.BinanceMarketData.fetch_daily_bars", connector_failure)
    monkeypatch.setattr("app.connectors.coinbase_market_data.CoinbaseMarketData.fetch_daily_bars", connector_failure)

    bars, source_mode = _collect_market_data(force_live=True)

    assert source_mode == "sample"
    assert len(bars) == 1080
    assert {row["symbol"] for row in bars} == {"BTC", "ETH", "WTI", "GOLD", "DXY", "US10Y"}


def test_eia_client_uses_fixture_news_when_rss_fetch_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.connectors.rss_news_client.RSSNewsClient.fetch", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))

    rows = EIAClient(FIXTURES_DIR).fetch_news()

    assert rows
    assert rows[0]["source"] == "EIA"


def test_fred_series_tail_skips_network_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    def unexpected_http(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("httpx.get should not be called without an API key")

    monkeypatch.setattr("httpx.get", unexpected_http)

    rows = FredClient(FIXTURES_DIR, api_key=None).fetch_series_tail("CPIAUCSL")

    assert rows == []
