from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from app.core.clock import naive_utc_now
from app.core.database import engine
from app.models.entities import Asset
from app.services.data_reality import build_data_reality, default_provenance, freshness_state


def test_seeded_assets_have_explicit_provenance_fields(seeded_summary) -> None:
    with Session(engine) as session:
        btc = session.exec(select(Asset).where(Asset.symbol == "BTC")).one()
        wti = session.exec(select(Asset).where(Asset.symbol == "WTI")).one()

    assert btc.underlying_asset == "BTC"
    assert btc.research_symbol == "BTCUSD"
    assert btc.tradable_symbol == "BTCUSD"
    assert btc.intended_venue == "binance_spot"
    assert btc.intended_instrument == "spot_pair"
    assert btc.source_type == "fixture"
    assert btc.source_timing == "fixture"
    assert btc.realism_grade == "B"
    assert wti.underlying_asset == "WTI"
    assert wti.research_symbol == "WTI_CTX"
    assert wti.tradable_symbol == "USOUSD"
    assert wti.intended_venue == "pu_prime_mt5"
    assert wti.intended_instrument == "spot_cfd_proxy"
    assert wti.source_type == "proxy"
    assert wti.source_timing == "end_of_day"
    assert "contextual proxy bars" in wti.proxy_mapping_notes


def test_freshness_policy_transitions_are_deterministic() -> None:
    assert freshness_state(120, 240) == "fresh"
    assert freshness_state(300, 240) == "aging"
    assert freshness_state(700, 240) == "stale"
    assert freshness_state(1200, 240) == "degraded"
    assert freshness_state(2200, 240) == "unusable"


def test_realism_score_penalizes_fixture_and_missing_confirmation() -> None:
    reality = build_data_reality(
        default_provenance("BTC", source_mode="sample"),
        as_of=naive_utc_now() - timedelta(minutes=5),
        data_quality="fixture",
        source_mode="sample",
        features={"cross_asset_positive": ["ETH"]},
    )

    assert reality.provenance.realism_grade == "B"
    assert reality.freshness_state == "fresh"
    assert reality.provenance.source_timing == "fixture"
    assert reality.realism_score == 48.0
    assert reality.ranking_penalty == 38.0
    assert reality.promotion_blocked is False
    assert reality.alert_allowed is True
    assert reality.execution_suitability == "research_only"
    assert reality.news_suitability == "research_only"
    assert {item.code for item in reality.penalties} == {"fixture_only", "fixture_source", "timing_fixture"}


def test_proxy_mapping_and_oil_realism_penalties_are_stronger_than_crypto() -> None:
    crypto = build_data_reality(
        default_provenance("BTC", source_mode="sample"),
        as_of=naive_utc_now() - timedelta(minutes=5),
        data_quality="fixture",
        source_mode="sample",
        features={"cross_asset_positive": ["ETH"]},
    )
    oil = build_data_reality(
        default_provenance("WTI", source_mode="sample"),
        as_of=naive_utc_now() - timedelta(minutes=10),
        data_quality="fixture",
        source_mode="sample",
        features={"cross_asset_positive": []},
        tradable_symbol="USO",
    )

    oil_codes = {item.code for item in oil.penalties}
    assert {"proxy_grade_mapping", "tradable_mismatch", "weak_oil_realism", "timing_end_of_day", "contextual_price_only", "timing_too_weak_for_intraday"}.issubset(oil_codes)
    assert any(item.severity == "critical" and item.code == "weak_oil_realism" for item in oil.penalties)
    assert oil.ranking_penalty > crypto.ranking_penalty
    assert oil.realism_score < crypto.realism_score
    assert oil.execution_suitability == "context_only"
    assert oil.alert_allowed is False
    assert oil.promotion_blocked is True


def test_stale_policy_blocks_promotion_and_alerting() -> None:
    stale = build_data_reality(
        default_provenance("ETH", source_mode="sample"),
        as_of=naive_utc_now() - timedelta(minutes=12_000),
        data_quality="fixture",
        source_mode="sample",
        features={"cross_asset_positive": []},
    )

    assert stale.freshness_state == "unusable"
    assert stale.alert_allowed is False
    assert stale.promotion_blocked is True
    assert any(item.code == "freshness_unusable" for item in stale.penalties)


def test_delayed_and_near_live_timing_semantics_are_explicit() -> None:
    delayed = build_data_reality(
        default_provenance("US10Y", source_mode="sample"),
        as_of=naive_utc_now() - timedelta(minutes=30),
        data_quality="fixture",
        source_mode="sample",
        features={"cross_asset_positive": ["DXY"]},
    )
    near_live = build_data_reality(
        default_provenance("BTC", source_mode="live").model_copy(update={"source_timing": "near_live", "source_type": "live"}),
        as_of=naive_utc_now() - timedelta(minutes=2),
        data_quality="live",
        source_mode="live",
        features={"cross_asset_positive": ["ETH"]},
    )

    assert delayed.provenance.source_timing == "delayed"
    assert delayed.execution_suitability == "swing_only"
    assert delayed.news_suitability == "context_only"
    assert near_live.provenance.source_timing == "near_live"
    assert near_live.execution_suitability == "monitor_only"
    assert near_live.alert_allowed is True


def test_recent_oil_event_context_is_news_suitable_but_not_intraday_suitable() -> None:
    reality = build_data_reality(
        default_provenance("WTI", source_mode="sample"),
        as_of=naive_utc_now() - timedelta(minutes=15),
        data_quality="fixture",
        source_mode="sample",
        features={"cross_asset_positive": []},
        tradable_symbol="USO",
        event_recency_minutes=80,
        event_context_note="EIA schedule awareness: latest release window is recent.",
    )

    assert reality.news_suitability == "news_context_only"
    assert reality.execution_suitability == "context_only"
    assert reality.event_recency_minutes == 80
    assert "EIA schedule awareness" in reality.event_context_note
    assert any(item.code == "oil_release_window_proxy" for item in reality.penalties)
