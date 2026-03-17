from __future__ import annotations

from sqlmodel import Session, select

from app.core.database import engine
from app.models.entities import ManualFillRecord, TradeTicketRecord
from app.models.schemas import ManualFillCreateRequest, ManualFillImportRequest, TradeTicketApprovalRequest, TradeTicketCreateRequest, TradeTicketUpdateRequest
from app.services.pipeline import seed_and_refresh
from app.services.dashboard_data import list_risk_views, list_signal_views
from app.services.trade_tickets import (
    approve_trade_ticket,
    broker_adapter_snapshot,
    create_trade_ticket,
    get_trade_ticket_detail,
    import_manual_fills,
    list_trade_tickets,
    mark_trade_ticket_shadow_active,
    record_manual_fill,
    update_trade_ticket,
)


def test_ticket_seed_and_shadow_monitoring() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        tickets = list_trade_tickets(session)
        assert len(tickets) >= 3
        detail = get_trade_ticket_detail(session, "ticket_eth_shadow")
        assert detail is not None
        assert detail.shadow_summary is not None
        assert detail.paper_account is not None
        assert detail.paper_account.account_size == 10000
        assert isinstance(detail.shadow_summary.ticket_valid, bool)
        assert detail.shadow_summary.freshness_state in {"fresh", "aging", "stale", "degraded", "unusable"}
        assert "ETH" in detail.shadow_summary.market_path_note


def test_ticket_approval_requires_complete_checklist() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        signals = list_signal_views(session)
        risks = list_risk_views(session)
        btc_signal = next(row for row in signals if row.symbol == "BTC")
        btc_risk = next(row for row in risks if row.symbol == "BTC")
        created = create_trade_ticket(
            session,
            TradeTicketCreateRequest(
                signal_id=btc_signal.signal_id,
                risk_report_id=btc_risk.risk_report_id,
                symbol="BTC",
                side="long",
                notes="checklist gating",
            ),
        )
        assert created.status == "draft"
        assert created.paper_account is not None
        assert created.paper_account.account_size == 10000
        try:
            approve_trade_ticket(session, created.ticket_id, TradeTicketApprovalRequest(approval_status="approved", approval_notes="should fail"))
        except ValueError as exc:
            assert "checklist is incomplete" in str(exc)
        else:
            raise AssertionError("Expected checklist gating failure.")

        updated = update_trade_ticket(
            session,
            created.ticket_id,
            payload=TradeTicketUpdateRequest(
                checklist_status={
                    "freshness_acceptable": True,
                    "realism_acceptable": True,
                    "risk_budget_available": True,
                    "cluster_exposure_acceptable": True,
                    "review_complete": True,
                    "operator_acknowledged": True,
                }
            ),
        )
        assert updated is not None
        approved = approve_trade_ticket(session, created.ticket_id, TradeTicketApprovalRequest(approval_status="approved", approval_notes="clear"))
        assert approved is not None
        assert approved.approval_status == "approved"
        assert approved.status == "approved"


def test_manual_fill_reconciliation_and_import() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        fill = record_manual_fill(
            session,
            "ticket_btc_review",
            ManualFillCreateRequest(fill_price=71900, fill_size=0.25, fees=3.0, notes="manual fill"),
        )
        assert fill is not None
        assert fill.reconciliation.planned_entry_reference > 0
        assert isinstance(fill.reconciliation.requires_review, bool)

        imported = import_manual_fills(
            session,
            "ticket_btc_review",
            ManualFillImportRequest(
                fills=[
                    ManualFillCreateRequest(fill_price=71950, fill_size=0.1, fees=1.0, notes="imported"),
                ],
                import_batch_id="batch_test",
                notes="batch import",
            ),
        )
        assert len(imported) == 1
        rows = session.exec(select(ManualFillRecord).where(ManualFillRecord.ticket_id == "ticket_btc_review")).all()
        assert len(rows) >= 2


def test_shadow_activation_and_broker_snapshot() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        updated = mark_trade_ticket_shadow_active(session, "ticket_btc_review", "start monitoring")
        assert updated is not None
        assert updated.status == "shadow_active"
        snapshot = broker_adapter_snapshot()
        assert snapshot.balances
        assert snapshot.positions
        assert snapshot.fill_imports


def test_ticket_records_persist() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        rows = session.exec(select(TradeTicketRecord)).all()
        assert rows
        assert any(row.ticket_id == "ticket_btc_manual" for row in rows)


def test_trade_ticket_aliases_are_canonicalized() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        signals = list_signal_views(session)
        risks = list_risk_views(session)
        btc_signal = next(row for row in signals if row.symbol == "BTC")
        btc_risk = next(row for row in risks if row.symbol == "BTC")
        created = create_trade_ticket(
            session,
            TradeTicketCreateRequest(
                signal_id=btc_signal.signal_id,
                risk_report_id=btc_risk.risk_report_id,
                symbol="USOUSD",
                side="long",
                notes="alias mapping regression",
            ),
        )
        assert created.symbol == "WTI"
        assert created.shadow_summary is not None
        assert created.shadow_summary.observed_price > 0
