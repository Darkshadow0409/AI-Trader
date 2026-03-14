from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import ActiveTradeView, WalletBalanceView
from app.services.dashboard_data import list_active_trades, list_wallet_balances


router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/active-trades", response_model=list[ActiveTradeView])
def active_trades() -> list[ActiveTradeView]:
    return list_active_trades()


@router.get("/wallet-balance", response_model=list[WalletBalanceView])
def wallet_balance() -> list[WalletBalanceView]:
    return list_wallet_balances()
