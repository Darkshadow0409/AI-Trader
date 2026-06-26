from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.database import engine
from app.main import app
from app.models.entities import (
    PaperLedgerTransactionRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SimulatedOrderRecord,
)
from app.services.paper_wallet import _ensure_paper_wallet_tables


@pytest.fixture(autouse=True)
def isolated_paper_state() -> None:
    _ensure_paper_wallet_tables()
    with Session(engine) as session:
        for model in (
            PaperRiskDecisionRecord,
            PaperRiskPolicyRecord,
            SimulatedOrderRecord,
            PaperLedgerTransactionRecord,
            PaperWalletRecord,
        ):
            session.exec(delete(model))
        session.commit()


def _counts() -> dict[str, int]:
    with Session(engine) as session:
        return {
            "wallets": len(session.exec(select(PaperWalletRecord)).all()),
            "ledger": len(session.exec(select(PaperLedgerTransactionRecord)).all()),
            "orders": len(session.exec(select(SimulatedOrderRecord)).all()),
            "risk_policies": len(session.exec(select(PaperRiskPolicyRecord)).all()),
            "risk_decisions": len(session.exec(select(PaperRiskDecisionRecord)).all()),
        }


def test_availability_status_reports_database_and_paper_table_readiness() -> None:
    client = TestClient(app)

    response = client.get("/api/availability/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["app_ok"] is True
    assert payload["database_reachable"] is True
    assert payload["persistence_path"]
    assert payload["paper_wallet_table_reachable"] is True
    assert payload["paper_ledger_table_reachable"] is True
    assert payload["simulated_orders_table_reachable"] is True
    assert payload["paper_risk_policy_table_reachable"] is True
    assert payload["paper_performance_endpoints_reachable"] is True
    assert {row["table_name"] for row in payload["tables"]} >= {
        "paper_wallet",
        "paper_ledger",
        "simulated_orders",
        "paper_risk_policy",
    }
    serialized = json.dumps(payload).lower()
    assert "secret" not in serialized
    assert "token" not in serialized
    assert "password" not in serialized


def test_ai_brain_query_returns_structured_deterministic_fallback_without_mutation() -> None:
    client = TestClient(app)
    before = _counts()

    response = client.post(
        "/api/ai-brain/query",
        json={
            "query": "What should I inspect before the next paper test?",
            "symbol": "USOUSD",
            "timeframe": "1d",
        },
    )

    assert response.status_code == 200
    after = _counts()
    assert after == before
    payload = response.json()
    assert payload["paper_only"] is True
    assert payload["mode"] == "deterministic_local"
    assert payload["orders_created"] == 0
    assert payload["ledger_rows_created"] == 0
    assert payload["risk_decisions_created"] == 0
    assert payload["answer"]
    assert payload["suggested_next_inspection"]
    assert len(payload["evidence_cards"]) >= 4
    assert any(card["title"] == "Paper Wallet" for card in payload["evidence_cards"])
    serialized = json.dumps(payload).lower()
    assert f"broker-{'ready'}" not in serialized
    assert f"execution-{'ready'}" not in serialized
    assert "live-money" not in serialized


def test_paper_state_export_is_read_only() -> None:
    client = TestClient(app)
    before = _counts()

    response = client.get("/api/availability/paper-state-export")

    assert response.status_code == 200
    after = _counts()
    assert after == before
    payload = response.json()
    assert payload["paper_only"] is True
    assert payload["wallet_count"] == 0
    assert payload["ledger_count"] == 0
    assert payload["simulated_order_count"] == 0
