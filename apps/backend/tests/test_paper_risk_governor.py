from __future__ import annotations

import pytest
from sqlalchemy import delete
from sqlmodel import Session

from app.core.database import engine
from app.models.entities import (
    PaperLedgerTransactionRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SimulatedOrderRecord,
)
from app.services.paper_wallet import _ensure_paper_wallet_tables


ASSUMPTIONS = {
    "assumption_schema_version": "phase9e.test",
    "fee_bps": 10,
    "spread_bps": 5,
    "slippage_bps": 2,
    "candle_fill_rule": "close_only",
}


@pytest.fixture(autouse=True)
def isolated_paper_wallet_state() -> None:
    _ensure_paper_wallet_tables()
    with Session(engine) as session:
        for model in (
            PaperRiskDecisionRecord,
            SimulatedOrderRecord,
            PaperLedgerTransactionRecord,
            PaperRiskPolicyRecord,
            PaperWalletRecord,
        ):
            session.exec(delete(model))
        session.commit()


def test_default_paper_risk_policy_is_visible_and_paper_only(client) -> None:
    response = client.get("/api/portfolio/paper-risk-policy")

    assert response.status_code == 200
    policy = response.json()
    assert policy["policy_id"] == "paper_risk_default"
    assert policy["policy_schema_version"] == "phase9e.v1"
    assert policy["status"] == "active"
    assert policy["paper_only"] is True
    assert policy["max_order_notional"] == 15000
    assert "USOUSD" in policy["allowed_symbols"]
    assert "XAGUSD" in policy["allowed_symbols"]
    assert "WTI_CTX" in policy["research_only_symbols"]
    assert "scheduler" in policy["policy_note"].lower()
    assert "outside order path" in policy["policy_note"].lower()
    assert "external routing" not in policy["policy_note"].lower()


def test_risk_decisions_are_recorded_for_accept_and_reject(client) -> None:
    accepted = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "USOUSD",
            "side": "buy",
            "order_type": "market",
            "quantity": 1,
            "requested_price": 100,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )
    assert accepted.status_code == 201
    assert accepted.json()["status"] == "filled"

    rejected = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "WTI_CTX",
            "side": "buy",
            "order_type": "market",
            "quantity": 1,
            "requested_price": 70,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )
    assert rejected.status_code == 201
    assert rejected.json()["status"] == "rejected"

    decisions = client.get("/api/portfolio/paper-risk-decisions")
    assert decisions.status_code == 200
    payload = decisions.json()
    assert any(row["accepted"] is True and row["reason_code"] == "accepted" for row in payload)
    assert any(row["accepted"] is False and row["reason_code"] == "symbol_not_trader_facing" for row in payload)
    assert all(row["paper_only"] is True for row in payload)


def test_risk_governor_rejects_max_notional_and_open_order_limit(client) -> None:
    too_large = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "USOUSD",
            "side": "buy",
            "order_type": "market",
            "quantity": 151,
            "requested_price": 100,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )
    assert too_large.status_code == 201
    assert too_large.json()["status"] == "rejected"
    assert "exceeds policy max" in too_large.json()["rejection_reason"]

    for _ in range(5):
        accepted_limit = client.post(
            "/api/portfolio/simulated-orders",
            json={
                "symbol": "XAGUSD",
                "side": "buy",
                "order_type": "limit",
                "quantity": 1,
                "requested_price": 10,
                "limit_price": 1,
                "assumption_snapshot": ASSUMPTIONS,
            },
        )
        assert accepted_limit.status_code == 201
        assert accepted_limit.json()["status"] == "accepted"

    blocked_limit = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "XAGUSD",
            "side": "buy",
            "order_type": "limit",
            "quantity": 1,
            "requested_price": 10,
            "limit_price": 1,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )
    assert blocked_limit.status_code == 201
    assert blocked_limit.json()["status"] == "rejected"
    assert "max open orders" in blocked_limit.json()["rejection_reason"]


def test_risk_governor_requires_explicit_assumptions(client) -> None:
    missing = client.post(
        "/api/portfolio/simulated-orders",
        json={"symbol": "USOUSD", "side": "buy", "order_type": "market", "quantity": 1, "requested_price": 50},
    )
    assert missing.status_code == 201
    assert missing.json()["status"] == "rejected"
    assert "explicit assumption_snapshot is required" in missing.json()["rejection_reason"]

    decisions = client.get("/api/portfolio/paper-risk-decisions")
    assert any(row["reason_code"] == "missing_assumptions" for row in decisions.json())


def test_paused_paper_risk_policy_blocks_new_simulated_orders(client) -> None:
    paused = client.post("/api/portfolio/paper-risk-policy/pause", json={"reason": "Operator review pause."})
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"

    blocked = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "USOUSD",
            "side": "buy",
            "order_type": "market",
            "quantity": 1,
            "requested_price": 50,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )
    assert blocked.status_code == 201
    assert blocked.json()["status"] == "rejected"
    assert "Paper risk policy is paused" in blocked.json()["rejection_reason"]

    resumed = client.post("/api/portfolio/paper-risk-policy/resume", json={"reason": "Operator review complete."})
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "active"
