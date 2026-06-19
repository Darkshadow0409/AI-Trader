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
    "assumption_schema_version": "phase9f.test",
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


def _post_order(client, **overrides):
    payload = {
        "symbol": "USOUSD",
        "side": "buy",
        "order_type": "market",
        "quantity": 1,
        "requested_price": 100,
        "assumption_snapshot": ASSUMPTIONS,
    }
    payload.update(overrides)
    response = client.post("/api/portfolio/simulated-orders", json=payload)
    assert response.status_code == 201
    return response.json()


def test_paper_performance_summary_derives_order_and_risk_counts(client) -> None:
    filled = _post_order(client, symbol="USOUSD", requested_price=100)
    rejected = _post_order(client, symbol="WTI_CTX", requested_price=70)

    response = client.get("/api/portfolio/paper-performance")

    assert response.status_code == 200
    payload = response.json()
    assert payload["paper_only"] is True
    assert payload["wallet_id"] == "paper_wallet_default"
    assert payload["total_orders"] == 2
    assert payload["filled_orders"] == 1
    assert payload["rejected_orders"] == 1
    assert payload["acceptance_rate"] == 50
    assert payload["rejection_rate"] == 50
    assert payload["fees_paid"] > 0
    assert payload["gross_notional_traded"] > 0
    assert payload["orders_by_symbol"]["USOUSD"] == 1
    assert payload["orders_by_symbol"]["WTI_CTX"] == 1
    assert payload["risk_rejections_by_reason"]["symbol_not_trader_facing"] == 1
    assert payload["largest_single_gain"] is None
    assert payload["largest_single_loss"] is None
    assert payload["unrealized_pnl_available"] is False
    assert any("Unrealized PnL is unavailable" in warning for warning in payload["performance_warnings"])
    assert filled["status"] == "filled"
    assert rejected["status"] == "rejected"


def test_paper_equity_curve_is_ledger_derived_and_never_marks_unrealized_pnl_available(client) -> None:
    _post_order(client, symbol="USOUSD", requested_price=100)

    response = client.get("/api/portfolio/paper-equity-curve")

    assert response.status_code == 200
    points = response.json()
    assert len(points) >= 4
    assert [point["sequence_number"] for point in points] == sorted(point["sequence_number"] for point in points)
    assert all(point["paper_only"] is True for point in points)
    assert all(point["unrealized_pnl_available"] is False for point in points)
    assert points[-1]["equity"] == points[-1]["cash_balance"] + points[-1]["reserved_cash"]


def test_rejection_analysis_and_review_queue_surface_operator_review_items(client) -> None:
    _post_order(client, symbol="WTI_CTX", requested_price=70)
    _post_order(client, symbol="WTI_CTX", requested_price=71)
    _post_order(client, symbol="USOUSD", assumption_snapshot={})

    analysis = client.get("/api/portfolio/paper-rejection-analysis")
    queue = client.get("/api/portfolio/paper-review-queue")

    assert analysis.status_code == 200
    assert queue.status_code == 200
    groups = {row["reason_code"]: row for row in analysis.json()}
    assert groups["symbol_not_trader_facing"]["count"] == 2
    assert groups["missing_assumptions"]["count"] == 1
    assert all(row["paper_only"] is True for row in analysis.json())
    queue_rows = queue.json()
    assert any(row["source_type"] == "risk_decision" for row in queue_rows)
    assert any(row["title"] == "Repeated paper rejection: symbol_not_trader_facing" for row in queue_rows)
    assert all(row["paper_only"] is True for row in queue_rows)


def test_paused_policy_adds_review_queue_item_without_autonomy_copy(client) -> None:
    paused = client.post("/api/portfolio/paper-risk-policy/pause", json={"reason": "Operator review pause."})
    assert paused.status_code == 200

    queue = client.get("/api/portfolio/paper-review-queue")

    assert queue.status_code == 200
    payload = queue.json()
    assert any(row["source_type"] == "risk_policy" and row["severity"] == "critical" for row in payload)
    copy = str(payload).lower()
    assert "fake-live" not in copy
    assert "broker-ready" not in copy
    assert "execution-ready" not in copy
    assert "real-money" not in copy
