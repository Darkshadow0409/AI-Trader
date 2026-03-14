from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class AssetSymbol(StrEnum):
    BTC = "BTC"
    ETH = "ETH"
    WTI = "WTI"
    GOLD = "GOLD"
    SILVER = "SILVER"
    DXY = "DXY"
    US10Y = "US10Y"
    VIX = "VIX"


class AssetClass(StrEnum):
    CRYPTO = "crypto"
    MACRO = "macro"
    COMMODITY = "commodity"
    INDEX = "index"


class SignalDirection(StrEnum):
    LONG = "long"
    SHORT = "short"
    NEUTRAL = "neutral"


class DataQuality(StrEnum):
    LIVE = "live"
    HYBRID = "hybrid"
    FIXTURE = "fixture"


class StrategySpec(BaseModel):
    name: str
    universe: list[AssetSymbol]
    entry: str
    exit: str
    timeframe: str = "1d"
    stop_atr_multiple: float = 2.0
    fees_bps: float = 8.0
    slippage_bps: float = 5.0
    risk: dict[str, float | int | str] = Field(default_factory=dict)


class PipelineSummary(BaseModel):
    source_mode: str
    bars_ingested: int
    signals_emitted: int
    risk_reports_built: int
    data_quality: DataQuality
    refreshed_at: datetime = Field(default_factory=datetime.utcnow)
