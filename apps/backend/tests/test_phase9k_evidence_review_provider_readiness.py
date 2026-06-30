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
def isolated_evidence_review_state() -> None:
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


def _audit_counts() -> dict[str, int]:
    with Session(engine) as session:
        return {
            "queries": len(session.exec(select(AiBrainQueryRecord)).all()),
            "reviews": len(session.exec(select(AiBrainEvidenceReviewRecord)).all()),
        }


def test_provider_readiness_is_descriptive_and_non_executable() -> None:
    client = TestClient(app)
    before = _paper_counts()

    response = client.get("/api/market-evidence/provider-readiness")

    assert response.status_code == 200
    readiness = response.json()
    ids = {item["provider_id"] for item in readiness}
    assert "local_ai_trader_snapshot" in ids
    assert "openbb_future_adapter" in ids
    assert all(item["paper_research_only"] is True for item in readiness)
    assert all(item["execution_capable"] is False for item in readiness)
    assert all(item["network_calls_enabled"] is False for item in readiness)
    local = next(item for item in readiness if item["provider_id"] == "local_ai_trader_snapshot")
    openbb = next(item for item in readiness if item["provider_id"] == "openbb_future_adapter")
    assert local["readiness_status"] in {"ready_local", "degraded"}
    assert local["external_dependency_required"] is False
    assert openbb["readiness_status"] == "not_configured"
    assert openbb["enabled"] is False
    assert openbb["configured"] is False
    assert openbb["external_dependency_required"] is True
    assert _paper_counts() == before
    assert _audit_counts() == {"queries": 0, "reviews": 0}
    serialized = json.dumps(readiness).lower()
    assert f"broker-{'ready'}" not in serialized
    assert f"execution-{'ready'}" not in serialized
    assert "live-money" not in serialized


def test_evidence_review_defaults_and_upsert_without_trading_mutation() -> None:
    client = TestClient(app)
    query = client.post(
        "/api/ai-brain/query",
        json={"query": "Review evidence quality", "symbol": "USOUSD", "timeframe": "1d"},
    )
    assert query.status_code == 200
    audit_id = query.json()["audit_id"]
    before = _paper_counts()

    default_review = client.get(f"/api/ai-brain/history/{audit_id}/evidence-review")
    assert default_review.status_code == 200
    default_payload = default_review.json()
    assert default_payload["review_status"] == "unreviewed"
    assert default_payload["paper_only"] is True
    assert default_payload["review_id"] is None

    created = client.post(
        f"/api/ai-brain/history/{audit_id}/evidence-review",
        json={
            "review_status": "needs_follow_up",
            "confidence_label": "medium",
            "evidence_quality_label": "partial",
            "review_note": "Local evidence is useful, but fixture-backed chart context needs follow-up.",
            "follow_up_action": "Refresh local chart and compare Backtests assumptions.",
        },
    )
    assert created.status_code == 200
    created_payload = created.json()
    assert created_payload["review_id"]
    assert created_payload["review_status"] == "needs_follow_up"
    assert created_payload["confidence_label"] == "medium"
    assert created_payload["evidence_quality_label"] == "partial"
    assert created_payload["paper_only"] is True

    updated = client.post(
        f"/api/ai-brain/history/{audit_id}/evidence-review",
        json={
            "review_status": "accepted_for_research",
            "confidence_label": "low",
            "evidence_quality_label": "degraded",
            "review_note": "Accepted only for research notes.",
            "follow_up_action": "Do not rely on timing until fresh data exists.",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["review_id"] == created_payload["review_id"]
    assert updated.json()["review_status"] == "accepted_for_research"
    assert _paper_counts() == before
    assert _audit_counts() == {"queries": 1, "reviews": 1}


def test_ai_brain_query_includes_readiness_and_review_without_trading_mutation() -> None:
    client = TestClient(app)
    before_paper = _paper_counts()
    before_audit = _audit_counts()

    response = client.post(
        "/api/ai-brain/query",
        json={"query": "What evidence should I review?", "symbol": "XAGUSD", "timeframe": "1d"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["audit_id"]
    assert payload["provider_readiness"]
    assert payload["evidence_review"]["review_status"] == "unreviewed"
    assert payload["evidence_review"]["paper_only"] is True
    assert payload["orders_created"] == 0
    assert payload["ledger_rows_created"] == 0
    assert payload["risk_decisions_created"] == 0
    assert _paper_counts() == before_paper
    assert _audit_counts() == {"queries": before_audit["queries"] + 1, "reviews": 0}

    detail = client.get(f"/api/ai-brain/history/{payload['audit_id']}")
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["provider_readiness_snapshot"]
    assert detail_payload["evidence_review"]["review_status"] == "unreviewed"
    assert detail_payload["market_evidence_snapshot"]["snapshot"]["symbol"] == "XAGUSD"


def test_evidence_review_requires_existing_audit() -> None:
    client = TestClient(app)

    missing_get = client.get("/api/ai-brain/history/not_real/evidence-review")
    missing_post = client.post(
        "/api/ai-brain/history/not_real/evidence-review",
        json={"review_status": "needs_follow_up", "confidence_label": "low", "evidence_quality_label": "degraded"},
    )

    assert missing_get.status_code == 404
    assert missing_post.status_code == 404
    assert _paper_counts() == {"orders": 0, "ledger": 0, "risk_decisions": 0}
    assert _audit_counts() == {"queries": 0, "reviews": 0}
