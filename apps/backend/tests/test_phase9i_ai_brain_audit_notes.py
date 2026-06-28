from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.database import engine, init_db
from app.main import app
from app.models.entities import (
    AiBrainOperatorNoteRecord,
    AiBrainQueryRecord,
    PaperLedgerTransactionRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SimulatedOrderRecord,
)
from app.services.paper_wallet import _ensure_paper_wallet_tables


@pytest.fixture(autouse=True)
def isolated_ai_brain_state() -> None:
    init_db()
    _ensure_paper_wallet_tables()
    with Session(engine) as session:
        for model in (
            AiBrainOperatorNoteRecord,
            AiBrainQueryRecord,
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
        }


def _audit_counts() -> dict[str, int]:
    with Session(engine) as session:
        return {
            "queries": len(session.exec(select(AiBrainQueryRecord)).all()),
            "notes": len(session.exec(select(AiBrainOperatorNoteRecord)).all()),
        }


def test_ai_brain_query_creates_single_audit_record_without_trading_mutation() -> None:
    client = TestClient(app)
    before_paper = _paper_counts()
    before_audit = _audit_counts()

    response = client.post(
        "/api/ai-brain/query",
        json={"query": "What should I review next?", "symbol": "USOUSD", "timeframe": "1d"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["audit_id"]
    assert payload["paper_only"] is True
    assert payload["orders_created"] == 0
    assert payload["ledger_rows_created"] == 0
    assert payload["risk_decisions_created"] == 0
    assert _paper_counts() == before_paper
    assert _audit_counts() == {"queries": before_audit["queries"] + 1, "notes": 0}

    history = client.get("/api/ai-brain/history")
    assert history.status_code == 200
    assert history.json()[0]["audit_id"] == payload["audit_id"]
    assert history.json()[0]["created_order_count"] == 0

    detail = client.get(f"/api/ai-brain/history/{payload['audit_id']}")
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["audit_id"] == payload["audit_id"]
    assert detail_payload["evidence_snapshot"]["cards"]
    assert detail_payload["availability_snapshot"]["database_reachable"] is True
    assert detail_payload["wallet_snapshot"]["status"] in {"unavailable", "active"}
    assert detail_payload["performance_snapshot"]["unrealized_pnl"] == "unavailable_without_inventory_accounting"

    serialized = json.dumps(detail_payload).lower()
    assert f"broker-{'ready'}" not in serialized
    assert f"execution-{'ready'}" not in serialized
    assert "live-money" not in serialized


def test_operator_notes_attach_to_audit_record_without_trading_mutation() -> None:
    client = TestClient(app)
    query_response = client.post(
        "/api/ai-brain/query",
        json={"query": "Summarize paper risk notes", "symbol": "XAGUSD", "timeframe": "1d"},
    )
    audit_id = query_response.json()["audit_id"]
    before_paper = _paper_counts()

    note_response = client.post(
        f"/api/ai-brain/history/{audit_id}/notes",
        json={"note": "Review the missing-assumption warning before another paper test.", "status": "follow_up"},
    )

    assert note_response.status_code == 200
    note_payload = note_response.json()
    assert note_payload["ai_brain_query_id"] == audit_id
    assert note_payload["paper_only"] is True
    assert note_payload["status"] == "follow_up"
    assert _paper_counts() == before_paper
    assert _audit_counts() == {"queries": 1, "notes": 1}

    notes = client.get(f"/api/ai-brain/history/{audit_id}/notes")
    assert notes.status_code == 200
    assert notes.json()[0]["note"] == "Review the missing-assumption warning before another paper test."


def test_operator_note_requires_existing_audit_and_note_text() -> None:
    client = TestClient(app)

    missing_note = client.post(
        "/api/ai-brain/history/not_real/notes",
        json={"note": "This should not attach.", "status": "reviewed"},
    )
    empty_note = client.post(
        "/api/ai-brain/history/not_real/notes",
        json={"note": "   ", "status": "reviewed"},
    )

    assert missing_note.status_code == 404
    assert empty_note.status_code == 400
    assert _paper_counts() == {"orders": 0, "ledger": 0, "risk_decisions": 0}
    assert _audit_counts() == {"queries": 0, "notes": 0}
