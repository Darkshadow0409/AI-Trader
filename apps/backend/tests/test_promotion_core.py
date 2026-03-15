from __future__ import annotations

from sqlmodel import Session, desc, select

from app.core.database import engine
from app.models.entities import StrategyStateTransition
from app.models.schemas import StrategyLifecycleUpdateRequest
from app.strategy_lab.registry import get_registry_entry
from app.strategy_lab.service import (
    _aggregate_forward_validation,
    _calibration_snapshots,
    _data_realism_penalties,
    _promotion_rationale,
    transition_strategy_lifecycle,
)


def test_strategy_detail_exposes_promotion_and_validation_fields(client, seeded_summary) -> None:
    response = client.get("/api/strategies/trend_breakout_v1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["lifecycle_state"] in {"experimental", "paper_validating", "promoted", "demoted"}
    assert payload["promotion_rationale"]["recommended_state"] in {"experimental", "paper_validating", "promoted", "demoted"}
    assert payload["forward_validation_summary"]["sample_size"] == 3
    assert {item["bucket_kind"] for item in payload["calibration_summary"]} == {"score", "confidence"}
    assert any(item["code"] == "fixture_only" for item in payload["data_realism_penalties"])
    assert len(payload["transition_history"]) >= 1


def test_lifecycle_transition_persists_note_and_transition_history(seeded_summary) -> None:
    with Session(engine) as session:
        updated = transition_strategy_lifecycle(
            session,
            "vol_expansion_v1",
            StrategyLifecycleUpdateRequest(to_state="paper_validating", note="Regression lifecycle update."),
        )
        transition = session.exec(
            select(StrategyStateTransition)
            .where(StrategyStateTransition.strategy_name == "vol_expansion_v1")
            .where(StrategyStateTransition.note == "Regression lifecycle update.")
            .order_by(desc(StrategyStateTransition.changed_at))
        ).first()

    assert updated.lifecycle_state == "paper_validating"
    assert updated.lifecycle_note == "Regression lifecycle update."
    assert transition is not None
    assert transition.to_state == "paper_validating"
    assert transition.note == "Regression lifecycle update."


def test_forward_validation_summary_is_deterministic(seeded_summary) -> None:
    with Session(engine) as session:
        summary = _aggregate_forward_validation(session, "trend_breakout_v1")

    assert summary.sample_size == 3
    assert summary.hit_rate == 0.67
    assert summary.expectancy_proxy == 1.0
    assert summary.drawdown == -1.12
    assert summary.target_attainment == 0.67
    assert summary.invalidation_rate == 0.0
    assert summary.time_stop_frequency == 0.33
    assert summary.modes == {"paper_trade": 2, "live_sim": 1}


def test_calibration_snapshots_group_buckets_for_seeded_strategy(seeded_summary) -> None:
    with Session(engine) as session:
        snapshots = _calibration_snapshots(session, "trend_breakout_v1")

    assert {item.bucket_kind for item in snapshots} == {"score", "confidence"}
    score_snapshot = next(item for item in snapshots if item.bucket_kind == "score")
    assert sum(bucket.sample_size for bucket in score_snapshot.buckets) == 3
    low_bucket = next(bucket for bucket in score_snapshot.buckets if bucket.bucket == "low")
    assert low_bucket.sample_size == 3
    assert low_bucket.hit_rate == 0.67
    assert low_bucket.expectancy_proxy == 1.0


def test_demotion_logic_and_realism_penalties_are_explicit(seeded_summary) -> None:
    with Session(engine) as session:
        entry = get_registry_entry(session, "event_continuation_v1")
        entry.lifecycle_state = "promoted"
        session.add(entry)
        session.commit()
        penalties = _data_realism_penalties(session, entry)
        rationale = _promotion_rationale(session, entry, robustness_score=51.6, walk_forward_quality=0.33)

    codes = {item.code for item in penalties}
    assert {"fixture_only", "proxy_grade", "weak_oil_metals_realism"}.issubset(codes)
    assert rationale.recommended_state == "demoted"
    assert rationale.gate_results["forward_results"] is False
