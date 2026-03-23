from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from sqlmodel import Session

from app.core.database import engine
from app.services import dashboard_data, operator_desk
from app.services.ui_summaries import home_operator_summary


def _load_home_summary() -> tuple[int, dict]:
    with Session(engine) as session:
        payload = home_operator_summary(session)
        return 200, payload.model_dump(mode="json")


def test_home_summary_stays_available_under_repeated_parallel_loads(seeded_summary) -> None:
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: _load_home_summary(), range(8)))

    for status_code, payload in results:
        assert status_code == 200
        assert "session_state" in payload


def test_desk_summary_returns_partial_payload_when_optional_sections_degrade(client, seeded_summary, monkeypatch) -> None:
    monkeypatch.setattr(operator_desk, "DESK_RESPONSE_BUDGET_SECONDS", 0.0)

    response = client.get("/api/dashboard/desk")

    assert response.status_code == 200
    payload = response.json()
    assert payload["execution_gate"]["status"]
    assert payload["section_readiness"]["adapter_health"] == "degraded"
    assert payload["section_readiness"]["audit_log_tail"] == "degraded"
    assert payload["section_notes"]["adapter_health"]
    assert payload["section_notes"]["audit_log_tail"]


def test_desk_summary_survives_focus_queue_failure_with_core_sections_intact(seeded_summary, monkeypatch) -> None:
    def _fail(_session):
        raise RuntimeError("boom")

    monkeypatch.setattr(operator_desk, "list_opportunities", _fail)

    with Session(engine) as session:
        payload = operator_desk.desk_summary(session)

    assert payload.execution_gate.status
    assert payload.review_tasks
    assert payload.section_readiness["focus_opportunities"] == "degraded"
    assert payload.section_readiness["degraded_sources"] == "degraded"
    assert payload.focus_opportunities == []
    assert payload.degraded_sources == []


def test_desk_summary_degrades_when_execution_gate_snapshot_is_missing(seeded_summary, monkeypatch) -> None:
    monkeypatch.setattr(operator_desk, "execution_gate_snapshot", lambda _session: None)

    with Session(engine) as session:
        payload = operator_desk.desk_summary(session)

    assert payload.execution_gate.status == "not_ready"
    assert payload.section_readiness["execution_gate"] == "degraded"
    assert payload.section_notes["execution_gate"]


def test_dashboard_ribbon_survives_feature_enrichment_failure(seeded_summary, monkeypatch) -> None:
    def _fail(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(dashboard_data, "build_feature_frame", _fail)

    with Session(engine) as session:
        payload = dashboard_data.dashboard_ribbon(session)

    assert payload.data_mode_label
    assert payload.feed_source_label
    assert payload.freshness_status in {"fresh", "aging", "stale", "degraded", "unusable"}
