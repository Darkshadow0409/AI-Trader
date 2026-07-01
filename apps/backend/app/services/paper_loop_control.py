from __future__ import annotations

from uuid import uuid4

from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.models.entities import PaperLoopControlEventRecord, PaperLoopControlStateRecord
from app.models.schemas import (
    PaperLoopControlActionRequest,
    PaperLoopControlEventView,
    PaperLoopControlStatusView,
)


DEFAULT_CONTROL_ID = "paper_loop_default"
SCHEMA_VERSION = "phase9l.v1"
VALID_STATUSES = {"disabled", "enabled", "paused", "killed"}


def _actor_label(payload: PaperLoopControlActionRequest) -> str:
    return payload.actor_label.strip() or "local_operator"


def _reason(payload: PaperLoopControlActionRequest) -> str:
    return payload.reason.strip()


def _event_view(record: PaperLoopControlEventRecord) -> PaperLoopControlEventView:
    return PaperLoopControlEventView(
        event_id=record.event_id,
        control_id=record.control_id,
        created_at=record.created_at,
        previous_status=record.previous_status,
        next_status=record.next_status,
        action=record.action,
        actor_label=record.actor_label,
        reason=record.reason,
        paper_only=record.paper_only,
    )


def _recent_events(session: Session, control_id: str = DEFAULT_CONTROL_ID, limit: int = 8) -> list[PaperLoopControlEventView]:
    rows = session.exec(
        select(PaperLoopControlEventRecord)
        .where(PaperLoopControlEventRecord.control_id == control_id)
        .order_by(desc(PaperLoopControlEventRecord.created_at), desc(PaperLoopControlEventRecord.id))
        .limit(limit)
    ).all()
    return [_event_view(row) for row in rows]


def _state_view(
    record: PaperLoopControlStateRecord | None,
    session: Session | None = None,
) -> PaperLoopControlStatusView:
    now = naive_utc_now()
    if record is None:
        return PaperLoopControlStatusView(
            control_id=DEFAULT_CONTROL_ID,
            schema_version=SCHEMA_VERSION,
            status="disabled",
            paper_only=True,
            run_once_allowed=False,
            scheduler_allowed=False,
            created_at=now,
            updated_at=now,
            recent_events=[],
        )
    return PaperLoopControlStatusView(
        control_id=record.control_id,
        schema_version=record.schema_version,
        status=record.status,
        paper_only=True,
        run_once_allowed=False,
        scheduler_allowed=False,
        enabled_by=record.enabled_by,
        enabled_at=record.enabled_at,
        disabled_by=record.disabled_by,
        disabled_at=record.disabled_at,
        paused_by=record.paused_by,
        paused_at=record.paused_at,
        pause_reason=record.pause_reason,
        resumed_by=record.resumed_by,
        resumed_at=record.resumed_at,
        killed_by=record.killed_by,
        killed_at=record.killed_at,
        kill_reason=record.kill_reason,
        last_transition_reason=record.last_transition_reason,
        created_at=record.created_at,
        updated_at=record.updated_at,
        recent_events=_recent_events(session, record.control_id) if session is not None else [],
    )


def _get_state(session: Session) -> PaperLoopControlStateRecord | None:
    return session.exec(
        select(PaperLoopControlStateRecord).where(PaperLoopControlStateRecord.control_id == DEFAULT_CONTROL_ID)
    ).first()


def _get_or_create_state(session: Session) -> PaperLoopControlStateRecord:
    row = _get_state(session)
    if row is not None:
        row.paper_only = True
        row.run_once_allowed = False
        row.scheduler_allowed = False
        row.schema_version = SCHEMA_VERSION
        return row
    now = naive_utc_now()
    row = PaperLoopControlStateRecord(
        control_id=DEFAULT_CONTROL_ID,
        schema_version=SCHEMA_VERSION,
        status="disabled",
        paper_only=True,
        run_once_allowed=False,
        scheduler_allowed=False,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.flush()
    return row


def _record_event(
    session: Session,
    *,
    previous_status: str,
    next_status: str,
    action: str,
    actor_label: str,
    reason: str,
) -> None:
    session.add(
        PaperLoopControlEventRecord(
            event_id=f"paper_loop_evt_{uuid4().hex}",
            control_id=DEFAULT_CONTROL_ID,
            previous_status=previous_status,
            next_status=next_status,
            action=action,
            actor_label=actor_label,
            reason=reason,
            paper_only=True,
        )
    )


def _finish_transition(
    session: Session,
    row: PaperLoopControlStateRecord,
    *,
    previous_status: str,
    next_status: str,
    action: str,
    actor_label: str,
    reason: str,
) -> PaperLoopControlStatusView:
    if next_status not in VALID_STATUSES:
        raise ValueError("Unsupported paper loop control status.")
    row.status = next_status
    row.paper_only = True
    row.run_once_allowed = False
    row.scheduler_allowed = False
    row.schema_version = SCHEMA_VERSION
    row.updated_at = naive_utc_now()
    row.last_transition_reason = reason
    _record_event(
        session,
        previous_status=previous_status,
        next_status=next_status,
        action=action,
        actor_label=actor_label,
        reason=reason,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _state_view(row, session)


def get_paper_loop_status(session: Session) -> PaperLoopControlStatusView:
    return _state_view(_get_state(session), session)


def list_paper_loop_events(session: Session, limit: int = 20) -> list[PaperLoopControlEventView]:
    return _recent_events(session, DEFAULT_CONTROL_ID, limit=max(1, min(limit, 100)))


def enable_paper_loop_control(
    session: Session,
    payload: PaperLoopControlActionRequest,
) -> PaperLoopControlStatusView:
    if not payload.confirm_paper_loop_control:
        raise ValueError("Explicit confirmation is required to enable paper loop controls.")
    row = _get_or_create_state(session)
    if row.status == "killed":
        raise ValueError("Killed paper loop control cannot be enabled without a reset endpoint. Reset is not implemented in Phase 9L.")
    previous_status = row.status
    now = naive_utc_now()
    actor = _actor_label(payload)
    reason = _reason(payload) or "Operator enabled disabled-by-default paper loop control state."
    row.enabled_by = actor
    row.enabled_at = now
    return _finish_transition(
        session,
        row,
        previous_status=previous_status,
        next_status="enabled",
        action="enable",
        actor_label=actor,
        reason=reason,
    )


def disable_paper_loop_control(
    session: Session,
    payload: PaperLoopControlActionRequest,
) -> PaperLoopControlStatusView:
    if not payload.confirm_paper_loop_control:
        raise ValueError("Explicit confirmation is required to disable paper loop controls.")
    row = _get_or_create_state(session)
    if row.status == "killed":
        raise ValueError("Killed paper loop control cannot be disabled without a reset endpoint. Reset is not implemented in Phase 9L.")
    previous_status = row.status
    now = naive_utc_now()
    actor = _actor_label(payload)
    reason = _reason(payload) or "Operator disabled paper loop control state."
    row.disabled_by = actor
    row.disabled_at = now
    return _finish_transition(
        session,
        row,
        previous_status=previous_status,
        next_status="disabled",
        action="disable",
        actor_label=actor,
        reason=reason,
    )


def pause_paper_loop_control(
    session: Session,
    payload: PaperLoopControlActionRequest,
) -> PaperLoopControlStatusView:
    reason = _reason(payload)
    if not reason:
        raise ValueError("A pause reason is required for paper loop controls.")
    row = _get_or_create_state(session)
    if row.status == "killed":
        raise ValueError("Killed paper loop control cannot be paused.")
    previous_status = row.status
    now = naive_utc_now()
    actor = _actor_label(payload)
    row.paused_by = actor
    row.paused_at = now
    row.pause_reason = reason
    return _finish_transition(
        session,
        row,
        previous_status=previous_status,
        next_status="paused",
        action="pause",
        actor_label=actor,
        reason=reason,
    )


def resume_paper_loop_control(
    session: Session,
    payload: PaperLoopControlActionRequest,
) -> PaperLoopControlStatusView:
    row = _get_or_create_state(session)
    if row.status == "killed":
        raise ValueError("Killed paper loop control cannot resume.")
    if row.status != "paused":
        raise ValueError("Paper loop control can resume only from paused status.")
    previous_status = row.status
    now = naive_utc_now()
    actor = _actor_label(payload)
    reason = _reason(payload) or "Operator resumed paper loop control state from paused."
    row.resumed_by = actor
    row.resumed_at = now
    return _finish_transition(
        session,
        row,
        previous_status=previous_status,
        next_status="enabled",
        action="resume",
        actor_label=actor,
        reason=reason,
    )


def kill_paper_loop_control(
    session: Session,
    payload: PaperLoopControlActionRequest,
) -> PaperLoopControlStatusView:
    if not payload.confirm_paper_loop_control:
        raise ValueError("Explicit confirmation is required to kill paper loop controls.")
    reason = _reason(payload)
    if not reason:
        raise ValueError("A kill reason is required for paper loop controls.")
    row = _get_or_create_state(session)
    previous_status = row.status
    now = naive_utc_now()
    actor = _actor_label(payload)
    row.killed_by = actor
    row.killed_at = now
    row.kill_reason = reason
    return _finish_transition(
        session,
        row,
        previous_status=previous_status,
        next_status="killed",
        action="kill",
        actor_label=actor,
        reason=reason,
    )
