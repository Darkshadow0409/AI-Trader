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
    PaperLoopProposalRecord,
    PaperLoopRunRecord,
    PaperLoopSafetyEventRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SimulatedOrderRecord,
)
from app.services.paper_wallet import _ensure_paper_wallet_tables


@pytest.fixture(autouse=True)
def isolated_phase9m_state() -> None:
    init_db()
    _ensure_paper_wallet_tables()
    with Session(engine) as session:
        for model in (
            PaperLoopSafetyEventRecord,
            PaperLoopProposalRecord,
            PaperLoopRunRecord,
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


def _trading_counts() -> dict[str, int]:
    with Session(engine) as session:
        return {
            "orders": len(session.exec(select(SimulatedOrderRecord)).all()),
            "ledger": len(session.exec(select(PaperLedgerTransactionRecord)).all()),
            "risk_decisions": len(session.exec(select(PaperRiskDecisionRecord)).all()),
            "proposals": len(session.exec(select(PaperLoopProposalRecord)).all()),
            "runs": len(session.exec(select(PaperLoopRunRecord)).all()),
            "safety_events": len(session.exec(select(PaperLoopSafetyEventRecord)).all()),
        }


def _enable_and_allow(client: TestClient) -> None:
    enabled = client.post("/api/portfolio/paper-loop/enable", json={"confirm_paper_loop_control": True})
    assert enabled.status_code == 200
    assert enabled.json()["run_once_allowed"] is False
    allowed = client.post(
        "/api/portfolio/paper-loop/allow-run-once-proposals",
        json={
            "confirm_manual_run_once_proposals": True,
            "reason": "Allow one manual proposal-only check.",
        },
    )
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "enabled"
    assert allowed.json()["run_once_allowed"] is True
    assert allowed.json()["scheduler_allowed"] is False


def test_disabled_loop_blocks_run_once_without_trading_mutation() -> None:
    client = TestClient(app)
    before = _trading_counts()

    response = client.post(
        "/api/portfolio/paper-loop/run-once",
        json={"explicit_confirmation": True, "symbol": "USOUSD", "timeframe": "1d"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run"]["status"] == "failed_closed"
    assert payload["run"]["proposal_count"] == 0
    assert payload["safety_events"][0]["reason_code"] == "loop_disabled"
    assert payload["created_order_count"] == 0
    assert payload["created_ledger_count"] == 0
    assert payload["created_risk_decision_count"] == 0
    after = _trading_counts()
    assert after["orders"] == before["orders"]
    assert after["ledger"] == before["ledger"]
    assert after["risk_decisions"] == before["risk_decisions"]
    assert after["runs"] == before["runs"] + 1
    assert after["safety_events"] == before["safety_events"] + 1


def test_run_once_requires_confirmation_and_explicit_permission() -> None:
    client = TestClient(app)
    missing_confirmation = client.post("/api/portfolio/paper-loop/run-once", json={"symbol": "USOUSD"})
    assert missing_confirmation.status_code == 400
    assert "confirmation" in missing_confirmation.json()["detail"].lower()

    enabled = client.post("/api/portfolio/paper-loop/enable", json={"confirm_paper_loop_control": True})
    assert enabled.status_code == 200
    blocked = client.post(
        "/api/portfolio/paper-loop/run-once",
        json={"explicit_confirmation": True, "symbol": "USOUSD"},
    )
    assert blocked.status_code == 200
    assert blocked.json()["safety_events"][0]["reason_code"] == "run_once_not_allowed"

    missing_allow_confirmation = client.post(
        "/api/portfolio/paper-loop/allow-run-once-proposals",
        json={"reason": "Missing explicit confirmation."},
    )
    assert missing_allow_confirmation.status_code == 400
    assert "confirmation" in missing_allow_confirmation.json()["detail"].lower()

    _enable_and_allow(client)
    status = client.get("/api/portfolio/paper-loop/status").json()
    assert status["run_once_allowed"] is True
    assert status["scheduler_allowed"] is False


def test_enabled_allowed_uso_run_once_creates_proposal_evidence_only() -> None:
    client = TestClient(app)
    before = _trading_counts()
    _enable_and_allow(client)

    response = client.post(
        "/api/portfolio/paper-loop/run-once",
        json={"explicit_confirmation": True, "symbol": "USOUSD", "timeframe": "1d", "max_candidates": 5},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["paper_only"] is True
    assert payload["created_order_count"] == 0
    assert payload["created_ledger_count"] == 0
    assert payload["created_risk_decision_count"] == 0
    assert len(payload["proposals"]) == 1
    proposal = payload["proposals"][0]
    assert proposal["symbol"] == "USOUSD"
    assert proposal["paper_only"] is True
    assert proposal["simulated_order_id"] is None
    assert proposal["status"] in {"proposed", "skipped"}
    assert len(payload["safety_events"]) == 1

    after = _trading_counts()
    assert after["orders"] == before["orders"]
    assert after["ledger"] == before["ledger"]
    assert after["risk_decisions"] == before["risk_decisions"]
    assert after["runs"] >= before["runs"] + 1
    assert after["proposals"] >= before["proposals"] + 1
    assert after["safety_events"] >= before["safety_events"] + 1

    runs = client.get("/api/portfolio/paper-loop/runs")
    proposals = client.get("/api/portfolio/paper-loop/proposals")
    safety_events = client.get("/api/portfolio/paper-loop/safety-events")
    assert runs.status_code == 200
    assert proposals.status_code == 200
    assert safety_events.status_code == 200
    detail = client.get(f"/api/portfolio/paper-loop/runs/{payload['run']['run_id']}")
    assert detail.status_code == 200
    assert detail.json()["proposals"][0]["simulated_order_id"] is None


def test_paused_killed_and_research_only_symbols_fail_closed() -> None:
    client = TestClient(app)
    _enable_and_allow(client)

    paused = client.post("/api/portfolio/paper-loop/pause", json={"reason": "Pause before proposal scan."})
    assert paused.status_code == 200
    paused_run = client.post(
        "/api/portfolio/paper-loop/run-once",
        json={"explicit_confirmation": True, "symbol": "USOUSD"},
    )
    assert paused_run.status_code == 200
    assert paused_run.json()["safety_events"][0]["reason_code"] == "loop_paused"

    resumed = client.post("/api/portfolio/paper-loop/resume", json={"reason": "Resume metadata only."})
    assert resumed.status_code == 200
    client.post(
        "/api/portfolio/paper-loop/allow-run-once-proposals",
        json={"confirm_manual_run_once_proposals": True, "reason": "Allow research-only gate check."},
    )
    wti = client.post(
        "/api/portfolio/paper-loop/run-once",
        json={"explicit_confirmation": True, "symbol": "WTI_CTX"},
    )
    assert wti.status_code == 200
    assert wti.json()["proposals"][0]["status"] == "rejected_by_gate"
    assert wti.json()["proposals"][0]["simulated_order_id"] is None
    assert wti.json()["safety_events"][0]["reason_code"] == "research_only_symbol"

    killed = client.post(
        "/api/portfolio/paper-loop/kill",
        json={"confirm_paper_loop_control": True, "reason": "Kill before any recurring behavior."},
    )
    assert killed.status_code == 200
    killed_run = client.post(
        "/api/portfolio/paper-loop/run-once",
        json={"explicit_confirmation": True, "symbol": "USOUSD"},
    )
    assert killed_run.status_code == 200
    assert killed_run.json()["safety_events"][0]["reason_code"] == "loop_killed"


def test_phase9m_does_not_expose_execution_or_scheduler_endpoints() -> None:
    client = TestClient(app)

    assert client.get("/api/portfolio/paper-loop/cycles").status_code == 404
    assert client.post("/api/portfolio/paper-loop/accept", json={}).status_code == 404
    assert client.post("/api/portfolio/paper-loop/execute", json={}).status_code == 404
    assert client.get("/api/portfolio/paper-loop/scheduler").status_code == 404

    payload = client.get("/api/portfolio/paper-loop/status").json()
    serialized = json.dumps(payload).lower()
    assert f"fake-{'live'}" not in serialized
    assert f"broker-{'ready'}" not in serialized
    assert f"execution-{'ready'}" not in serialized
    assert "real-money" not in serialized
    assert "funds-routing" not in serialized
