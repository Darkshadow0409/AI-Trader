from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    sqlite_path: str
    duckdb_path: str
    parquet_dir: str


class BarView(BaseModel):
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class SignalView(BaseModel):
    signal_id: str
    symbol: str
    signal_type: str
    timestamp: datetime
    freshness_minutes: int
    direction: str
    score: float
    confidence: float
    noise_probability: float
    thesis: str
    invalidation: float
    targets: dict[str, float]
    uncertainty: float
    data_quality: str
    affected_assets: list[str]
    features: dict[str, Any]


class SignalEvidenceView(BaseModel):
    label: str
    value: str
    verdict: str
    note: str


class NewsView(BaseModel):
    source: str
    published_at: datetime
    freshness_minutes: int
    title: str
    summary: str
    url: str
    tags: list[str]
    entity_tags: list[str]
    affected_assets: list[str]
    data_quality: str


class WatchlistView(BaseModel):
    symbol: str
    label: str
    thesis: str
    priority: int
    status: str
    last_signal_score: float
    updated_at: datetime
    freshness_minutes: int


class OpportunityView(BaseModel):
    symbol: str
    label: str
    queue: str
    score: float
    score_decomposition: dict[str, float]
    promotion_reasons: list[str]
    freshness_minutes: int
    risk_notes: list[str]
    signal_id: str | None
    risk_report_id: str | None
    status: str


class OpportunityHunterView(BaseModel):
    generated_at: datetime
    focus_queue: list[OpportunityView]
    scout_queue: list[OpportunityView]


class RiskView(BaseModel):
    risk_report_id: str
    signal_id: str
    symbol: str
    as_of: datetime
    freshness_minutes: int
    stop_price: float
    size_band: str
    max_portfolio_risk_pct: float
    exposure_cluster: str
    uncertainty: float
    data_quality: str
    scenario_shocks: dict[str, float]
    report: dict[str, Any]


class RiskExposureView(BaseModel):
    cluster: str
    symbols: list[str]
    gross_risk_pct: float
    worst_scenario_pct: float


class RibbonView(BaseModel):
    macro_regime: str
    data_freshness_minutes: int
    freshness_status: str
    risk_budget_used_pct: float
    risk_budget_total_pct: float
    pipeline_status: str
    source_mode: str
    last_refresh: datetime | None
    next_event: dict[str, Any] | None


class ResearchView(BaseModel):
    symbol: str
    label: str
    timeframe: str
    last_price: float
    return_1d_pct: float
    return_5d_pct: float
    trend_state: str
    relative_volume: float
    atr_pct: float
    breakout_distance: float
    structure_score: float
    data_quality: str


class AssetContextView(BaseModel):
    symbol: str
    latest_signal: SignalView | None
    latest_risk: RiskView | None
    research: ResearchView | None
    related_news: list[NewsView]
    latest_backtest: BacktestListView | None


class SignalDetailView(SignalView):
    evidence: list[SignalEvidenceView]
    catalyst_news: list[NewsView]
    related_risk: RiskView | None
    freshness_status: str


class RiskDetailView(RiskView):
    linked_signal: SignalView | None
    stop_logic: dict[str, Any]
    risk_notes: list[str]
    cluster_exposure: RiskExposureView | None
    freshness_status: str


class ActiveTradeView(BaseModel):
    trade_id: str
    symbol: str
    strategy_name: str
    side: str
    entry_time: datetime
    entry_price: float
    current_price: float
    stop_price: float
    target_price: float
    pnl_pct: float
    size_band: str
    status: str
    thesis: str
    data_quality: str
    signal_id: str | None = None
    risk_report_id: str | None = None
    notes: str = ""
    updated_at: datetime
    freshness_minutes: int


class ActiveTradeCreateRequest(BaseModel):
    symbol: str
    strategy_name: str
    side: str
    entry_time: datetime
    entry_price: float
    current_price: float
    stop_price: float
    target_price: float
    size_band: str
    status: str
    thesis: str
    signal_id: str | None = None
    risk_report_id: str | None = None
    notes: str = ""
    data_quality: str = "manual"


class ActiveTradeUpdateRequest(BaseModel):
    current_price: float | None = None
    stop_price: float | None = None
    target_price: float | None = None
    status: str | None = None
    size_band: str | None = None
    thesis: str | None = None
    notes: str | None = None
    signal_id: str | None = None
    risk_report_id: str | None = None


class WalletBalanceLineView(BaseModel):
    asset: str
    free: float
    locked: float
    usd_value: float


class WalletBalanceView(BaseModel):
    venue: str
    account_label: str
    updated_at: datetime
    total_usd: float
    available_usd: float
    data_quality: str
    balances: list[WalletBalanceLineView]


class JournalReviewView(BaseModel):
    journal_id: str
    symbol: str
    entered_at: datetime
    entry_type: str
    note: str
    mood: str
    tags: list[str]
    signal_id: str | None = None
    risk_report_id: str | None = None
    trade_id: str | None = None
    setup_quality: int
    execution_quality: int
    follow_through: str
    outcome: str
    lessons: str
    review_status: str
    updated_at: datetime
    freshness_minutes: int


class JournalEntryCreateRequest(BaseModel):
    symbol: str
    entered_at: datetime
    entry_type: str = "pre_trade"
    note: str
    mood: str
    tags: list[str] = Field(default_factory=list)
    signal_id: str | None = None
    risk_report_id: str | None = None
    trade_id: str | None = None
    setup_quality: int = 0
    execution_quality: int = 0
    follow_through: str = ""
    outcome: str = ""
    lessons: str = ""
    review_status: str = "logged"


class JournalEntryUpdateRequest(BaseModel):
    note: str | None = None
    mood: str | None = None
    tags: list[str] | None = None
    signal_id: str | None = None
    risk_report_id: str | None = None
    trade_id: str | None = None
    setup_quality: int | None = None
    execution_quality: int | None = None
    follow_through: str | None = None
    outcome: str | None = None
    lessons: str | None = None
    review_status: str | None = None


class AlertEnvelope(BaseModel):
    alert_id: str
    created_at: datetime
    category: str
    severity: str
    title: str
    message: str
    symbol: str | None = None
    signal_id: str | None = None
    risk_report_id: str | None = None
    trade_id: str | None = None
    freshness_minutes: int
    data_quality: str
    tags: list[str]
    status: str
    metadata: dict[str, Any]


class StrategyListView(BaseModel):
    name: str
    version: str
    template: str
    description: str
    underlying_symbol: str
    tradable_symbol: str
    timeframe: str
    warmup_bars: int
    fees_bps: float
    slippage_bps: float
    proxy_grade: bool
    promoted: bool
    tags: list[str]
    validation: dict[str, Any]


class StrategyDetailView(StrategyListView):
    search_space: dict[str, Any]
    spec: dict[str, Any]


class BacktestRunRequest(BaseModel):
    strategy_name: str
    symbol: str | None = None
    search_method: str = "grid"
    max_trials: int = 12
    promote_candidate: bool = False
    parameter_overrides: dict[str, Any] = Field(default_factory=dict)


class BacktestListView(BaseModel):
    id: int
    strategy_name: str
    engine: str
    status: str
    symbol: str
    timeframe: str
    created_at: datetime
    proxy_grade: bool
    promoted_candidate: bool
    search_method: str
    robustness_score: float
    net_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    trade_count: int


class BacktestDetailView(BacktestListView):
    completed_at: datetime | None
    fees_bps: float
    slippage_bps: float
    warmup_bars: int
    validation: dict[str, Any]
    summary: dict[str, Any]
    equity_curve: list[dict[str, Any]]
    trades: list[dict[str, Any]]
    stability_heatmap: list[dict[str, Any]]
    regime_summary: list[dict[str, Any]]
    metadata: dict[str, Any]
