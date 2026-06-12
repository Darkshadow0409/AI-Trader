from __future__ import annotations

from sqlmodel import Session, select

from app.core.database import engine
from app.models.entities import PaperLedgerTransactionRecord


ASSUMPTIONS = {
    "assumption_schema_version": "phase9e.test",
    "fee_bps": 1.0,
    "spread_bps": 2.0,
    "slippage_bps": 3.0,
    "candle_fill_rule": "close_only",
}


def _cash_sum(wallet_id: str) -> float:
    with Session(engine) as session:
        rows = session.exec(
            select(PaperLedgerTransactionRecord).where(PaperLedgerTransactionRecord.wallet_id == wallet_id)
        ).all()
    return round(sum(row.cash_delta for row in rows), 8)


def test_default_paper_wallet_is_created_with_open_ledger_entry(client) -> None:
    response = client.get("/api/portfolio/paper-wallet")

    assert response.status_code == 200
    wallet = response.json()
    assert wallet["wallet_id"] == "paper_wallet_default"
    assert wallet["paper_only"] is True
    assert wallet["starting_balance"] == 10000
    assert wallet["cash_balance"] == 10000
    assert wallet["reserved_cash"] == 0
    assert wallet["status"] == "active"

    ledger = client.get("/api/portfolio/paper-ledger")
    assert ledger.status_code == 200
    assert ledger.json()[-1]["transaction_type"] == "wallet_opened"
    assert ledger.json()[-1]["immutable"] is True


def test_simulated_buy_order_fills_and_preserves_accounting_invariants(client) -> None:
    created = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "USOUSD",
            "side": "buy",
            "order_type": "market",
            "quantity": 2,
            "requested_price": 120,
            "strategy_key": "trend_following_baseline",
            "assumption_snapshot": ASSUMPTIONS,
        },
    )

    assert created.status_code == 201
    order = created.json()
    assert order["status"] == "filled"
    assert order["paper_only"] is True
    assert order["symbol"] == "USOUSD"
    assert order["fill_price"] > 120
    assert order["assumption_snapshot"]["fee_bps"] == 1.0

    ledger = client.get("/api/portfolio/paper-ledger").json()
    order_rows = [row for row in ledger if row["simulated_order_id"] == order["simulated_order_id"]]
    assert {row["transaction_type"] for row in order_rows} == {"reserve_cash", "simulated_buy", "fee"}
    assert all(row["immutable"] for row in order_rows)

    wallet = client.get("/api/portfolio/paper-wallet").json()
    assert wallet["reserved_cash"] == 0
    assert wallet["cash_balance"] == round(wallet["starting_balance"] + _cash_sum(wallet["wallet_id"]), 8)


def test_simulated_sell_order_records_cash_credit_without_inventory_claim(client) -> None:
    created = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "XAGUSD",
            "side": "sell",
            "order_type": "market",
            "quantity": 5,
            "requested_price": 29.5,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )

    assert created.status_code == 201
    order = created.json()
    assert order["status"] == "filled"
    assert order["symbol"] == "XAGUSD"
    ledger = client.get("/api/portfolio/paper-ledger").json()
    order_rows = [row for row in ledger if row["simulated_order_id"] == order["simulated_order_id"]]
    assert {row["transaction_type"] for row in order_rows} == {"simulated_sell", "fee"}
    assert any("inventory accounting arrives in a later phase" in row["reason"] for row in order_rows)


def test_invalid_or_unfunded_simulated_orders_are_audited_as_rejected(client) -> None:
    invalid = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "USOUSD",
            "side": "buy",
            "order_type": "market",
            "quantity": 1,
            "requested_price": -1,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )
    assert invalid.status_code == 201
    assert invalid.json()["status"] == "rejected"
    assert "positive" in invalid.json()["rejection_reason"]

    unfunded = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "USOUSD",
            "side": "buy",
            "order_type": "market",
            "quantity": 100,
            "requested_price": 100,
            "assumption_snapshot": ASSUMPTIONS,
        },
    )
    assert unfunded.status_code == 201
    assert unfunded.json()["status"] == "rejected"
    assert "Insufficient paper cash" in unfunded.json()["rejection_reason"]

    ledger = client.get("/api/portfolio/paper-ledger").json()
    assert sum(1 for row in ledger if row["transaction_type"] == "order_rejected") >= 2


def test_research_context_symbols_are_rejected_but_trader_facing_symbols_are_accepted(client) -> None:
    for symbol in ["WTI", "WTI_CTX"]:
        rejected = client.post(
            "/api/portfolio/simulated-orders",
            json={
                "symbol": symbol,
                "side": "buy",
                "order_type": "market",
                "quantity": 1,
                "requested_price": 70,
                "assumption_snapshot": ASSUMPTIONS,
            },
        )
        assert rejected.status_code == 201
        assert rejected.json()["status"] == "rejected"
        assert "research context only" in rejected.json()["rejection_reason"]

    for symbol in ["USOUSD", "XAGUSD"]:
        accepted = client.post(
            "/api/portfolio/simulated-orders",
            json={
                "symbol": symbol,
                "side": "buy",
                "order_type": "market",
                "quantity": 1,
                "requested_price": 20,
                "assumption_snapshot": ASSUMPTIONS,
            },
        )
        assert accepted.status_code == 201
        assert accepted.json()["status"] == "filled"


def test_missing_assumptions_rejects_order_without_losing_audit_trail(client) -> None:
    rejected = client.post(
        "/api/portfolio/simulated-orders",
        json={
            "symbol": "USOUSD",
            "side": "buy",
            "order_type": "market",
            "quantity": 1,
            "requested_price": 50,
            "assumption_snapshot": {},
        },
    )

    assert rejected.status_code == 201
    payload = rejected.json()
    assert payload["status"] == "rejected"
    assert "Missing paper simulation assumptions" in payload["rejection_reason"]
    ledger = client.get("/api/portfolio/paper-ledger").json()
    assert any(row["simulated_order_id"] == payload["simulated_order_id"] for row in ledger)
