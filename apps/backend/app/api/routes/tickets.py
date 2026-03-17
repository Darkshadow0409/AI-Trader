from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import (
    BrokerAdapterSnapshotView,
    ManualFillCreateRequest,
    ManualFillImportRequest,
    ManualFillView,
    TicketSummaryView,
    TradeTicketApprovalRequest,
    TradeTicketCreateRequest,
    TradeTicketDetailView,
    TradeTicketUpdateRequest,
    TradeTicketView,
)
from app.services.ui_summaries import ticket_summary
from app.services.trade_tickets import (
    approve_trade_ticket,
    broker_adapter_snapshot,
    create_trade_ticket,
    expire_trade_ticket,
    get_trade_ticket_detail,
    import_manual_fills,
    invalidate_trade_ticket,
    list_shadow_mode_tickets,
    list_trade_tickets,
    mark_trade_ticket_manually_executed,
    mark_trade_ticket_shadow_active,
    record_manual_fill,
    update_trade_ticket,
)


router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("", response_model=list[TradeTicketView])
def tickets(session: Session = Depends(get_session)) -> list[TradeTicketView]:
    return list_trade_tickets(session)


@router.get("/shadow-mode", response_model=list[TradeTicketDetailView])
def shadow_mode(session: Session = Depends(get_session)) -> list[TradeTicketDetailView]:
    return list_shadow_mode_tickets(session)


@router.get("/broker-snapshot", response_model=BrokerAdapterSnapshotView)
def broker_snapshot() -> BrokerAdapterSnapshotView:
    return broker_adapter_snapshot()


@router.get("/summary", response_model=TicketSummaryView)
def summary(session: Session = Depends(get_session)) -> TicketSummaryView:
    return ticket_summary(session)


@router.post("", response_model=TradeTicketDetailView, status_code=status.HTTP_201_CREATED)
def create_ticket(payload: TradeTicketCreateRequest, session: Session = Depends(get_session)) -> TradeTicketDetailView:
    try:
        return create_trade_ticket(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{ticket_id}", response_model=TradeTicketDetailView)
def ticket_detail(ticket_id: str, session: Session = Depends(get_session)) -> TradeTicketDetailView:
    detail = get_trade_ticket_detail(session, ticket_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return detail


@router.patch("/{ticket_id}", response_model=TradeTicketDetailView)
def update_ticket(ticket_id: str, payload: TradeTicketUpdateRequest, session: Session = Depends(get_session)) -> TradeTicketDetailView:
    detail = update_trade_ticket(session, ticket_id, payload)
    if detail is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return detail


@router.post("/{ticket_id}/approval", response_model=TradeTicketDetailView)
def approval(ticket_id: str, payload: TradeTicketApprovalRequest, session: Session = Depends(get_session)) -> TradeTicketDetailView:
    try:
        detail = approve_trade_ticket(session, ticket_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if detail is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return detail


@router.post("/{ticket_id}/invalidate", response_model=TradeTicketDetailView)
def invalidate(ticket_id: str, note: str = "", session: Session = Depends(get_session)) -> TradeTicketDetailView:
    detail = invalidate_trade_ticket(session, ticket_id, note)
    if detail is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return detail


@router.post("/{ticket_id}/expire", response_model=TradeTicketDetailView)
def expire(ticket_id: str, note: str = "", session: Session = Depends(get_session)) -> TradeTicketDetailView:
    detail = expire_trade_ticket(session, ticket_id, note)
    if detail is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return detail


@router.post("/{ticket_id}/shadow-active", response_model=TradeTicketDetailView)
def shadow_active(ticket_id: str, note: str = "", session: Session = Depends(get_session)) -> TradeTicketDetailView:
    detail = mark_trade_ticket_shadow_active(session, ticket_id, note)
    if detail is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return detail


@router.post("/{ticket_id}/manually-executed", response_model=TradeTicketDetailView)
def manually_executed(ticket_id: str, note: str = "", trade_id: str | None = None, session: Session = Depends(get_session)) -> TradeTicketDetailView:
    detail = mark_trade_ticket_manually_executed(session, ticket_id, note, trade_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return detail


@router.post("/{ticket_id}/fills", response_model=ManualFillView, status_code=status.HTTP_201_CREATED)
def create_fill(ticket_id: str, payload: ManualFillCreateRequest, session: Session = Depends(get_session)) -> ManualFillView:
    fill = record_manual_fill(session, ticket_id, payload)
    if fill is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return fill


@router.post("/{ticket_id}/fills/import", response_model=list[ManualFillView], status_code=status.HTTP_201_CREATED)
def import_fills(ticket_id: str, payload: ManualFillImportRequest, session: Session = Depends(get_session)) -> list[ManualFillView]:
    imported = import_manual_fills(session, ticket_id, payload)
    if not imported and get_trade_ticket_detail(session, ticket_id) is None:
        raise HTTPException(status_code=404, detail="Trade ticket not found.")
    return imported
