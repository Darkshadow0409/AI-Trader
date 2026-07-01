from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.models.entities import (
    BacktestResult,
    PaperLedgerTransactionRecord,
    PaperLoopProposalRecord,
    PaperLoopRunRecord,
    PaperLoopSafetyEventRecord,
    PaperRiskDecisionRecord,
    SignalRecord,
    SimulatedOrderRecord,
    StrategyRegistryEntry,
)
from app.models.schemas import (
    PaperLoopProposalView,
    PaperLoopRunOnceRequest,
    PaperLoopRunOnceResponseView,
    PaperLoopRunView,
    PaperLoopSafetyEventView,
)
from app.services.market_evidence import market_evidence_snapshot
from app.services.paper_loop_control import get_paper_loop_status
from app.services.paper_wallet import RESEARCH_ONLY_ORDER_SYMBOLS, TRADER_FACING_SYMBOLS, resolve_symbol
from app.strategy_lab.service import _strategy_contract


MAX_CANDIDATES = 5


def _paper_counts(session: Session) -> dict[str, int]:
    return {
        "orders": len(session.exec(select(SimulatedOrderRecord)).all()),
        "ledger": len(session.exec(select(PaperLedgerTransactionRecord)).all()),
        "risk_decisions": len(session.exec(select(PaperRiskDecisionRecord)).all()),
    }


def _proposal_view(record: PaperLoopProposalRecord) -> PaperLoopProposalView:
    return PaperLoopProposalView(
        proposal_id=record.proposal_id,
        run_id=record.run_id,
        created_at=record.created_at,
        symbol=record.symbol,
        timeframe=record.timeframe,
        strategy_key=record.strategy_key,
        side=record.side,
        quantity=record.quantity,
        requested_price=record.requested_price,
        confidence_label=record.confidence_label,
        evidence_quality_label=record.evidence_quality_label,
        source_signal_id=record.source_signal_id,
        market_evidence_snapshot=record.market_evidence_snapshot_json,
        strategy_contract_snapshot=record.strategy_contract_snapshot_json,
        backtest_assumption_snapshot=record.backtest_assumption_snapshot_json,
        ai_brain_audit_id=record.ai_brain_audit_id,
        status=record.status,
        gate_reason=record.gate_reason,
        paper_only=record.paper_only,
        simulated_order_id=record.simulated_order_id,
    )


def _safety_event_view(record: PaperLoopSafetyEventRecord) -> PaperLoopSafetyEventView:
    return PaperLoopSafetyEventView(
        event_id=record.event_id,
        run_id=record.run_id,
        proposal_id=record.proposal_id,
        created_at=record.created_at,
        severity=record.severity,
        event_type=record.event_type,
        reason_code=record.reason_code,
        message=record.message,
        snapshot=record.snapshot_json,
        paper_only=record.paper_only,
    )


def _run_view(
    run: PaperLoopRunRecord,
    proposals: list[PaperLoopProposalRecord] | None = None,
    safety_events: list[PaperLoopSafetyEventRecord] | None = None,
) -> PaperLoopRunView:
    proposal_views = [_proposal_view(proposal) for proposal in proposals or []]
    safety_event_views = [_safety_event_view(event) for event in safety_events or []]
    return PaperLoopRunView(
        run_id=run.run_id,
        created_at=run.created_at,
        completed_at=run.completed_at,
        mode=run.mode,
        status=run.status,
        control_status_snapshot=run.control_status_snapshot_json,
        cycle_limit=run.cycle_limit,
        candidate_count=run.candidate_count,
        proposal_count=run.proposal_count,
        safety_event_count=run.safety_event_count,
        created_by=run.created_by,
        paper_only=run.paper_only,
        summary=run.summary_json,
        proposals=proposal_views,
        safety_events=safety_event_views,
    )


def _new_safety_event(
    *,
    run_id: str,
    proposal_id: str | None = None,
    severity: str = "warning",
    event_type: str = "proposal_gate",
    reason_code: str,
    message: str,
    snapshot: dict[str, Any] | None = None,
) -> PaperLoopSafetyEventRecord:
    return PaperLoopSafetyEventRecord(
        event_id=f"paper_loop_safe_{uuid4().hex}",
        run_id=run_id,
        proposal_id=proposal_id,
        severity=severity,
        event_type=event_type,
        reason_code=reason_code,
        message=message,
        snapshot_json=snapshot or {},
        paper_only=True,
    )


def _latest_strategy_contract(session: Session, strategy_key: str | None, symbol: str) -> dict[str, Any]:
    query = select(StrategyRegistryEntry)
    if strategy_key:
        query = query.where(StrategyRegistryEntry.name == strategy_key)
    else:
        query = query.where(StrategyRegistryEntry.tradable_symbol == symbol)
    entry = session.exec(query.order_by(desc(StrategyRegistryEntry.lifecycle_updated_at), desc(StrategyRegistryEntry.id))).first()
    if entry is None:
        return {}
    return _strategy_contract(entry).model_dump(mode="json")


def _latest_backtest_assumptions(session: Session, strategy_key: str | None, symbol: str) -> dict[str, Any]:
    query = select(BacktestResult).where(BacktestResult.symbol == symbol)
    if strategy_key:
        query = query.where(BacktestResult.strategy_name == strategy_key)
    result = session.exec(query.order_by(desc(BacktestResult.created_at), desc(BacktestResult.id))).first()
    if result is None:
        return {}
    metadata = result.metadata_json or {}
    assumptions = metadata.get("assumptions")
    if isinstance(assumptions, dict):
        return assumptions
    return {
        "status": "unavailable",
        "note": "No explicit Phase 9B assumption snapshot was found for this local backtest result.",
    }


def _latest_signal(session: Session, symbol: str) -> SignalRecord | None:
    return session.exec(
        select(SignalRecord)
        .where(SignalRecord.symbol == symbol)
        .order_by(desc(SignalRecord.timestamp), desc(SignalRecord.id))
    ).first()


def _choose_side(snapshot: dict[str, Any]) -> str:
    quality = str(snapshot.get("data_quality") or "").lower()
    if quality in {"unavailable", "degraded"}:
        return "unavailable"
    trend = str(snapshot.get("trend_summary") or "").lower()
    if "higher" in trend or "up" in trend:
        return "buy"
    if "lower" in trend or "down" in trend:
        return "sell"
    return "hold"


def _record_failed_run(
    session: Session,
    *,
    payload: PaperLoopRunOnceRequest,
    control_snapshot: dict[str, Any],
    reason_code: str,
    message: str,
    status: str = "failed_closed",
) -> PaperLoopRunOnceResponseView:
    before_counts = _paper_counts(session)
    now = naive_utc_now()
    run = PaperLoopRunRecord(
        run_id=f"paper_loop_run_{uuid4().hex}",
        created_at=now,
        completed_at=now,
        mode="manual_run_once",
        status=status,
        control_status_snapshot_json=control_snapshot,
        cycle_limit=1,
        candidate_count=0,
        proposal_count=0,
        safety_event_count=1,
        created_by=payload.created_by.strip() or "local_operator",
        paper_only=True,
        summary_json={
            "reason_code": reason_code,
            "message": message,
            "proposal_only": True,
            "scheduler_allowed": False,
        },
    )
    session.add(run)
    event = _new_safety_event(
        run_id=run.run_id,
        severity="warning",
        event_type="run_gate",
        reason_code=reason_code,
        message=message,
        snapshot={"control_status": control_snapshot},
    )
    session.add(event)
    session.commit()
    session.refresh(run)
    session.refresh(event)
    after_counts = _paper_counts(session)
    return PaperLoopRunOnceResponseView(
        run=_run_view(run, [], [event]),
        proposals=[],
        safety_events=[_safety_event_view(event)],
        created_order_count=after_counts["orders"] - before_counts["orders"],
        created_ledger_count=after_counts["ledger"] - before_counts["ledger"],
        created_risk_decision_count=after_counts["risk_decisions"] - before_counts["risk_decisions"],
        paper_only=True,
    )


def run_paper_loop_once(session: Session, payload: PaperLoopRunOnceRequest) -> PaperLoopRunOnceResponseView:
    if not payload.explicit_confirmation:
        raise ValueError("Explicit confirmation is required for manual proposal-only run-once.")
    symbol = (payload.symbol or "USOUSD").strip().upper()
    timeframe = (payload.timeframe or "1d").strip() or "1d"
    max_candidates = max(1, min(int(payload.max_candidates or 1), MAX_CANDIDATES))
    control = get_paper_loop_status(session)
    control_snapshot = control.model_dump(mode="json")
    if control.status != "enabled":
        return _record_failed_run(
            session,
            payload=payload,
            control_snapshot=control_snapshot,
            reason_code=f"loop_{control.status}",
            message=f"Manual proposal-only run-once is blocked while loop control is {control.status}.",
        )
    if not control.run_once_allowed:
        return _record_failed_run(
            session,
            payload=payload,
            control_snapshot=control_snapshot,
            reason_code="run_once_not_allowed",
            message="Manual proposal-only run-once has not been explicitly allowed by the operator.",
        )

    before_counts = _paper_counts(session)
    now = naive_utc_now()
    run = PaperLoopRunRecord(
        run_id=f"paper_loop_run_{uuid4().hex}",
        created_at=now,
        mode="manual_run_once",
        status="created",
        control_status_snapshot_json=control_snapshot,
        cycle_limit=1,
        candidate_count=1,
        created_by=payload.created_by.strip() or "local_operator",
        paper_only=True,
        summary_json={
            "proposal_only": True,
            "bounded_max_candidates": max_candidates,
            "scheduler_allowed": False,
            "note": "Phase 9M creates proposal evidence only and does not create simulated orders.",
        },
    )
    session.add(run)
    session.flush()

    proposals: list[PaperLoopProposalRecord] = []
    safety_events: list[PaperLoopSafetyEventRecord] = []
    resolved_symbol = symbol if symbol in TRADER_FACING_SYMBOLS or symbol in RESEARCH_ONLY_ORDER_SYMBOLS else resolve_symbol(symbol).upper()
    if resolved_symbol in RESEARCH_ONLY_ORDER_SYMBOLS or symbol in RESEARCH_ONLY_ORDER_SYMBOLS:
        proposal = PaperLoopProposalRecord(
            proposal_id=f"paper_loop_prop_{uuid4().hex}",
            run_id=run.run_id,
            symbol=symbol,
            timeframe=timeframe,
            strategy_key=payload.strategy_key,
            side="unavailable",
            confidence_label="unavailable",
            evidence_quality_label="unavailable",
            status="rejected_by_gate",
            gate_reason=f"{symbol} is research-only and cannot become a trader-facing proposal.",
            paper_only=True,
            simulated_order_id=None,
        )
        session.add(proposal)
        session.flush()
        proposals.append(proposal)
        safety_events.append(
            _new_safety_event(
                run_id=run.run_id,
                proposal_id=proposal.proposal_id,
                severity="critical",
                event_type="proposal_gate",
                reason_code="research_only_symbol",
                message=proposal.gate_reason,
                snapshot={"requested_symbol": symbol, "resolved_symbol": resolved_symbol},
            )
        )
    elif resolved_symbol not in TRADER_FACING_SYMBOLS:
        proposal = PaperLoopProposalRecord(
            proposal_id=f"paper_loop_prop_{uuid4().hex}",
            run_id=run.run_id,
            symbol=symbol,
            timeframe=timeframe,
            strategy_key=payload.strategy_key,
            side="unavailable",
            confidence_label="unavailable",
            evidence_quality_label="unavailable",
            status="rejected_by_gate",
            gate_reason=f"{symbol} is not an allowed trader-facing paper/research symbol.",
            paper_only=True,
            simulated_order_id=None,
        )
        session.add(proposal)
        session.flush()
        proposals.append(proposal)
        safety_events.append(
            _new_safety_event(
                run_id=run.run_id,
                proposal_id=proposal.proposal_id,
                severity="critical",
                event_type="proposal_gate",
                reason_code="unsupported_symbol",
                message=proposal.gate_reason,
                snapshot={"requested_symbol": symbol, "resolved_symbol": resolved_symbol},
            )
        )
    else:
        trader_symbol = resolved_symbol
        evidence = market_evidence_snapshot(session, trader_symbol, timeframe)
        evidence_snapshot = evidence.model_dump(mode="json")
        contract_snapshot = _latest_strategy_contract(session, payload.strategy_key, trader_symbol)
        assumptions_snapshot = _latest_backtest_assumptions(session, payload.strategy_key, trader_symbol)
        signal = _latest_signal(session, trader_symbol)
        missing_inputs = list(evidence_snapshot.get("missing_inputs") or [])
        degraded_notes = list(evidence_snapshot.get("degraded_notes") or [])
        gate_notes: list[str] = []
        if not contract_snapshot:
            gate_notes.append("No deterministic local strategy contract snapshot was available for this proposal.")
        elif contract_snapshot.get("deterministic") is not True:
            gate_notes.append("Strategy contract snapshot is not deterministic.")
        if not assumptions_snapshot:
            gate_notes.append("No local backtest assumption snapshot was available for this proposal.")
        if missing_inputs:
            gate_notes.append("Market evidence is missing inputs: " + ", ".join(missing_inputs[:4]))
        if degraded_notes:
            gate_notes.append("Market evidence is degraded: " + "; ".join(degraded_notes[:2]))
        status = "proposed" if not gate_notes else "skipped"
        side = _choose_side(evidence_snapshot)
        if status == "skipped" and side in {"buy", "sell"}:
            side = "hold"
        proposal = PaperLoopProposalRecord(
            proposal_id=f"paper_loop_prop_{uuid4().hex}",
            run_id=run.run_id,
            symbol=trader_symbol,
            timeframe=timeframe,
            strategy_key=payload.strategy_key,
            side=side,
            quantity=None,
            requested_price=evidence.latest_price,
            confidence_label="low" if status == "proposed" else "unavailable",
            evidence_quality_label=evidence.data_quality,
            source_signal_id=signal.signal_id if signal else None,
            market_evidence_snapshot_json=evidence_snapshot,
            strategy_contract_snapshot_json=contract_snapshot,
            backtest_assumption_snapshot_json=assumptions_snapshot,
            status=status,
            gate_reason="; ".join(gate_notes) if gate_notes else "Proposal evidence generated from local paper/research data only.",
            paper_only=True,
            simulated_order_id=None,
        )
        session.add(proposal)
        session.flush()
        proposals.append(proposal)
        severity = "info" if status == "proposed" else "warning"
        safety_events.append(
            _new_safety_event(
                run_id=run.run_id,
                proposal_id=proposal.proposal_id,
                severity=severity,
                event_type="proposal_evidence",
                reason_code=status,
                message=proposal.gate_reason,
                snapshot={
                    "symbol": trader_symbol,
                    "timeframe": timeframe,
                    "data_quality": evidence.data_quality,
                    "freshness_status": evidence.freshness_status,
                    "proposal_only": True,
                },
            )
        )

    for event in safety_events:
        session.add(event)
    run.completed_at = naive_utc_now()
    run.status = "completed" if proposals else "skipped"
    run.proposal_count = len(proposals)
    run.safety_event_count = len(safety_events)
    run.summary_json = {
        **run.summary_json,
        "candidate_count": run.candidate_count,
        "proposal_count": len(proposals),
        "safety_event_count": len(safety_events),
        "created_order_count": 0,
        "created_ledger_count": 0,
        "created_risk_decision_count": 0,
    }
    session.add(run)
    session.commit()
    session.refresh(run)
    for proposal in proposals:
        session.refresh(proposal)
    for event in safety_events:
        session.refresh(event)
    after_counts = _paper_counts(session)
    return PaperLoopRunOnceResponseView(
        run=_run_view(run, proposals, safety_events),
        proposals=[_proposal_view(proposal) for proposal in proposals],
        safety_events=[_safety_event_view(event) for event in safety_events],
        created_order_count=after_counts["orders"] - before_counts["orders"],
        created_ledger_count=after_counts["ledger"] - before_counts["ledger"],
        created_risk_decision_count=after_counts["risk_decisions"] - before_counts["risk_decisions"],
        paper_only=True,
    )


def list_paper_loop_runs(session: Session, limit: int = 50) -> list[PaperLoopRunView]:
    rows = session.exec(
        select(PaperLoopRunRecord)
        .order_by(desc(PaperLoopRunRecord.created_at), desc(PaperLoopRunRecord.id))
        .limit(max(1, min(limit, 100)))
    ).all()
    return [_run_view(row) for row in rows]


def get_paper_loop_run(session: Session, run_id: str) -> PaperLoopRunView | None:
    run = session.exec(select(PaperLoopRunRecord).where(PaperLoopRunRecord.run_id == run_id)).first()
    if run is None:
        return None
    proposals = session.exec(
        select(PaperLoopProposalRecord)
        .where(PaperLoopProposalRecord.run_id == run_id)
        .order_by(PaperLoopProposalRecord.created_at, PaperLoopProposalRecord.id)
    ).all()
    safety_events = session.exec(
        select(PaperLoopSafetyEventRecord)
        .where(PaperLoopSafetyEventRecord.run_id == run_id)
        .order_by(PaperLoopSafetyEventRecord.created_at, PaperLoopSafetyEventRecord.id)
    ).all()
    return _run_view(run, proposals, safety_events)


def list_paper_loop_proposals(session: Session, limit: int = 50) -> list[PaperLoopProposalView]:
    rows = session.exec(
        select(PaperLoopProposalRecord)
        .order_by(desc(PaperLoopProposalRecord.created_at), desc(PaperLoopProposalRecord.id))
        .limit(max(1, min(limit, 100)))
    ).all()
    return [_proposal_view(row) for row in rows]


def list_paper_loop_safety_events(session: Session, limit: int = 50) -> list[PaperLoopSafetyEventView]:
    rows = session.exec(
        select(PaperLoopSafetyEventRecord)
        .order_by(desc(PaperLoopSafetyEventRecord.created_at), desc(PaperLoopSafetyEventRecord.id))
        .limit(max(1, min(limit, 100)))
    ).all()
    return [_safety_event_view(row) for row in rows]
