from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlmodel import Session

from app.core.clock import naive_utc_now
from app.core.settings import get_settings
from app.models.entities import (
    PaperLedgerTransactionRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SimulatedOrderRecord,
)
from app.models.schemas import AvailabilityStatusView, AvailabilityTableCheckView, PaperStateExportView
from app.services.paper_wallet import _ensure_paper_wallet_tables


PAPER_TABLES = (
    ("paper_wallet", PaperWalletRecord),
    ("paper_ledger", PaperLedgerTransactionRecord),
    ("simulated_orders", SimulatedOrderRecord),
    ("paper_risk_policy", PaperRiskPolicyRecord),
    ("paper_risk_decisions", PaperRiskDecisionRecord),
)


def _json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _record_to_dict(record: Any) -> dict[str, Any]:
    return {column.name: _json_value(getattr(record, column.name)) for column in record.__table__.columns}


def _table_check(session: Session, label: str, model: Any) -> AvailabilityTableCheckView:
    table_name = model.__table__.name
    try:
        row = session.exec(text(f'SELECT COUNT(*) FROM "{table_name}"')).one()
        try:
            row_count = row[0]
        except (TypeError, KeyError):
            row_count = row
        return AvailabilityTableCheckView(
            table_name=label,
            reachable=True,
            row_count=int(row_count),
            detail="reachable",
        )
    except Exception as exc:  # pragma: no cover - defensive health surface
        return AvailabilityTableCheckView(
            table_name=label,
            reachable=False,
            row_count=None,
            detail=type(exc).__name__,
        )


def availability_status(session: Session) -> AvailabilityStatusView:
    settings = get_settings()
    warnings: list[str] = []
    database_reachable = True
    try:
        _ensure_paper_wallet_tables()
        session.exec(text("SELECT 1")).one()
    except Exception as exc:  # pragma: no cover - defensive health surface
        database_reachable = False
        warnings.append(f"Database readiness check failed: {type(exc).__name__}")

    table_checks = [_table_check(session, label, model) for label, model in PAPER_TABLES]
    table_map = {check.table_name: check.reachable for check in table_checks}
    performance_ready = all(table_map.get(label, False) for label, _ in PAPER_TABLES)
    status = "ok" if database_reachable and performance_ready else "degraded"
    return AvailabilityStatusView(
        status=status,
        generated_at=naive_utc_now(),
        app_ok=True,
        database_reachable=database_reachable,
        persistence_path=str(settings.sqlite_full_path),
        persistence_mode="sqlite_on_configured_data_path",
        paper_wallet_table_reachable=table_map.get("paper_wallet", False),
        paper_ledger_table_reachable=table_map.get("paper_ledger", False),
        simulated_orders_table_reachable=table_map.get("simulated_orders", False),
        paper_risk_policy_table_reachable=table_map.get("paper_risk_policy", False),
        paper_performance_endpoints_reachable=performance_ready,
        tables=table_checks,
        warnings=warnings,
    )


def _read_rows(session: Session, model: Any, limit: int) -> list[dict[str, Any]]:
    table_name = model.__table__.name
    rows = session.exec(text(f'SELECT * FROM "{table_name}" ORDER BY id DESC LIMIT :limit').bindparams(limit=limit)).all()
    columns = [column.name for column in model.__table__.columns]
    return [dict(zip(columns, [_json_value(value) for value in row])) for row in rows]


def paper_state_export(session: Session, limit: int = 100) -> PaperStateExportView:
    _ensure_paper_wallet_tables()
    checks = {label: _table_check(session, label, model) for label, model in PAPER_TABLES}
    return PaperStateExportView(
        generated_at=naive_utc_now(),
        wallet_count=checks["paper_wallet"].row_count or 0,
        ledger_count=checks["paper_ledger"].row_count or 0,
        simulated_order_count=checks["simulated_orders"].row_count or 0,
        risk_policy_count=checks["paper_risk_policy"].row_count or 0,
        risk_decision_count=checks["paper_risk_decisions"].row_count or 0,
        performance_summary_available=all(check.reachable for check in checks.values()),
        wallets=_read_rows(session, PaperWalletRecord, limit),
        ledger_transactions=_read_rows(session, PaperLedgerTransactionRecord, limit),
        simulated_orders=_read_rows(session, SimulatedOrderRecord, limit),
        risk_policies=_read_rows(session, PaperRiskPolicyRecord, limit),
        risk_decisions=_read_rows(session, PaperRiskDecisionRecord, limit),
    )
