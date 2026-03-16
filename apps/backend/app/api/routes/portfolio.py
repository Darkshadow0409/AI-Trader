from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import (
    ActiveTradeCreateRequest,
    ActiveTradeUpdateRequest,
    ActiveTradeView,
    PaperTradeAnalyticsView,
    PaperTradeCloseRequest,
    PaperTradeDetailView,
    PaperTradeOpenRequest,
    PaperTradePartialExitRequest,
    PaperTradeProposalRequest,
    PaperTradeScaleRequest,
    ScenarioStressItemView,
    PaperTradeView,
    TradeTimelineView,
    WalletBalanceView,
)
from app.services.dashboard_data import list_wallet_balances
from app.services.operator_console import create_active_trade, delete_active_trade, list_active_trades, update_active_trade
from app.services.paper_trading import (
    ACTIVE_PAPER_STATUSES,
    CLOSED_PAPER_STATUSES,
    cancel_paper_trade,
    close_paper_trade,
    create_proposed_paper_trade,
    get_paper_trade_detail,
    get_paper_trade_scenario_stress,
    get_paper_trade_timeline,
    invalidate_paper_trade,
    list_paper_trades,
    open_paper_trade,
    paper_trade_analytics,
    partial_exit_paper_trade,
    scale_paper_trade,
    timeout_paper_trade,
)


router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/active-trades", response_model=list[ActiveTradeView])
def active_trades(session: Session = Depends(get_session)) -> list[ActiveTradeView]:
    return list_active_trades(session)


@router.post("/active-trades", response_model=ActiveTradeView, status_code=status.HTTP_201_CREATED)
def create_trade(payload: ActiveTradeCreateRequest, session: Session = Depends(get_session)) -> ActiveTradeView:
    return create_active_trade(session, payload)


@router.patch("/active-trades/{trade_id}", response_model=ActiveTradeView)
def update_trade(
    trade_id: str,
    payload: ActiveTradeUpdateRequest,
    session: Session = Depends(get_session),
) -> ActiveTradeView:
    updated = update_active_trade(session, trade_id, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Active trade not found.")
    return updated


@router.delete("/active-trades/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade(trade_id: str, session: Session = Depends(get_session)) -> Response:
    deleted = delete_active_trade(session, trade_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Active trade not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/wallet-balance", response_model=list[WalletBalanceView])
def wallet_balance() -> list[WalletBalanceView]:
    return list_wallet_balances()


@router.get("/paper-trades/proposed", response_model=list[PaperTradeView])
def proposed_paper_trades(session: Session = Depends(get_session)) -> list[PaperTradeView]:
    return list_paper_trades(session, statuses={"proposed"})


@router.get("/paper-trades/active", response_model=list[PaperTradeView])
def active_paper_trades(session: Session = Depends(get_session)) -> list[PaperTradeView]:
    return list_paper_trades(session, statuses=ACTIVE_PAPER_STATUSES)


@router.get("/paper-trades/closed", response_model=list[PaperTradeView])
def closed_paper_trades(session: Session = Depends(get_session)) -> list[PaperTradeView]:
    return list_paper_trades(session, statuses=CLOSED_PAPER_STATUSES)


@router.get("/paper-trades/analytics", response_model=PaperTradeAnalyticsView)
def paper_trade_summary(session: Session = Depends(get_session)) -> PaperTradeAnalyticsView:
    return paper_trade_analytics(session)


@router.get("/paper-trades/{trade_id}", response_model=PaperTradeDetailView)
def paper_trade_detail(trade_id: str, session: Session = Depends(get_session)) -> PaperTradeDetailView:
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    return detail


@router.get("/paper-trades/{trade_id}/timeline", response_model=TradeTimelineView)
def paper_trade_timeline(trade_id: str, session: Session = Depends(get_session)) -> TradeTimelineView:
    detail = get_paper_trade_timeline(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    return detail


@router.get("/paper-trades/{trade_id}/scenario-stress", response_model=list[ScenarioStressItemView])
def paper_trade_scenario_stress(trade_id: str, session: Session = Depends(get_session)) -> list[ScenarioStressItemView]:
    detail = get_paper_trade_scenario_stress(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    return detail


@router.post("/paper-trades/proposed", response_model=PaperTradeDetailView, status_code=status.HTTP_201_CREATED)
def create_paper_trade(payload: PaperTradeProposalRequest, session: Session = Depends(get_session)) -> PaperTradeDetailView:
    try:
        created = create_proposed_paper_trade(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    detail = get_paper_trade_detail(session, created.trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade was created but could not be reloaded.")
    return detail


@router.post("/paper-trades/{trade_id}/open", response_model=PaperTradeDetailView)
def open_paper_trade_route(
    trade_id: str,
    payload: PaperTradeOpenRequest,
    session: Session = Depends(get_session),
) -> PaperTradeDetailView:
    try:
        opened = open_paper_trade(session, trade_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if opened is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade open succeeded but detail reload failed.")
    return detail


@router.post("/paper-trades/{trade_id}/scale", response_model=PaperTradeDetailView)
def scale_paper_trade_route(
    trade_id: str,
    payload: PaperTradeScaleRequest,
    session: Session = Depends(get_session),
) -> PaperTradeDetailView:
    try:
        scaled = scale_paper_trade(session, trade_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if scaled is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade scale succeeded but detail reload failed.")
    return detail


@router.post("/paper-trades/{trade_id}/partial-exit", response_model=PaperTradeDetailView)
def partial_exit_paper_trade_route(
    trade_id: str,
    payload: PaperTradePartialExitRequest,
    session: Session = Depends(get_session),
) -> PaperTradeDetailView:
    try:
        partial = partial_exit_paper_trade(session, trade_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if partial is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade partial exit succeeded but detail reload failed.")
    return detail


@router.post("/paper-trades/{trade_id}/close", response_model=PaperTradeDetailView)
def close_paper_trade_route(
    trade_id: str,
    payload: PaperTradeCloseRequest,
    session: Session = Depends(get_session),
) -> PaperTradeDetailView:
    try:
        closed = close_paper_trade(session, trade_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if closed is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade close succeeded but detail reload failed.")
    return detail


@router.post("/paper-trades/{trade_id}/invalidate", response_model=PaperTradeDetailView)
def invalidate_paper_trade_route(
    trade_id: str,
    note: str = "",
    session: Session = Depends(get_session),
) -> PaperTradeDetailView:
    try:
        invalidated = invalidate_paper_trade(session, trade_id, note=note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if invalidated is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade invalidation succeeded but detail reload failed.")
    return detail


@router.post("/paper-trades/{trade_id}/timeout", response_model=PaperTradeDetailView)
def timeout_paper_trade_route(
    trade_id: str,
    note: str = "",
    session: Session = Depends(get_session),
) -> PaperTradeDetailView:
    try:
        timed_out = timeout_paper_trade(session, trade_id, note=note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if timed_out is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade timeout succeeded but detail reload failed.")
    return detail


@router.post("/paper-trades/{trade_id}/cancel", response_model=PaperTradeDetailView)
def cancel_paper_trade_route(
    trade_id: str,
    note: str = "",
    session: Session = Depends(get_session),
) -> PaperTradeDetailView:
    try:
        cancelled = cancel_paper_trade(session, trade_id, note=note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if cancelled is None:
        raise HTTPException(status_code=404, detail="Paper trade not found.")
    detail = get_paper_trade_detail(session, trade_id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Paper trade cancel succeeded but detail reload failed.")
    return detail
