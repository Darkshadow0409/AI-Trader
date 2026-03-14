from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


class Asset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    name: str
    asset_class: str
    venue: str
    is_active: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class MarketBar(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("symbol", "timeframe", "timestamp", name="uq_market_bar"),)

    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    timeframe: str = Field(index=True)
    timestamp: datetime = Field(index=True)
    open: float
    high: float
    low: float
    close: float
    volume: float
    source: str
    uncertainty: float
    data_quality: str


class NewsItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)
    published_at: datetime = Field(index=True)
    title: str
    summary: str
    url: str
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    data_quality: str


class MacroEvent(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)
    event_time: datetime = Field(index=True)
    event_name: str
    category: str
    impact: str
    previous_value: str = ""
    expected_value: str = ""
    actual_value: str = ""
    data_quality: str


class SignalRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    signal_type: str = Field(index=True)
    timestamp: datetime = Field(index=True)
    direction: str
    score: float
    thesis: str
    uncertainty: float
    data_quality: str
    features_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class RiskReport(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    as_of: datetime = Field(index=True)
    stop_price: float
    size_band: str
    max_portfolio_risk_pct: float
    exposure_cluster: str
    uncertainty: float
    data_quality: str
    report_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class WatchlistItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    label: str
    thesis: str
    priority: int
    status: str
    last_signal_score: float = 0.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class JournalEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    entered_at: datetime = Field(index=True)
    note: str
    mood: str
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))


class BacktestRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    engine: str
    started_at: datetime = Field(default_factory=datetime.utcnow)
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class StrategyRegistryEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    version: str
    template: str
    description: str
    underlying_symbol: str
    tradable_symbol: str
    timeframe: str
    warmup_bars: int
    fees_bps: float
    slippage_bps: float
    proxy_grade: bool = False
    promoted: bool = False
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    validation_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    search_space_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    spec_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class BacktestResult(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    strategy_name: str = Field(index=True)
    engine: str
    status: str = Field(index=True)
    symbol: str = Field(index=True)
    timeframe: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    completed_at: datetime | None = None
    proxy_grade: bool = False
    promoted_candidate: bool = False
    fees_bps: float
    slippage_bps: float
    warmup_bars: int
    search_method: str
    robustness_score: float
    net_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    trade_count: int
    validation_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    equity_curve_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    trades_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    stability_heatmap_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    regime_summary_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class PipelineRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    source_mode: str
    bars_ingested: int = 0
    signals_emitted: int = 0
    status: str = "running"
    notes: str = ""
