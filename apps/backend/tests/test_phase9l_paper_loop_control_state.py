from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.database import engine, init_db
from app.main import app
from app.models.entities import (
    PaperLedgerTransactionRecord,
    PaperLoopControlEventRecord,
    PaperLoopControlStateRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SimulatedOrderRecord,
)
from app.services.paper_wallet import _ensure_paper_wallet_tables


@pytest.fixture(autouse=True)
def isolated_paper_loop_state() -> None:
    init_db()
    _ensure_paper_wallet_tables()
    with Session(engine) as session:
        for model in (
            PaperLoopControlEventRecord,
            PaperLoopControlStateRecord,
            PaperRiskDecisionRecord,
            PaperRiskPolicyRecord,
            SimulatedOrderRecord,
            PaperLedgerTransactionRecord,
            PaperWalletRecord,
        ):
            session.exec(delete(model))
        session.commit()


def _paper_counts() -> dict[str, int]:
    with Session(engine) as session:
        return {
            "orders": len(session.exec(select(SimulatedOrderRecord)).all()),
            "ledger": len(session.exec(select(PaperLedgerTransactionRecord)).all()),
            "risk_decisions": len(session.exec(select(PaperRiskDecisionRecord)).all()),
            "proposals": 0,
        }


def _control_counts() -> dict[str, int]:
    with Session(engine) as session:
        return {
            "states": len(session.exec(select(PaperLoopControlStateRecord)).all()),
            "events": len(session.exec(select(PaperLoopControlEventRecord)).all()),
        }


def test_paper_loop_status_defaults_disabled_without_trading_mutation() -> None:
    client = TestClient(app)
    before = _paper_counts()

    response = client.get("/api/portfolio/paper-loop/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["control_id"] == "paper_loop_default"
    assert payload["status"] == "disabled"
    assert payload["paper_only"] is True
    assert payload["run_once_allowed"] is False
    assert payload["scheduler_allowed"] is False
    assert payload["phase_note"] == "Phase 9L controls do not run strategies or create orders."
    assert payload["recent_events"] == []
    assert _paper_counts() == before
    assert _control_counts() == {"states": 0, "events": 0}


def test_enable_disable_pause_resume_kill_validation_and_events() -> None:
    client = TestClient(app)
    before = _paper_counts()

    missing_enable = client.post("/api/portfolio/paper-loop/enable", json={})
    assert missing_enable.status_code == 400
    assert "confirmation" in missing_enable.json()["detail"].lower()

    enabled = client.post(
        "/api/portfolio/paper-loop/enable",
        json={"confirm_paper_loop_control": True, "actor_label": "local_operator"},
    )
    assert enabled.status_code == 200
    assert enabled.json()["status"] == "enabled"
    assert enabled.json()["run_once_allowed"] is False
    assert enabled.json()["scheduler_allowed"] is False

    missing_pause = client.post("/api/portfolio/paper-loop/pause", json={})
    assert missing_pause.status_code == 400
    assert "pause reason" in missing_pause.json()["detail"].lower()

    paused = client.post(
        "/api/portfolio/paper-loop/pause",
        json={"reason": "Operator review before any future loop work."},
    )
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"
    assert paused.json()["pause_reason"] == "Operator review before any future loop work."

    resumed = client.post("/api/portfolio/paper-loop/resume", json={"reason": "Resume metadata only."})
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "enabled"

    missing_disable = client.post("/api/portfolio/paper-loop/disable", json={})
    assert missing_disable.status_code == 400
    assert "confirmation" in missing_disable.json()["detail"].lower()

    disabled = client.post(
        "/api/portfolio/paper-loop/disable",
        json={"confirm_paper_loop_control": True, "reason": "Keep disabled by operator choice."},
    )
    assert disabled.status_code == 200
    assert disabled.json()["status"] == "disabled"

    missing_kill = client.post("/api/portfolio/paper-loop/kill", json={"confirm_paper_loop_control": True})
    assert missing_kill.status_code == 400
    assert "kill reason" in missing_kill.json()["detail"].lower()

    killed = client.post(
        "/api/portfolio/paper-loop/kill",
        json={"confirm_paper_loop_control": True, "reason": "Stop all future control transitions for review."},
    )
    assert killed.status_code == 200
    assert killed.json()["status"] == "killed"
    assert killed.json()["kill_reason"] == "Stop all future control transitions for review."

    resume_killed = client.post("/api/portfolio/paper-loop/resume", json={"reason": "Should fail."})
    assert resume_killed.status_code == 400
    assert "cannot resume" in resume_killed.json()["detail"].lower()

    events = client.get("/api/portfolio/paper-loop/events")
    assert events.status_code == 200
    actions = [event["action"] for event in events.json()]
    assert actions[:5] == ["kill", "disable", "resume", "pause", "enable"]
    assert all(event["paper_only"] is True for event in events.json())
    assert _paper_counts() == before
    assert _control_counts() == {"states": 1, "events": 5}


def test_paper_loop_control_actions_do_not_create_trading_records() -> None:
    client = TestClient(app)
    before = _paper_counts()

    for path, payload in (
        ("/api/portfolio/paper-loop/enable", {"confirm_paper_loop_control": True}),
        ("/api/portfolio/paper-loop/pause", {"reason": "Pause for review."}),
        ("/api/portfolio/paper-loop/resume", {"reason": "Resume metadata only."}),
        ("/api/portfolio/paper-loop/kill", {"confirm_paper_loop_control": True, "reason": "Kill for review."}),
    ):
        response = client.post(path, json=payload)
        assert response.status_code == 200
        assert response.json()["paper_only"] is True
        assert response.json()["run_once_allowed"] is False
        assert response.json()["scheduler_allowed"] is False

    assert _paper_counts() == before


def test_phase9l_does_not_expose_run_once_cycles_or_proposals() -> None:
    client = TestClient(app)

    assert client.post("/api/portfolio/paper-loop/run-once", json={}).status_code == 404
    assert client.get("/api/portfolio/paper-loop/cycles").status_code == 404
    assert client.get("/api/portfolio/paper-loop/proposals").status_code == 404

    payload = client.get("/api/portfolio/paper-loop/status").json()
    serialized = json.dumps(payload).lower()
    assert f"fake-{'live'}" not in serialized
    assert f"broker-{'ready'}" not in serialized
    assert f"execution-{'ready'}" not in serialized
    assert "real-money" not in serialized
    assert "funds-routing" not in serialized
