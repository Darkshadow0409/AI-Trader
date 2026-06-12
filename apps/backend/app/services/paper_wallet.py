from __future__ import annotations

from uuid import uuid4

from sqlalchemy.exc import OperationalError
from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.core.database import engine
from app.core.settings import get_settings
from app.models.entities import PaperLedgerTransactionRecord, PaperWalletRecord, SimulatedOrderRecord
from app.models.schemas import (
    PaperLedgerTransactionView,
    PaperWalletView,
    SimulatedOrderCreateRequest,
    SimulatedOrderView,
)
from app.services.market_identity import instrument_mapping_view, resolve_symbol


DEFAULT_WALLET_ID = "paper_wallet_default"
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


def _validated_assumptions(payload: SimulatedOrderCreateRequest) -> tuple[dict[str, object], str | None]:
    if payload.assumption_snapshot is None:
        return default_assumption_snapshot(), None
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


def _reject_order(
    session: Session,
    wallet: PaperWalletRecord,
    payload: SimulatedOrderCreateRequest,
    symbol: str,
    reason: str,
    assumptions: dict[str, object],
) -> SimulatedOrderView:
    now = naive_utc_now()
    order = SimulatedOrderRecord(
        simulated_order_id=f"pord_{uuid4().hex}",
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
    symbol, symbol_error = _validated_symbol(payload.symbol)
    assumptions, assumption_error = _validated_assumptions(payload)
    side = payload.side.lower()
    order_type = payload.order_type.lower()
    quantity = float(payload.quantity)
    requested_price = float(payload.requested_price)

    if wallet.status != "active":
        return _reject_order(session, wallet, payload, symbol, f"Paper wallet is {wallet.status}.", assumptions)
    if symbol_error:
        return _reject_order(session, wallet, payload, symbol, symbol_error, assumptions)
    if assumption_error:
        return _reject_order(session, wallet, payload, symbol, assumption_error, assumptions)
    if side not in {"buy", "sell"}:
        return _reject_order(session, wallet, payload, symbol, "Side must be buy or sell.", assumptions)
    if order_type not in {"market", "limit"}:
        return _reject_order(session, wallet, payload, symbol, "Order type must be market or limit.", assumptions)
    if quantity <= 0 or requested_price <= 0:
        return _reject_order(session, wallet, payload, symbol, "Quantity and requested price must be positive.", assumptions)

    spread_bps = float(assumptions.get("spread_bps", 0.0) or 0.0)
    slippage_bps = float(assumptions.get("slippage_bps", 0.0) or 0.0)
    fee_bps = float(assumptions.get("fee_bps", 0.0) or 0.0)
    fill_adjustment = (spread_bps + slippage_bps) / 10000.0
    fill_price = requested_price * (1 + fill_adjustment if side == "buy" else 1 - fill_adjustment)

    if order_type == "limit":
        if payload.limit_price is None or payload.limit_price <= 0:
            return _reject_order(session, wallet, payload, symbol, "Limit paper orders require a positive limit price.", assumptions)
        limit_fillable = fill_price <= payload.limit_price if side == "buy" else fill_price >= payload.limit_price
        if not limit_fillable:
            return _create_accepted_limit_order(session, wallet, payload, symbol, assumptions, spread_bps, slippage_bps)

    notional = round(fill_price * quantity, 8)
    fee = round(notional * fee_bps / 10000.0, 8)
    total_cost = notional + fee
    if side == "buy" and total_cost > wallet.cash_balance:
        return _reject_order(session, wallet, payload, symbol, "Insufficient paper cash for requested simulated buy.", assumptions)

    now = naive_utc_now()
    order = SimulatedOrderRecord(
        simulated_order_id=f"pord_{uuid4().hex}",
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
) -> SimulatedOrderView:
    now = naive_utc_now()
    order = SimulatedOrderRecord(
        simulated_order_id=f"pord_{uuid4().hex}",
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
