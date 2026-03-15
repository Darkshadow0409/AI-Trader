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
    assert btc.tradable_symbol == "BTCUSD"
    assert btc.source_type == "fixture"
    assert btc.realism_grade == "B"
    assert wti.underlying_asset == "WTI"
    assert wti.tradable_symbol == "USO"
    assert wti.source_type == "proxy"
    assert "proxy-grade" in wti.proxy_mapping_notes


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
    assert reality.realism_score == 52.0
    assert reality.ranking_penalty == 32.0
    assert reality.promotion_blocked is False
    assert reality.alert_allowed is True
    assert {item.code for item in reality.penalties} == {"fixture_only", "fixture_source"}


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
    assert {"proxy_grade_mapping", "tradable_mismatch", "weak_oil_realism"}.issubset(oil_codes)
    assert any(item.severity == "critical" and item.code == "weak_oil_realism" for item in oil.penalties)
    assert oil.ranking_penalty > crypto.ranking_penalty
    assert oil.realism_score < crypto.realism_score
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
