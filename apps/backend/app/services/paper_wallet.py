from __future__ import annotations

from collections import Counter, defaultdict
from uuid import uuid4

from sqlalchemy.exc import OperationalError
from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.core.database import engine
from app.core.settings import get_settings
from app.models.entities import (
    PaperLedgerTransactionRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SimulatedOrderRecord,
)
from app.models.schemas import (
    PaperEquityCurvePointView,
    PaperLedgerTransactionView,
    PaperPerformanceSummaryView,
    PaperRejectionAnalysisItemView,
    PaperRejectionDetailView,
    PaperRiskDecisionView,
    PaperRiskPolicyPauseRequest,
    PaperRiskPolicyResumeRequest,
    PaperRiskPolicyView,
    PaperReviewQueueItemView,
    PaperWalletView,
    SimulatedOrderCreateRequest,
    SimulatedOrderView,
)
from app.strategy_lab.registry import get_registry_entry
from app.services.market_identity import instrument_mapping_view, resolve_symbol


DEFAULT_WALLET_ID = "paper_wallet_default"
DEFAULT_RISK_POLICY_ID = "paper_risk_default"
TRADER_FACING_SYMBOLS = {"BTC", "BTCUSD", "ETH", "ETHUSD", "USOUSD", "XAGUSD", "XAUUSD"}
RESEARCH_ONLY_ORDER_SYMBOLS = {"WTI", "WTI_CTX", "SILVER", "XAG_CTX", "GOLD", "XAU_CTX"}
REQUIRED_ASSUMPTION_FIELDS = {
    "assumption_schema_version",
    "fee_bps",
    "spread_bps",
    "slippage_bps",
    "candle_fill_rule",
}
_PAPER_WALLET_TABLES_READY = False


def _ensure_paper_wallet_tables() -> None:
    global _PAPER_WALLET_TABLES_READY
    if _PAPER_WALLET_TABLES_READY:
        return
    for table in (
        PaperWalletRecord.__table__,
        PaperLedgerTransactionRecord.__table__,
        SimulatedOrderRecord.__table__,
        PaperRiskPolicyRecord.__table__,
        PaperRiskDecisionRecord.__table__,
    ):
        try:
            table.create(engine, checkfirst=True)
        except OperationalError as exc:
            if "already exists" not in str(exc).lower():
                raise
    _PAPER_WALLET_TABLES_READY = True


def default_assumption_snapshot() -> dict[str, object]:
    return {
        "assumption_schema_version": "phase9d.v1",
        "fee_model_label": "flat_bps",
        "fee_bps": 1.0,
        "spread_model_label": "fixed_bps",
        "spread_bps": 2.0,
        "slippage_model_label": "fixed_bps",
        "slippage_bps": 1.0,
        "candle_fill_rule": "manual_price_immediate",
        "source": "manual_simulation",
        "paper_only": True,
    }


def _wallet_to_view(wallet: PaperWalletRecord) -> PaperWalletView:
    return PaperWalletView(
        wallet_id=wallet.wallet_id,
        account_label=wallet.account_label,
        currency=wallet.currency,
        starting_balance=wallet.starting_balance,
        cash_balance=wallet.cash_balance,
        reserved_cash=wallet.reserved_cash,
        realized_pnl=wallet.realized_pnl,
        unrealized_pnl=wallet.unrealized_pnl,
        equity=wallet.equity,
        status=wallet.status,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


def _ledger_to_view(record: PaperLedgerTransactionRecord) -> PaperLedgerTransactionView:
    return PaperLedgerTransactionView(
        transaction_id=record.transaction_id,
        wallet_id=record.wallet_id,
        sequence_number=record.sequence_number,
        timestamp=record.timestamp,
        transaction_type=record.transaction_type,
        symbol=record.symbol,
        strategy_key=record.strategy_key,
        backtest_run_id=record.backtest_run_id,
        paper_trade_id=record.paper_trade_id,
        simulated_order_id=record.simulated_order_id,
        quantity=record.quantity,
        price=record.price,
        notional=record.notional,
        fee=record.fee,
        cash_delta=record.cash_delta,
        reserved_delta=record.reserved_delta,
        realized_pnl_delta=record.realized_pnl_delta,
        resulting_cash_balance=record.resulting_cash_balance,
        resulting_reserved_cash=record.resulting_reserved_cash,
        resulting_equity=record.resulting_equity,
        reason=record.reason,
        assumption_snapshot=record.assumption_snapshot_json,
        audit_ref=record.audit_ref,
        immutable=record.immutable,
    )


def _order_to_view(record: SimulatedOrderRecord) -> SimulatedOrderView:
    return SimulatedOrderView(
        simulated_order_id=record.simulated_order_id,
        wallet_id=record.wallet_id,
        strategy_key=record.strategy_key,
        symbol=record.symbol,
        side=record.side,
        order_type=record.order_type,
        quantity=record.quantity,
        requested_price=record.requested_price,
        limit_price=record.limit_price,
        status=record.status,
        rejection_reason=record.rejection_reason,
        fill_price=record.fill_price,
        fill_quantity=record.fill_quantity,
        fee=record.fee,
        slippage_bps=record.slippage_bps,
        spread_bps=record.spread_bps,
        candle_fill_rule=record.candle_fill_rule,
        created_at=record.created_at,
        updated_at=record.updated_at,
        filled_at=record.filled_at,
        assumption_snapshot=record.assumption_snapshot_json,
        source=record.source,
        paper_only=record.paper_only,
    )


def _policy_snapshot(policy: PaperRiskPolicyRecord) -> dict[str, object]:
    return {
        "policy_id": policy.policy_id,
        "policy_schema_version": policy.policy_schema_version,
        "wallet_id": policy.wallet_id,
        "max_order_notional": policy.max_order_notional,
        "max_position_notional_per_symbol": policy.max_position_notional_per_symbol,
        "max_open_orders": policy.max_open_orders,
        "max_daily_loss": policy.max_daily_loss,
        "max_drawdown_pct": policy.max_drawdown_pct,
        "max_strategy_allocation_pct": policy.max_strategy_allocation_pct,
        "max_symbol_allocation_pct": policy.max_symbol_allocation_pct,
        "allowed_symbols": policy.allowed_symbols_json,
        "research_only_symbols": policy.research_only_symbols_json,
        "min_cash_buffer": policy.min_cash_buffer,
        "require_assumption_snapshot": policy.require_assumption_snapshot,
        "require_strategy_contract": policy.require_strategy_contract,
        "status": policy.status,
        "pause_reason": policy.pause_reason,
        "paper_only": True,
    }


def _policy_to_view(policy: PaperRiskPolicyRecord) -> PaperRiskPolicyView:
    return PaperRiskPolicyView(
        policy_id=policy.policy_id,
        policy_schema_version=policy.policy_schema_version,
        wallet_id=policy.wallet_id,
        max_order_notional=policy.max_order_notional,
        max_position_notional_per_symbol=policy.max_position_notional_per_symbol,
        max_open_orders=policy.max_open_orders,
        max_daily_loss=policy.max_daily_loss,
        max_drawdown_pct=policy.max_drawdown_pct,
        max_strategy_allocation_pct=policy.max_strategy_allocation_pct,
        max_symbol_allocation_pct=policy.max_symbol_allocation_pct,
        allowed_symbols=policy.allowed_symbols_json,
        research_only_symbols=policy.research_only_symbols_json,
        min_cash_buffer=policy.min_cash_buffer,
        require_assumption_snapshot=policy.require_assumption_snapshot,
        require_strategy_contract=policy.require_strategy_contract,
        status=policy.status,
        pause_reason=policy.pause_reason,
        updated_at=policy.updated_at,
    )


def _risk_decision_to_view(record: PaperRiskDecisionRecord) -> PaperRiskDecisionView:
    return PaperRiskDecisionView(
        decision_id=record.decision_id,
        wallet_id=record.wallet_id,
        simulated_order_id=record.simulated_order_id,
        accepted=record.accepted,
        action=record.action,
        reason_code=record.reason_code,
        reason=record.reason,
        checked_rules=record.checked_rules_json,
        breached_rules=record.breached_rules_json,
        wallet_snapshot=record.wallet_snapshot_json,
        order_snapshot=record.order_snapshot_json,
        policy_snapshot=record.policy_snapshot_json,
        created_at=record.created_at,
        paper_only=record.paper_only,
    )


def _wallet_snapshot(wallet: PaperWalletRecord) -> dict[str, object]:
    return {
        "wallet_id": wallet.wallet_id,
        "status": wallet.status,
        "cash_balance": wallet.cash_balance,
        "reserved_cash": wallet.reserved_cash,
        "realized_pnl": wallet.realized_pnl,
        "equity": wallet.equity,
        "currency": wallet.currency,
        "paper_only": True,
    }


def _get_or_create_risk_policy(session: Session, wallet: PaperWalletRecord) -> PaperRiskPolicyRecord:
    policy = session.exec(
        select(PaperRiskPolicyRecord).where(PaperRiskPolicyRecord.policy_id == DEFAULT_RISK_POLICY_ID)
    ).first()
    if policy is not None:
        return policy
    policy = PaperRiskPolicyRecord(
        policy_id=DEFAULT_RISK_POLICY_ID,
        wallet_id=wallet.wallet_id,
        allowed_symbols_json=sorted(TRADER_FACING_SYMBOLS),
        research_only_symbols_json=sorted(RESEARCH_ONLY_ORDER_SYMBOLS),
        updated_at=naive_utc_now(),
    )
    session.add(policy)
    session.commit()
    session.refresh(policy)
    return policy


def _next_sequence(session: Session, wallet_id: str) -> int:
    latest = session.exec(
        select(PaperLedgerTransactionRecord)
        .where(PaperLedgerTransactionRecord.wallet_id == wallet_id)
        .order_by(desc(PaperLedgerTransactionRecord.sequence_number))
    ).first()
    return 1 if latest is None else latest.sequence_number + 1


def _recalculate_equity(wallet: PaperWalletRecord) -> None:
    wallet.equity = wallet.cash_balance + wallet.reserved_cash + wallet.unrealized_pnl
    wallet.updated_at = naive_utc_now()


def _append_ledger(
    session: Session,
    wallet: PaperWalletRecord,
    transaction_type: str,
    *,
    symbol: str | None = None,
    strategy_key: str | None = None,
    backtest_run_id: str | None = None,
    paper_trade_id: str | None = None,
    simulated_order_id: str | None = None,
    quantity: float = 0.0,
    price: float = 0.0,
    notional: float = 0.0,
    fee: float = 0.0,
    cash_delta: float = 0.0,
    reserved_delta: float = 0.0,
    realized_pnl_delta: float = 0.0,
    reason: str = "",
    assumption_snapshot: dict[str, object] | None = None,
) -> PaperLedgerTransactionRecord:
    wallet.cash_balance = round(wallet.cash_balance + cash_delta, 8)
    wallet.reserved_cash = round(wallet.reserved_cash + reserved_delta, 8)
    wallet.realized_pnl = round(wallet.realized_pnl + realized_pnl_delta, 8)
    _recalculate_equity(wallet)
    sequence_number = _next_sequence(session, wallet.wallet_id)
    audit_ref = f"paper-ledger:{wallet.wallet_id}:{sequence_number}"
    record = PaperLedgerTransactionRecord(
        transaction_id=f"pltx_{uuid4().hex}",
        wallet_id=wallet.wallet_id,
        sequence_number=sequence_number,
        timestamp=naive_utc_now(),
        transaction_type=transaction_type,
        symbol=symbol,
        strategy_key=strategy_key,
        backtest_run_id=backtest_run_id,
        paper_trade_id=paper_trade_id,
        simulated_order_id=simulated_order_id,
        quantity=quantity,
        price=price,
        notional=notional,
        fee=fee,
        cash_delta=cash_delta,
        reserved_delta=reserved_delta,
        realized_pnl_delta=realized_pnl_delta,
        resulting_cash_balance=wallet.cash_balance,
        resulting_reserved_cash=wallet.reserved_cash,
        resulting_equity=wallet.equity,
        reason=reason,
        assumption_snapshot_json=assumption_snapshot or {},
        audit_ref=audit_ref,
        immutable=True,
    )
    session.add(wallet)
    session.add(record)
    return record


def get_default_paper_wallet(session: Session) -> PaperWalletView:
    _ensure_paper_wallet_tables()
    return _wallet_to_view(_get_or_create_default_wallet(session))


def _get_or_create_default_wallet(session: Session) -> PaperWalletRecord:
    _ensure_paper_wallet_tables()
    wallet = session.exec(select(PaperWalletRecord).where(PaperWalletRecord.wallet_id == DEFAULT_WALLET_ID)).first()
    if wallet is not None:
        return wallet

    starting_balance = float(get_settings().paper_account_size)
    now = naive_utc_now()
    wallet = PaperWalletRecord(
        wallet_id=DEFAULT_WALLET_ID,
        account_label="Default paper wallet",
        currency="USD",
        starting_balance=starting_balance,
        cash_balance=starting_balance,
        reserved_cash=0.0,
        realized_pnl=0.0,
        unrealized_pnl=0.0,
        equity=starting_balance,
        status="active",
        created_at=now,
        updated_at=now,
    )
    session.add(wallet)
    session.flush()
    _append_ledger(
        session,
        wallet,
        "wallet_opened",
        reason="Opened deterministic paper-only wallet with configured starting balance.",
        assumption_snapshot=default_assumption_snapshot(),
    )
    session.commit()
    session.refresh(wallet)
    return wallet


def list_paper_ledger(session: Session, limit: int = 100) -> list[PaperLedgerTransactionView]:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    records = session.exec(
        select(PaperLedgerTransactionRecord)
        .where(PaperLedgerTransactionRecord.wallet_id == wallet.wallet_id)
        .order_by(desc(PaperLedgerTransactionRecord.sequence_number))
        .limit(limit)
    ).all()
    return [_ledger_to_view(record) for record in records]


def list_simulated_orders(session: Session, limit: int = 100) -> list[SimulatedOrderView]:
    _ensure_paper_wallet_tables()
    _get_or_create_default_wallet(session)
    records = session.exec(
        select(SimulatedOrderRecord).order_by(desc(SimulatedOrderRecord.created_at)).limit(limit)
    ).all()
    return [_order_to_view(record) for record in records]


def get_paper_risk_policy(session: Session) -> PaperRiskPolicyView:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    policy = _get_or_create_risk_policy(session, wallet)
    return _policy_to_view(policy)


def list_paper_risk_decisions(session: Session, limit: int = 100) -> list[PaperRiskDecisionView]:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    records = session.exec(
        select(PaperRiskDecisionRecord)
        .where(PaperRiskDecisionRecord.wallet_id == wallet.wallet_id)
        .order_by(desc(PaperRiskDecisionRecord.created_at))
        .limit(limit)
    ).all()
    return [_risk_decision_to_view(record) for record in records]


def _wallet_ledger_records(session: Session, wallet_id: str) -> list[PaperLedgerTransactionRecord]:
    return session.exec(
        select(PaperLedgerTransactionRecord)
        .where(PaperLedgerTransactionRecord.wallet_id == wallet_id)
        .order_by(PaperLedgerTransactionRecord.sequence_number)
    ).all()


def _wallet_order_records(session: Session, wallet_id: str) -> list[SimulatedOrderRecord]:
    return session.exec(
        select(SimulatedOrderRecord)
        .where(SimulatedOrderRecord.wallet_id == wallet_id)
        .order_by(SimulatedOrderRecord.created_at)
    ).all()


def _wallet_decision_records(session: Session, wallet_id: str) -> list[PaperRiskDecisionRecord]:
    return session.exec(
        select(PaperRiskDecisionRecord)
        .where(PaperRiskDecisionRecord.wallet_id == wallet_id)
        .order_by(PaperRiskDecisionRecord.created_at)
    ).all()


def paper_equity_curve(session: Session) -> list[PaperEquityCurvePointView]:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    realized_pnl = 0.0
    points: list[PaperEquityCurvePointView] = []
    for row in _wallet_ledger_records(session, wallet.wallet_id):
        realized_pnl = round(realized_pnl + float(row.realized_pnl_delta or 0.0), 8)
        points.append(
            PaperEquityCurvePointView(
                timestamp=row.timestamp,
                sequence_number=row.sequence_number,
                cash_balance=row.resulting_cash_balance,
                reserved_cash=row.resulting_reserved_cash,
                realized_pnl=realized_pnl,
                equity=row.resulting_equity,
                unrealized_pnl_available=False,
                paper_only=True,
            )
        )
    return points


def _order_notional(order: SimulatedOrderRecord) -> float:
    price = order.fill_price if order.fill_price is not None else order.requested_price
    return round(max(float(price or 0.0), 0.0) * max(float(order.quantity or 0.0), 0.0), 8)


def paper_performance_summary(session: Session) -> PaperPerformanceSummaryView:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    ledgers = _wallet_ledger_records(session, wallet.wallet_id)
    orders = _wallet_order_records(session, wallet.wallet_id)
    decisions = _wallet_decision_records(session, wallet.wallet_id)
    order_status_counts = Counter(order.status for order in orders)
    filled_orders = order_status_counts.get("filled", 0)
    rejected_orders = order_status_counts.get("rejected", 0)
    cancelled_orders = order_status_counts.get("cancelled", 0)
    total_orders = len(orders)
    accepted_count = sum(1 for order in orders if order.status in {"accepted", "filled"})
    fees_paid = round(sum(float(row.fee or 0.0) for row in ledgers if row.transaction_type == "fee"), 8)
    gross_notional = round(
        sum(float(row.notional or 0.0) for row in ledgers if row.transaction_type in {"simulated_buy", "simulated_sell"}),
        8,
    )
    net_cash_flow = round(sum(float(row.cash_delta or 0.0) for row in ledgers), 8)
    orders_by_symbol = Counter(order.symbol for order in orders)
    orders_by_strategy = Counter(order.strategy_key or "manual_simulation" for order in orders)
    rejected_decisions = [decision for decision in decisions if not decision.accepted]
    warnings = [
        "Unrealized PnL is unavailable until inventory and mark-to-market accounting are implemented.",
        "Largest single gain/loss are unavailable because Phase 9D does not yet close inventory-linked positions.",
        "Performance is paper-only and derived from deterministic simulated order and ledger records.",
    ]
    return PaperPerformanceSummaryView(
        wallet_id=wallet.wallet_id,
        account_label=wallet.account_label,
        currency=wallet.currency,
        starting_balance=wallet.starting_balance,
        cash_balance=wallet.cash_balance,
        reserved_cash=wallet.reserved_cash,
        realized_pnl=wallet.realized_pnl,
        realized_pnl_pct=round((wallet.realized_pnl / wallet.starting_balance * 100.0) if wallet.starting_balance else 0.0, 8),
        equity=wallet.equity,
        unrealized_pnl_available=False,
        total_orders=total_orders,
        filled_orders=filled_orders,
        rejected_orders=rejected_orders,
        cancelled_orders=cancelled_orders,
        acceptance_rate=round((accepted_count / total_orders * 100.0) if total_orders else 0.0, 8),
        rejection_rate=round((rejected_orders / total_orders * 100.0) if total_orders else 0.0, 8),
        fees_paid=fees_paid,
        gross_notional_traded=gross_notional,
        net_cash_flow=net_cash_flow,
        largest_single_loss=None,
        largest_single_gain=None,
        risk_rejections_by_reason=dict(Counter(decision.reason_code for decision in rejected_decisions)),
        orders_by_symbol=dict(orders_by_symbol),
        orders_by_strategy=dict(orders_by_strategy),
        latest_risk_decisions=[_risk_decision_to_view(record) for record in sorted(decisions, key=lambda row: row.created_at, reverse=True)[:5]],
        performance_warnings=warnings,
        generated_at=naive_utc_now(),
        paper_only=True,
    )


def paper_rejection_analysis(session: Session) -> list[PaperRejectionAnalysisItemView]:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    orders_by_id = {order.simulated_order_id: order for order in _wallet_order_records(session, wallet.wallet_id)}
    rejected_decisions = [decision for decision in _wallet_decision_records(session, wallet.wallet_id) if not decision.accepted]
    grouped: dict[str, list[PaperRejectionDetailView]] = defaultdict(list)
    for decision in rejected_decisions:
        order = orders_by_id.get(decision.simulated_order_id or "")
        order_snapshot = decision.order_snapshot_json or {}
        symbol_value = order_snapshot.get("symbol") or (order.symbol if order else "")
        strategy_value = order_snapshot.get("strategy_key") or (order.strategy_key if order else None)
        breached = ", ".join(decision.breached_rules_json)
        detail = PaperRejectionDetailView(
            simulated_order_id=decision.simulated_order_id,
            decision_id=decision.decision_id,
            symbol=str(symbol_value or "unknown"),
            strategy_key=str(strategy_value) if strategy_value else None,
            reason_code=decision.reason_code,
            rejection_reason=decision.reason,
            notional=float(order_snapshot.get("estimated_notional") or (_order_notional(order) if order else 0.0)),
            created_at=decision.created_at,
            policy_rule=breached,
            paper_only=True,
        )
        grouped[decision.reason_code].append(detail)
    analysis: list[PaperRejectionAnalysisItemView] = []
    for reason_code, details in grouped.items():
        ordered = sorted(details, key=lambda row: row.created_at, reverse=True)
        analysis.append(
            PaperRejectionAnalysisItemView(
                reason_code=reason_code,
                count=len(ordered),
                latest_reason=ordered[0].rejection_reason,
                symbols=sorted({detail.symbol for detail in ordered if detail.symbol}),
                policy_rules=sorted({rule for detail in ordered for rule in [detail.policy_rule] if rule}),
                latest_at=ordered[0].created_at,
                details=ordered[:10],
                paper_only=True,
            )
        )
    return sorted(analysis, key=lambda row: (row.count, row.latest_at or naive_utc_now()), reverse=True)


def paper_review_queue(session: Session) -> list[PaperReviewQueueItemView]:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    policy = _get_or_create_risk_policy(session, wallet)
    items: list[PaperReviewQueueItemView] = []
    rejected_analysis = paper_rejection_analysis(session)
    for group in rejected_analysis:
        severity = "critical" if group.reason_code in {"policy_paused", "wallet_paused", "max_daily_loss", "max_drawdown"} else "warning"
        for detail in group.details[:3]:
            items.append(
                PaperReviewQueueItemView(
                    review_id=f"prq_{detail.decision_id or detail.simulated_order_id}",
                    source_type="risk_decision",
                    source_id=detail.decision_id or detail.simulated_order_id or group.reason_code,
                    severity=severity,
                    status="open",
                    title=f"Review paper rejection: {group.reason_code}",
                    reason=detail.rejection_reason,
                    symbol=detail.symbol,
                    strategy_key=detail.strategy_key,
                    created_at=detail.created_at,
                    resolved_at=None,
                    paper_only=True,
                )
            )
        if group.count >= 2:
            latest_at = group.latest_at or naive_utc_now()
            items.append(
                PaperReviewQueueItemView(
                    review_id=f"prq_repeat_{group.reason_code}",
                    source_type="risk_decision",
                    source_id=group.reason_code,
                    severity="warning",
                    status="open",
                    title=f"Repeated paper rejection: {group.reason_code}",
                    reason=f"{group.count} paper-only simulated orders were rejected for this reason.",
                    symbol=", ".join(group.symbols) if group.symbols else None,
                    strategy_key=None,
                    created_at=latest_at,
                    resolved_at=None,
                    paper_only=True,
                )
            )
    if policy.status != "active":
        items.append(
            PaperReviewQueueItemView(
                review_id=f"prq_policy_{policy.policy_id}",
                source_type="risk_policy",
                source_id=policy.policy_id,
                severity="critical",
                status="open",
                title="Paper risk policy is paused",
                reason=policy.pause_reason or "Manual paper risk pause requires review.",
                symbol=None,
                strategy_key=None,
                created_at=policy.updated_at,
                resolved_at=None,
                paper_only=True,
            )
        )
    return sorted(items, key=lambda item: item.created_at, reverse=True)


def pause_paper_risk_policy(session: Session, payload: PaperRiskPolicyPauseRequest) -> PaperRiskPolicyView:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    policy = _get_or_create_risk_policy(session, wallet)
    policy.status = "paused"
    policy.pause_reason = payload.reason or "Manual paper risk pause."
    policy.updated_at = naive_utc_now()
    session.add(policy)
    session.commit()
    session.refresh(policy)
    return _policy_to_view(policy)


def resume_paper_risk_policy(session: Session, payload: PaperRiskPolicyResumeRequest) -> PaperRiskPolicyView:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    policy = _get_or_create_risk_policy(session, wallet)
    policy.status = "active"
    policy.pause_reason = ""
    policy.updated_at = naive_utc_now()
    session.add(policy)
    session.commit()
    session.refresh(policy)
    return _policy_to_view(policy)


def _validated_assumptions(payload: SimulatedOrderCreateRequest) -> tuple[dict[str, object], str | None]:
    if payload.assumption_snapshot is None:
        return {}, "Missing paper simulation assumptions: explicit assumption_snapshot is required."
    missing = sorted(REQUIRED_ASSUMPTION_FIELDS - set(payload.assumption_snapshot.keys()))
    if missing:
        return payload.assumption_snapshot, f"Missing paper simulation assumptions: {', '.join(missing)}."
    return payload.assumption_snapshot, None


def _validated_symbol(symbol: str) -> tuple[str, str | None]:
    requested = symbol.upper()
    if requested in RESEARCH_ONLY_ORDER_SYMBOLS:
        return requested, f"{requested} is research context only; use the trader-facing paper symbol USOUSD or XAGUSD where applicable."
    if requested not in TRADER_FACING_SYMBOLS:
        canonical = resolve_symbol(requested)
        mapping = instrument_mapping_view(canonical, requested_symbol=requested)
        if requested != mapping.trader_symbol and mapping.trader_symbol in TRADER_FACING_SYMBOLS:
            return requested, f"{requested} is not the trader-facing paper symbol; use {mapping.trader_symbol}."
        if requested not in TRADER_FACING_SYMBOLS:
            return requested, f"{requested} is not enabled for Phase 9D paper simulation."
    return requested, None


def _open_order_count(session: Session, wallet_id: str) -> int:
    return len(
        session.exec(
            select(SimulatedOrderRecord).where(
                SimulatedOrderRecord.wallet_id == wallet_id,
                SimulatedOrderRecord.status.in_(["created", "accepted"]),
            )
        ).all()
    )


def _ledger_notional(
    session: Session,
    wallet_id: str,
    *,
    symbol: str | None = None,
    strategy_key: str | None = None,
) -> float:
    rows = session.exec(
        select(PaperLedgerTransactionRecord).where(PaperLedgerTransactionRecord.wallet_id == wallet_id)
    ).all()
    total = 0.0
    for row in rows:
        if row.transaction_type != "simulated_buy":
            continue
        if symbol is not None and row.symbol != symbol:
            continue
        if strategy_key is not None and row.strategy_key != strategy_key:
            continue
        total += max(float(row.notional or 0.0), 0.0)
    return round(total, 8)


def _strategy_contract_available(session: Session, strategy_key: str | None) -> bool:
    if not strategy_key:
        return True
    try:
        get_registry_entry(session, strategy_key)
    except Exception:
        return False
    return True


def _record_risk_decision(
    session: Session,
    wallet: PaperWalletRecord,
    policy: PaperRiskPolicyRecord,
    *,
    simulated_order_id: str,
    accepted: bool,
    action: str,
    reason_code: str,
    reason: str,
    checked_rules: list[str],
    breached_rules: list[str],
    order_snapshot: dict[str, object],
) -> PaperRiskDecisionRecord:
    record = PaperRiskDecisionRecord(
        decision_id=f"prd_{uuid4().hex}",
        wallet_id=wallet.wallet_id,
        simulated_order_id=simulated_order_id,
        accepted=accepted,
        action=action,
        reason_code=reason_code,
        reason=reason,
        checked_rules_json=checked_rules,
        breached_rules_json=breached_rules,
        wallet_snapshot_json=_wallet_snapshot(wallet),
        order_snapshot_json=order_snapshot,
        policy_snapshot_json=_policy_snapshot(policy),
        created_at=naive_utc_now(),
        paper_only=True,
    )
    session.add(record)
    session.flush()
    return record


def _evaluate_order_risk(
    session: Session,
    wallet: PaperWalletRecord,
    policy: PaperRiskPolicyRecord,
    payload: SimulatedOrderCreateRequest,
    *,
    simulated_order_id: str,
    symbol: str,
    symbol_error: str | None,
    assumptions: dict[str, object],
    assumption_error: str | None,
    side: str,
    order_type: str,
    quantity: float,
    requested_price: float,
    estimated_notional: float,
    estimated_fee: float,
) -> PaperRiskDecisionRecord:
    checked_rules = [
        "paper_only_policy_status",
        "wallet_status",
        "trader_facing_symbol",
        "assumption_snapshot",
        "side_and_order_type",
        "positive_quantity_and_price",
        "strategy_contract_reference",
        "max_order_notional",
        "max_open_orders",
        "sufficient_cash_and_buffer",
        "daily_loss_limit",
        "drawdown_limit",
        "symbol_exposure_limit",
        "strategy_allocation_limit",
    ]
    order_snapshot = {
        "simulated_order_id": simulated_order_id,
        "symbol": symbol,
        "side": side,
        "order_type": order_type,
        "quantity": max(quantity, 0.0),
        "requested_price": max(requested_price, 0.0),
        "estimated_notional": max(estimated_notional, 0.0),
        "estimated_fee": max(estimated_fee, 0.0),
        "strategy_key": payload.strategy_key,
        "source": payload.source,
        "paper_only": True,
    }

    def reject(reason_code: str, reason: str, *breached_rules: str) -> PaperRiskDecisionRecord:
        return _record_risk_decision(
            session,
            wallet,
            policy,
            simulated_order_id=simulated_order_id,
            accepted=False,
            action="pause_required" if reason_code in {"policy_paused", "wallet_paused"} else "reject",
            reason_code=reason_code,
            reason=reason,
            checked_rules=checked_rules,
            breached_rules=list(breached_rules),
            order_snapshot=order_snapshot,
        )

    if policy.status != "active":
        return reject("policy_paused", f"Paper risk policy is {policy.status}: {policy.pause_reason}", "paper_only_policy_status")
    if wallet.status != "active":
        return reject("wallet_paused", f"Paper wallet is {wallet.status}.", "wallet_status")
    if symbol_error:
        return reject("symbol_not_trader_facing", symbol_error, "trader_facing_symbol")
    if policy.require_assumption_snapshot and assumption_error:
        return reject("missing_assumptions", assumption_error, "assumption_snapshot")
    if side not in {"buy", "sell"}:
        return reject("invalid_side", "Side must be buy or sell.", "side_and_order_type")
    if order_type not in {"market", "limit"}:
        return reject("invalid_order_type", "Order type must be market or limit.", "side_and_order_type")
    if quantity <= 0 or requested_price <= 0:
        return reject("invalid_quantity_or_price", "Quantity and requested price must be positive.", "positive_quantity_and_price")
    if order_type == "limit" and (payload.limit_price is None or payload.limit_price <= 0):
        return reject("invalid_limit_price", "Limit paper orders require a positive limit price.", "side_and_order_type")
    if policy.require_strategy_contract and payload.strategy_key and not _strategy_contract_available(session, payload.strategy_key):
        return reject(
            "missing_strategy_contract",
            f"Strategy contract {payload.strategy_key} is not available for paper risk evaluation.",
            "strategy_contract_reference",
        )
    if estimated_notional > policy.max_order_notional:
        return reject(
            "max_order_notional",
            f"Estimated paper order notional {estimated_notional:.2f} exceeds policy max {policy.max_order_notional:.2f}.",
            "max_order_notional",
        )
    if _open_order_count(session, wallet.wallet_id) >= policy.max_open_orders:
        return reject("max_open_orders", "Paper risk policy max open orders reached.", "max_open_orders")
    total_cost = estimated_notional + estimated_fee if side == "buy" else 0.0
    if side == "buy" and total_cost > wallet.cash_balance - policy.min_cash_buffer:
        return reject(
            "insufficient_cash",
            "Insufficient paper cash after required risk cash buffer.",
            "sufficient_cash_and_buffer",
        )
    if wallet.realized_pnl <= -abs(policy.max_daily_loss):
        return reject("max_daily_loss", "Paper realized PnL is beyond the policy daily loss limit.", "daily_loss_limit")
    drawdown_pct = 0.0
    if wallet.starting_balance > 0:
        drawdown_pct = max((wallet.starting_balance - wallet.equity) / wallet.starting_balance * 100.0, 0.0)
    if drawdown_pct > policy.max_drawdown_pct:
        return reject("max_drawdown", "Paper wallet drawdown exceeds the risk policy limit.", "drawdown_limit")
    projected_symbol_notional = _ledger_notional(session, wallet.wallet_id, symbol=symbol) + max(estimated_notional, 0.0)
    if projected_symbol_notional > policy.max_position_notional_per_symbol:
        return reject("max_symbol_notional", "Projected paper symbol exposure exceeds policy limit.", "symbol_exposure_limit")
    if wallet.equity > 0 and (projected_symbol_notional / wallet.equity * 100.0) > policy.max_symbol_allocation_pct:
        return reject("max_symbol_allocation", "Projected paper symbol allocation exceeds policy limit.", "symbol_exposure_limit")
    if payload.strategy_key:
        projected_strategy_notional = (
            _ledger_notional(session, wallet.wallet_id, strategy_key=payload.strategy_key) + max(estimated_notional, 0.0)
        )
        if wallet.equity > 0 and (projected_strategy_notional / wallet.equity * 100.0) > policy.max_strategy_allocation_pct:
            return reject(
                "max_strategy_allocation",
                "Projected paper strategy allocation exceeds policy limit.",
                "strategy_allocation_limit",
            )

    return _record_risk_decision(
        session,
        wallet,
        policy,
        simulated_order_id=simulated_order_id,
        accepted=True,
        action="accept",
        reason_code="accepted",
        reason="Paper risk governor accepted this manual simulated order.",
        checked_rules=checked_rules,
        breached_rules=[],
        order_snapshot=order_snapshot,
    )


def _reject_order(
    session: Session,
    wallet: PaperWalletRecord,
    payload: SimulatedOrderCreateRequest,
    symbol: str,
    reason: str,
    assumptions: dict[str, object],
    *,
    simulated_order_id: str | None = None,
) -> SimulatedOrderView:
    now = naive_utc_now()
    order = SimulatedOrderRecord(
        simulated_order_id=simulated_order_id or f"pord_{uuid4().hex}",
        wallet_id=wallet.wallet_id,
        strategy_key=payload.strategy_key,
        symbol=symbol,
        side=payload.side.lower(),
        order_type=payload.order_type.lower(),
        quantity=max(float(payload.quantity), 0.0),
        requested_price=max(float(payload.requested_price), 0.0),
        limit_price=payload.limit_price,
        status="rejected",
        rejection_reason=reason,
        slippage_bps=float(assumptions.get("slippage_bps", 0.0) or 0.0),
        spread_bps=float(assumptions.get("spread_bps", 0.0) or 0.0),
        candle_fill_rule=str(assumptions.get("candle_fill_rule", "manual_price_immediate")),
        created_at=now,
        updated_at=now,
        assumption_snapshot_json=assumptions,
        source=payload.source,
        paper_only=True,
    )
    session.add(order)
    session.flush()
    _append_ledger(
        session,
        wallet,
        "order_rejected",
        symbol=symbol,
        strategy_key=payload.strategy_key,
        backtest_run_id=payload.backtest_run_id,
        paper_trade_id=payload.paper_trade_id,
        simulated_order_id=order.simulated_order_id,
        quantity=order.quantity,
        price=order.requested_price,
        reason=reason,
        assumption_snapshot=assumptions,
    )
    session.commit()
    session.refresh(order)
    return _order_to_view(order)


def create_simulated_order(session: Session, payload: SimulatedOrderCreateRequest) -> SimulatedOrderView:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    policy = _get_or_create_risk_policy(session, wallet)
    simulated_order_id = f"pord_{uuid4().hex}"
    symbol, symbol_error = _validated_symbol(payload.symbol)
    assumptions, assumption_error = _validated_assumptions(payload)
    side = payload.side.lower()
    order_type = payload.order_type.lower()
    quantity = float(payload.quantity)
    requested_price = float(payload.requested_price)

    spread_bps = float(assumptions.get("spread_bps", 0.0) or 0.0)
    slippage_bps = float(assumptions.get("slippage_bps", 0.0) or 0.0)
    fee_bps = float(assumptions.get("fee_bps", 0.0) or 0.0)
    fill_adjustment = (spread_bps + slippage_bps) / 10000.0
    fill_price = requested_price * (1 + fill_adjustment if side == "buy" else 1 - fill_adjustment)
    estimated_notional = round(max(fill_price, 0.0) * max(quantity, 0.0), 8)
    estimated_fee = round(estimated_notional * max(fee_bps, 0.0) / 10000.0, 8)

    decision = _evaluate_order_risk(
        session,
        wallet,
        policy,
        payload,
        simulated_order_id=simulated_order_id,
        symbol=symbol,
        symbol_error=symbol_error,
        assumptions=assumptions,
        assumption_error=assumption_error,
        side=side,
        order_type=order_type,
        quantity=quantity,
        requested_price=requested_price,
        estimated_notional=estimated_notional,
        estimated_fee=estimated_fee,
    )
    if not decision.accepted:
        return _reject_order(
            session,
            wallet,
            payload,
            symbol,
            decision.reason,
            assumptions,
            simulated_order_id=simulated_order_id,
        )

    if order_type == "limit":
        limit_fillable = fill_price <= payload.limit_price if side == "buy" else fill_price >= payload.limit_price
        if not limit_fillable:
            return _create_accepted_limit_order(
                session,
                wallet,
                payload,
                symbol,
                assumptions,
                spread_bps,
                slippage_bps,
                simulated_order_id=simulated_order_id,
            )

    notional = round(fill_price * quantity, 8)
    fee = round(notional * fee_bps / 10000.0, 8)
    total_cost = notional + fee
    if side == "buy" and total_cost > wallet.cash_balance:
        return _reject_order(
            session,
            wallet,
            payload,
            symbol,
            "Insufficient paper cash for requested simulated buy.",
            assumptions,
            simulated_order_id=simulated_order_id,
        )

    now = naive_utc_now()
    order = SimulatedOrderRecord(
        simulated_order_id=simulated_order_id,
        wallet_id=wallet.wallet_id,
        strategy_key=payload.strategy_key,
        symbol=symbol,
        side=side,
        order_type=order_type,
        quantity=quantity,
        requested_price=requested_price,
        limit_price=payload.limit_price,
        status="filled",
        fill_price=fill_price,
        fill_quantity=quantity,
        fee=fee,
        slippage_bps=slippage_bps,
        spread_bps=spread_bps,
        candle_fill_rule=str(assumptions.get("candle_fill_rule", "manual_price_immediate")),
        created_at=now,
        updated_at=now,
        filled_at=now,
        assumption_snapshot_json=assumptions,
        source=payload.source,
        paper_only=True,
    )
    session.add(order)
    session.flush()
    if side == "buy":
        _append_ledger(
            session,
            wallet,
            "reserve_cash",
            symbol=symbol,
            strategy_key=payload.strategy_key,
            backtest_run_id=payload.backtest_run_id,
            paper_trade_id=payload.paper_trade_id,
            simulated_order_id=order.simulated_order_id,
            quantity=quantity,
            price=fill_price,
            notional=notional,
            reserved_delta=total_cost,
            reason="Reserved paper cash for deterministic simulated buy.",
            assumption_snapshot=assumptions,
        )
        _append_ledger(
            session,
            wallet,
            "simulated_buy",
            symbol=symbol,
            strategy_key=payload.strategy_key,
            backtest_run_id=payload.backtest_run_id,
            paper_trade_id=payload.paper_trade_id,
            simulated_order_id=order.simulated_order_id,
            quantity=quantity,
            price=fill_price,
            notional=notional,
            cash_delta=-notional,
            reserved_delta=-notional,
            reason="Filled deterministic paper buy simulation.",
            assumption_snapshot=assumptions,
        )
        _append_ledger(
            session,
            wallet,
            "fee",
            symbol=symbol,
            strategy_key=payload.strategy_key,
            backtest_run_id=payload.backtest_run_id,
            paper_trade_id=payload.paper_trade_id,
            simulated_order_id=order.simulated_order_id,
            quantity=quantity,
            price=fill_price,
            fee=fee,
            cash_delta=-fee,
            reserved_delta=-fee,
            reason="Applied paper simulation fee assumption.",
            assumption_snapshot=assumptions,
        )
    else:
        _append_ledger(
            session,
            wallet,
            "simulated_sell",
            symbol=symbol,
            strategy_key=payload.strategy_key,
            backtest_run_id=payload.backtest_run_id,
            paper_trade_id=payload.paper_trade_id,
            simulated_order_id=order.simulated_order_id,
            quantity=quantity,
            price=fill_price,
            notional=notional,
            cash_delta=notional,
            reason="Filled deterministic paper sell simulation; inventory accounting arrives in a later phase.",
            assumption_snapshot=assumptions,
        )
        _append_ledger(
            session,
            wallet,
            "fee",
            symbol=symbol,
            strategy_key=payload.strategy_key,
            backtest_run_id=payload.backtest_run_id,
            paper_trade_id=payload.paper_trade_id,
            simulated_order_id=order.simulated_order_id,
            quantity=quantity,
            price=fill_price,
            fee=fee,
            cash_delta=-fee,
            reason="Applied paper simulation fee assumption.",
            assumption_snapshot=assumptions,
        )
    session.commit()
    session.refresh(order)
    return _order_to_view(order)


def _create_accepted_limit_order(
    session: Session,
    wallet: PaperWalletRecord,
    payload: SimulatedOrderCreateRequest,
    symbol: str,
    assumptions: dict[str, object],
    spread_bps: float,
    slippage_bps: float,
    *,
    simulated_order_id: str,
) -> SimulatedOrderView:
    now = naive_utc_now()
    order = SimulatedOrderRecord(
        simulated_order_id=simulated_order_id,
        wallet_id=wallet.wallet_id,
        strategy_key=payload.strategy_key,
        symbol=symbol,
        side=payload.side.lower(),
        order_type="limit",
        quantity=float(payload.quantity),
        requested_price=float(payload.requested_price),
        limit_price=payload.limit_price,
        status="accepted",
        slippage_bps=slippage_bps,
        spread_bps=spread_bps,
        candle_fill_rule=str(assumptions.get("candle_fill_rule", "manual_price_immediate")),
        created_at=now,
        updated_at=now,
        assumption_snapshot_json=assumptions,
        source=payload.source,
        paper_only=True,
    )
    session.add(order)
    session.flush()
    _append_ledger(
        session,
        wallet,
        "reserve_cash" if order.side == "buy" else "release_cash",
        symbol=symbol,
        strategy_key=payload.strategy_key,
        backtest_run_id=payload.backtest_run_id,
        paper_trade_id=payload.paper_trade_id,
        simulated_order_id=order.simulated_order_id,
        quantity=order.quantity,
        price=order.requested_price,
        reason="Accepted unfilled paper limit order for manual simulation review.",
        assumption_snapshot=assumptions,
    )
    session.commit()
    session.refresh(order)
    return _order_to_view(order)


def cancel_simulated_order(session: Session, simulated_order_id: str) -> SimulatedOrderView | None:
    _ensure_paper_wallet_tables()
    wallet = _get_or_create_default_wallet(session)
    order = session.exec(
        select(SimulatedOrderRecord).where(SimulatedOrderRecord.simulated_order_id == simulated_order_id)
    ).first()
    if order is None:
        return None
    if order.status not in {"created", "accepted"}:
        raise ValueError("Only created or accepted paper simulation orders can be cancelled.")
    order.status = "cancelled"
    order.updated_at = naive_utc_now()
    _append_ledger(
        session,
        wallet,
        "order_cancelled",
        symbol=order.symbol,
        strategy_key=order.strategy_key,
        simulated_order_id=order.simulated_order_id,
        quantity=order.quantity,
        price=order.requested_price,
        reason="Cancelled unfilled paper simulation order.",
        assumption_snapshot=order.assumption_snapshot_json,
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    return _order_to_view(order)
