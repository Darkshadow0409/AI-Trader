from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.database import engine, init_db
from app.main import app
from app.models.entities import (
    AiBrainEvidenceReviewRecord,
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
def isolated_market_evidence_state() -> None:
    init_db()
    _ensure_paper_wallet_tables()
    with Session(engine) as session:
        for model in (
            AiBrainEvidenceReviewRecord,
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


def _audit_count() -> int:
    with Session(engine) as session:
        return len(session.exec(select(AiBrainQueryRecord)).all())


def test_market_evidence_providers_are_paper_research_only_placeholders() -> None:
    client = TestClient(app)

    response = client.get("/api/market-evidence/providers")

    assert response.status_code == 200
    providers = response.json()
    provider_ids = {provider["provider_id"] for provider in providers}
    assert "local_ai_trader_snapshot" in provider_ids
    assert "openbb_future_adapter" in provider_ids
    assert all(provider["paper_research_only"] is True for provider in providers)
    openbb = next(provider for provider in providers if provider["provider_id"] == "openbb_future_adapter")
    assert openbb["enabled"] is False
    assert openbb["configured"] is False
    assert openbb["provider_type"] == "unavailable_external"
    serialized = json.dumps(providers).lower()
    assert "secret" not in serialized
    assert "not configured" in serialized or "no api key" in serialized


def test_market_evidence_snapshot_is_read_only_for_supported_symbols() -> None:
    client = TestClient(app)
    before = _paper_counts()

    uso = client.get("/api/market-evidence/snapshot?symbol=USOUSD&timeframe=1d")
    xag = client.get("/api/market-evidence/snapshot?symbol=XAGUSD&timeframe=1d")

    assert uso.status_code == 200
    assert xag.status_code == 200
    uso_payload = uso.json()
    xag_payload = xag.json()
    assert uso_payload["symbol"] == "USOUSD"
    assert xag_payload["symbol"] == "XAGUSD"
    assert uso_payload["provider_id"] == "local_ai_trader_snapshot"
    assert uso_payload["paper_research_only"] is True
    assert uso_payload["freshness_status"] in {"fresh", "stale", "unavailable", "degraded"}
    assert uso_payload["data_quality"] in {"good", "partial", "unavailable", "degraded"}
    assert _paper_counts() == before
    assert _audit_count() == 0


def test_market_evidence_missing_symbol_degrades_without_mutating_trading_state() -> None:
    client = TestClient(app)
    before = _paper_counts()

    response = client.get("/api/market-evidence/snapshot?symbol=NOTREAL&timeframe=1d")

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "NOTREAL"
    assert payload["freshness_status"] in {"unavailable", "degraded", "stale"}
    assert payload["missing_inputs"]
    assert payload["degraded_notes"]
    assert payload["paper_research_only"] is True
    assert _paper_counts() == before


def test_ai_brain_audit_includes_market_evidence_without_trading_mutation() -> None:
    client = TestClient(app)
    before = _paper_counts()
    before_audits = _audit_count()

    response = client.post(
        "/api/ai-brain/query",
        json={"query": "What is the market evidence quality?", "symbol": "USOUSD", "timeframe": "1d"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["audit_id"]
    assert payload["market_evidence"]["provider_id"] == "local_ai_trader_snapshot"
    assert payload["market_evidence_provider"]["paper_research_only"] is True
    assert payload["orders_created"] == 0
    assert payload["ledger_rows_created"] == 0
    assert payload["risk_decisions_created"] == 0
    assert _paper_counts() == before
    assert _audit_count() == before_audits + 1

    detail = client.get(f"/api/ai-brain/history/{payload['audit_id']}")
    assert detail.status_code == 200
    detail_payload = detail.json()
    market_snapshot = detail_payload["market_evidence_snapshot"]
    assert market_snapshot["provider"]["provider_id"] == "local_ai_trader_snapshot"
    assert market_snapshot["snapshot"]["symbol"] == "USOUSD"

    serialized = json.dumps(detail_payload).lower()
    assert f"broker-{'ready'}" not in serialized
    assert f"execution-{'ready'}" not in serialized
    assert "live-money" not in serialized


def test_ai_brain_history_uses_deterministic_newest_first_tie_break() -> None:
    client = TestClient(app)

    first = client.post(
        "/api/ai-brain/query",
        json={"query": "First same-timestamp market evidence audit", "symbol": "USOUSD", "timeframe": "1d"},
    )
    second = client.post(
        "/api/ai-brain/query",
        json={"query": "Second same-timestamp market evidence audit", "symbol": "USOUSD", "timeframe": "1d"},
    )
    history = client.get("/api/ai-brain/history")

    assert first.status_code == 200
    assert second.status_code == 200
    assert history.status_code == 200
    items = history.json()
    assert items[0]["audit_id"] == second.json()["audit_id"]
    assert items[0]["question"] == "Second same-timestamp market evidence audit"
