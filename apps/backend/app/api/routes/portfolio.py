from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import ActiveTradeCreateRequest, ActiveTradeUpdateRequest, ActiveTradeView, WalletBalanceView
from app.services.dashboard_data import list_wallet_balances
from app.services.operator_console import create_active_trade, delete_active_trade, list_active_trades, update_active_trade


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
