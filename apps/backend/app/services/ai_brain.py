from __future__ import annotations

from collections import Counter
from uuid import uuid4

from sqlalchemy.exc import OperationalError
from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.models.entities import (
    AiBrainOperatorNoteRecord,
    AiBrainQueryRecord,
    BacktestResult,
    PaperLedgerTransactionRecord,
    PaperRiskDecisionRecord,
    PaperRiskPolicyRecord,
    PaperWalletRecord,
    SignalRecord,
    SimulatedOrderRecord,
    StrategyRegistryEntry,
)
from app.models.schemas import (
    AIBrainEvidenceCardView,
    AIBrainHistoryDetailView,
    AIBrainHistoryItemView,
    AIBrainOperatorNoteView,
    AIBrainResponseView,
)
from app.services.availability import availability_status
from app.services.paper_wallet import _ensure_paper_wallet_tables


def _canonical_symbol(symbol: str) -> str:
    requested = symbol.upper()
    return {"WTI": "USOUSD", "SILVER": "XAGUSD", "GOLD": "XAUUSD"}.get(requested, requested)


def _first_detail(values: list[str]) -> list[str]:
    return [value for value in values if value][:4]


def _first_or_none(session: Session, statement):
    try:
        return session.exec(statement).first()
    except OperationalError:
        return None


def _all_or_empty(session: Session, statement) -> list:
    try:
        return list(session.exec(statement).all())
    except OperationalError:
        return []


def _audit_id() -> str:
    return f"ai_brain_{uuid4().hex[:16]}"


def _note_id() -> str:
    return f"ai_brain_note_{uuid4().hex[:16]}"


def _ensure_ai_brain_tables() -> None:
    from app.core.database import init_db

    init_db()


def _note_count(session: Session, audit_id: str) -> int:
    return len(_all_or_empty(session, select(AiBrainOperatorNoteRecord).where(AiBrainOperatorNoteRecord.ai_brain_query_id == audit_id, AiBrainOperatorNoteRecord.archived == False)))


def _history_item_view(session: Session, row: AiBrainQueryRecord) -> AIBrainHistoryItemView:
    return AIBrainHistoryItemView(
        audit_id=row.audit_id,
        created_at=row.created_at,
        question=row.question,
        answer_summary=row.answer_summary,
        mode=row.mode,
        paper_only=row.paper_only,
        created_order_count=row.created_order_count,
        created_ledger_count=row.created_ledger_count,
        created_risk_decision_count=row.created_risk_decision_count,
        note_count=_note_count(session, row.audit_id),
        archived=row.archived,
    )


def _history_detail_view(session: Session, row: AiBrainQueryRecord) -> AIBrainHistoryDetailView:
    base = _history_item_view(session, row).model_dump()
    return AIBrainHistoryDetailView(
        **base,
        evidence_snapshot=row.evidence_snapshot_json,
        availability_snapshot=row.availability_snapshot_json,
        wallet_snapshot=row.wallet_snapshot_json,
        risk_snapshot=row.risk_snapshot_json,
        performance_snapshot=row.performance_snapshot_json,
        review_snapshot=row.review_snapshot_json,
        uncertainty_notes=row.uncertainty_notes_json,
        degraded_notes=row.degraded_notes_json,
        source_route=row.source_route,
        operator_label=row.operator_label,
    )


def _note_view(row: AiBrainOperatorNoteRecord) -> AIBrainOperatorNoteView:
    return AIBrainOperatorNoteView(
        note_id=row.note_id,
        ai_brain_query_id=row.ai_brain_query_id,
        created_at=row.created_at,
        note=row.note,
        status=row.status,
        paper_only=row.paper_only,
        created_by=row.created_by,
        archived=row.archived,
    )


def list_ai_brain_history(session: Session, limit: int = 20) -> list[AIBrainHistoryItemView]:
    _ensure_ai_brain_tables()
    rows = _all_or_empty(
        session,
        select(AiBrainQueryRecord)
        .where(AiBrainQueryRecord.archived == False)
        .order_by(desc(AiBrainQueryRecord.created_at))
        .limit(max(1, min(limit, 100))),
    )
    return [_history_item_view(session, row) for row in rows]


def get_ai_brain_history_detail(session: Session, audit_id: str) -> AIBrainHistoryDetailView | None:
    _ensure_ai_brain_tables()
    row = _first_or_none(
        session,
        select(AiBrainQueryRecord).where(AiBrainQueryRecord.audit_id == audit_id, AiBrainQueryRecord.archived == False),
    )
    return _history_detail_view(session, row) if row else None


def list_ai_brain_notes(session: Session, audit_id: str) -> list[AIBrainOperatorNoteView]:
    _ensure_ai_brain_tables()
    rows = _all_or_empty(
        session,
        select(AiBrainOperatorNoteRecord)
        .where(AiBrainOperatorNoteRecord.ai_brain_query_id == audit_id, AiBrainOperatorNoteRecord.archived == False)
        .order_by(desc(AiBrainOperatorNoteRecord.created_at)),
    )
    return [_note_view(row) for row in rows]


def create_ai_brain_note(session: Session, audit_id: str, note: str, status: str = "observation", created_by: str = "local_operator") -> AIBrainOperatorNoteView | None:
    _ensure_ai_brain_tables()
    audit = _first_or_none(
        session,
        select(AiBrainQueryRecord).where(AiBrainQueryRecord.audit_id == audit_id, AiBrainQueryRecord.archived == False),
    )
    if audit is None:
        return None
    normalized_status = status if status in {"observation", "follow_up", "dismissed", "reviewed"} else "observation"
    row = AiBrainOperatorNoteRecord(
        note_id=_note_id(),
        ai_brain_query_id=audit_id,
        note=note.strip(),
        status=normalized_status,
        created_by=(created_by or "local_operator").strip() or "local_operator",
        paper_only=True,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _note_view(row)


def run_ai_brain_query(session: Session, query: str, symbol: str, timeframe: str) -> AIBrainResponseView:
    """Return a deterministic local cockpit answer without creating paper records."""

    _ensure_ai_brain_tables()
    _ensure_paper_wallet_tables()
    requested_symbol = _canonical_symbol(symbol)
    latest_signal = _first_or_none(
        session,
        select(SignalRecord)
        .where(SignalRecord.symbol.in_([symbol.upper(), requested_symbol]))
        .order_by(desc(SignalRecord.timestamp))
        .limit(1),
    )
    strategies = _all_or_empty(session, select(StrategyRegistryEntry).order_by(StrategyRegistryEntry.name))
    strategy_for_symbol = next((row for row in strategies if row.tradable_symbol == requested_symbol), strategies[0] if strategies else None)
    latest_backtest = _first_or_none(
        session,
        select(BacktestResult)
        .where(BacktestResult.symbol.in_([symbol.upper(), requested_symbol]))
        .order_by(desc(BacktestResult.created_at))
        .limit(1),
    )
    wallet = _first_or_none(session, select(PaperWalletRecord).order_by(PaperWalletRecord.created_at).limit(1))
    orders = _all_or_empty(session, select(SimulatedOrderRecord).order_by(desc(SimulatedOrderRecord.created_at)).limit(50))
    ledgers = _all_or_empty(session, select(PaperLedgerTransactionRecord).order_by(desc(PaperLedgerTransactionRecord.sequence_number)).limit(50))
    policy = _first_or_none(session, select(PaperRiskPolicyRecord).order_by(desc(PaperRiskPolicyRecord.updated_at)).limit(1))
    decisions = _all_or_empty(session, select(PaperRiskDecisionRecord).order_by(desc(PaperRiskDecisionRecord.created_at)).limit(10))

    market_context = (
        f"{requested_symbol} has latest local signal {latest_signal.signal_type} / {latest_signal.direction} "
        f"with score {latest_signal.score:.1f}."
        if latest_signal
        else f"{requested_symbol} has no loaded signal in the local records for this cockpit query."
    )
    if strategy_for_symbol:
        contract = strategy_for_symbol.spec_json.get("contract_metadata", {}) if strategy_for_symbol.spec_json else {}
        deterministic = contract.get("deterministic", "unknown")
        strategy_contract_summary = (
            f"{strategy_for_symbol.name} v{strategy_for_symbol.version} covers {strategy_for_symbol.tradable_symbol} "
            f"on {strategy_for_symbol.timeframe}; deterministic={deterministic}; warmup={strategy_for_symbol.warmup_bars} bars."
        )
    else:
        strategy_contract_summary = "No strategy contract records are loaded yet."

    if latest_backtest:
        assumptions = (latest_backtest.metadata_json or {}).get("assumptions", {})
        validation = (latest_backtest.validation_json or {}).get("validation_metadata", {})
        latest_backtest_assumptions_summary = (
            f"Latest {latest_backtest.strategy_name} backtest is {latest_backtest.status}; "
            f"fee={assumptions.get('fee_bps', latest_backtest.fees_bps)} bps, "
            f"slippage={assumptions.get('slippage_bps', latest_backtest.slippage_bps)} bps, "
            f"no-lookahead={validation.get('no_lookahead', 'unknown')}."
        )
    else:
        latest_backtest_assumptions_summary = "No backtest result is loaded for this symbol; inspect Backtests before relying on strategy history."

    paper_wallet_state = (
        f"{wallet.account_label}: cash {wallet.cash_balance:.2f} {wallet.currency}, "
        f"reserved {wallet.reserved_cash:.2f}, equity {wallet.equity:.2f}, status {wallet.status}."
        if wallet
        else "No paper wallet row exists yet; Wallet can initialize the paper account when opened."
    )
    rejected_decisions = [decision for decision in decisions if not decision.accepted]
    rejection_counts = Counter(decision.reason_code for decision in rejected_decisions)
    risk_policy_decision_summary = (
        f"Risk policy {policy.policy_id} is {policy.status}; recent rejection reasons: {dict(rejection_counts) or 'none'}."
        if policy
        else "No risk policy row exists yet; paper risk policy will initialize with the paper wallet."
    )
    filled_orders = sum(1 for order in orders if order.status == "filled")
    rejected_orders = sum(1 for order in orders if order.status == "rejected")
    performance_review_summary = (
        f"Recent paper orders: {filled_orders} filled, {rejected_orders} rejected. "
        f"Recent ledger rows loaded: {len(ledgers)}. Unrealized PnL remains unavailable until inventory accounting is added."
    )
    suggested_next_inspection = (
        "Inspect risk rejections and the latest Backtests assumptions before creating another manual paper simulation."
        if rejected_orders or rejected_decisions
        else "Inspect Strategy Lab contracts and Backtests assumptions before the next manual paper simulation."
    )
    uncertainty_notes = [
        "This cockpit uses local AI Trader records and deterministic fallback text.",
        "It does not create proposals, simulated orders, ledger rows, or risk decisions.",
    ]
    if not wallet:
        uncertainty_notes.append("Paper wallet state is degraded because no wallet row exists yet.")
    if not latest_backtest:
        uncertainty_notes.append("Backtest context is degraded for the selected symbol.")

    evidence_cards = [
        AIBrainEvidenceCardView(
            title="Market Context",
            status="available" if latest_signal else "degraded",
            summary=market_context,
            details=_first_detail([latest_signal.thesis if latest_signal else "No local signal row matched this symbol."]),
            degraded=latest_signal is None,
        ),
        AIBrainEvidenceCardView(
            title="Strategy Contracts",
            status="available" if strategy_for_symbol else "degraded",
            summary=strategy_contract_summary,
            details=_first_detail([f"{len(strategies)} strategy contracts loaded."]),
            degraded=strategy_for_symbol is None,
        ),
        AIBrainEvidenceCardView(
            title="Backtest Assumptions",
            status="available" if latest_backtest else "degraded",
            summary=latest_backtest_assumptions_summary,
            details=_first_detail([f"Trade count: {latest_backtest.trade_count}" if latest_backtest else "No symbol-specific backtest row found."]),
            degraded=latest_backtest is None,
        ),
        AIBrainEvidenceCardView(
            title="Paper Wallet",
            status="available" if wallet else "degraded",
            summary=paper_wallet_state,
            details=_first_detail([f"{len(orders)} recent simulated order rows loaded.", f"{len(ledgers)} recent ledger rows loaded."]),
            degraded=wallet is None,
        ),
        AIBrainEvidenceCardView(
            title="Risk And Review",
            status="available" if policy else "degraded",
            summary=risk_policy_decision_summary,
            details=_first_detail([performance_review_summary, suggested_next_inspection]),
            degraded=policy is None,
        ),
    ]
    answer = (
        f"Paper/research cockpit read for {requested_symbol}: {market_context} "
        f"{paper_wallet_state} {risk_policy_decision_summary} {suggested_next_inspection}"
    )
    generated_at = naive_utc_now()
    response = AIBrainResponseView(
        audit_id=None,
        generated_at=generated_at,
        query=query,
        symbol=requested_symbol,
        timeframe=timeframe,
        answer=answer,
        market_context=market_context,
        strategy_contract_summary=strategy_contract_summary,
        latest_backtest_assumptions_summary=latest_backtest_assumptions_summary,
        paper_wallet_state=paper_wallet_state,
        risk_policy_decision_summary=risk_policy_decision_summary,
        performance_review_summary=performance_review_summary,
        suggested_next_inspection=suggested_next_inspection,
        uncertainty_notes=uncertainty_notes,
        evidence_cards=evidence_cards,
        warnings=["Paper/research only. The AI Brain query is read-only and creates no paper orders."],
        paper_only=True,
    )
    degraded_notes = [card.summary for card in evidence_cards if card.degraded]
    audit_row = AiBrainQueryRecord(
        audit_id=_audit_id(),
        created_at=generated_at,
        question=query,
        answer_summary=answer[:600],
        mode=response.mode,
        paper_only=True,
        evidence_snapshot_json={"cards": [card.model_dump(mode="json") for card in evidence_cards]},
        availability_snapshot_json=availability_status(session).model_dump(mode="json"),
        wallet_snapshot_json={
            "wallet_id": wallet.wallet_id if wallet else None,
            "account_label": wallet.account_label if wallet else None,
            "cash_balance": wallet.cash_balance if wallet else None,
            "reserved_cash": wallet.reserved_cash if wallet else None,
            "equity": wallet.equity if wallet else None,
            "status": wallet.status if wallet else "unavailable",
        },
        risk_snapshot_json={
            "policy_id": policy.policy_id if policy else None,
            "policy_status": policy.status if policy else "unavailable",
            "recent_decision_count": len(decisions),
            "recent_rejection_reasons": dict(rejection_counts),
        },
        performance_snapshot_json={
            "filled_orders": filled_orders,
            "rejected_orders": rejected_orders,
            "recent_ledger_rows": len(ledgers),
            "unrealized_pnl": "unavailable_without_inventory_accounting",
        },
        review_snapshot_json={
            "suggested_next_inspection": suggested_next_inspection,
            "rejected_decision_count": len(rejected_decisions),
        },
        uncertainty_notes_json=uncertainty_notes,
        degraded_notes_json=degraded_notes,
        created_order_count=0,
        created_ledger_count=0,
        created_risk_decision_count=0,
        source_route="/api/ai-brain/query",
        archived=False,
    )
    session.add(audit_row)
    session.commit()
    response.audit_id = audit_row.audit_id
    return response
