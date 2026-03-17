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


class ChartIndicatorPointView(BaseModel):
    timestamp: datetime
    value: float


class ChartIndicatorSetView(BaseModel):
    ema_20: list[ChartIndicatorPointView] = Field(default_factory=list)
    ema_50: list[ChartIndicatorPointView] = Field(default_factory=list)
    ema_200: list[ChartIndicatorPointView] = Field(default_factory=list)
    rsi_14: list[ChartIndicatorPointView] = Field(default_factory=list)
    atr_14: list[ChartIndicatorPointView] = Field(default_factory=list)


class ChartOverlayMarkerView(BaseModel):
    marker_id: str
    timestamp: datetime
    label: str
    kind: str
    tone: str


class ChartOverlayLineView(BaseModel):
    line_id: str
    label: str
    value: float
    kind: str
    tone: str


class ChartOverlayView(BaseModel):
    markers: list[ChartOverlayMarkerView] = Field(default_factory=list)
    price_lines: list[ChartOverlayLineView] = Field(default_factory=list)


class InstrumentMappingView(BaseModel):
    requested_symbol: str
    canonical_symbol: str
    display_symbol: str
    underlying_asset: str
    research_symbol: str
    public_symbol: str
    broker_symbol: str
    broker_truth: bool
    mapping_notes: str


class MarketChartView(BaseModel):
    symbol: str
    timeframe: str
    available_timeframes: list[str] = Field(default_factory=list)
    status: str
    status_note: str
    source_mode: str
    market_data_mode: str
    freshness_minutes: int
    freshness_state: str
    data_quality: str
    is_fixture_mode: bool
    bars: list[BarView] = Field(default_factory=list)
    indicators: ChartIndicatorSetView = Field(default_factory=ChartIndicatorSetView)
    overlays: ChartOverlayView = Field(default_factory=ChartOverlayView)
    instrument_mapping: InstrumentMappingView
    data_reality: DataRealityView | None = None


class DataRealismPenaltyView(BaseModel):
    code: str
    severity: str
    summary: str
    score_penalty: float


class AssetProvenanceView(BaseModel):
    symbol: str
    underlying_asset: str
    research_symbol: str
    tradable_symbol: str
    intended_venue: str
    intended_instrument: str
    source_name: str
    source_type: str
    source_timing: str
    freshness_sla_minutes: int
    realism_grade: str
    proxy_mapping_notes: str
    asset_class: str


class DataRealityView(BaseModel):
    provenance: AssetProvenanceView
    freshness_minutes: int
    freshness_state: str
    event_recency_minutes: int | None = None
    realism_score: float
    ranking_penalty: float
    promotion_blocked: bool
    alert_allowed: bool
    execution_suitability: str
    news_suitability: str
    ui_warning: str
    timing_semantics_note: str
    event_context_note: str
    penalties: list[DataRealismPenaltyView]
    tradable_alignment_note: str


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
    data_reality: DataRealityView | None = None


class SignalEvidenceView(BaseModel):
    label: str
    value: str
    verdict: str
    note: str


class PolymarketOutcomeView(BaseModel):
    label: str
    probability: float


class PolymarketMarketView(BaseModel):
    market_id: str
    event_id: str | None = None
    event_title: str = ""
    question: str
    slug: str
    status: str
    active: bool
    closed: bool
    end_date: datetime | None = None
    volume: float
    liquidity: float
    recent_activity: float
    open_interest: float = 0.0
    primary_tag: str = ""
    tags: list[str] = Field(default_factory=list)
    category: str = "broad_market_narrative"
    outcomes: list[PolymarketOutcomeView] = Field(default_factory=list)
    source_status: str
    source_note: str = ""
    related_assets: list[str] = Field(default_factory=list)
    relevance_score: float = 0.0
    relevance_reason: str = ""
    url: str = ""


class PolymarketEventView(BaseModel):
    event_id: str
    title: str
    slug: str
    status: str
    active: bool
    closed: bool
    end_date: datetime | None = None
    volume: float
    liquidity: float
    recent_activity: float
    category: str = "broad_market_narrative"
    primary_tag: str = ""
    tags: list[str] = Field(default_factory=list)
    market_count: int = 0
    markets: list[PolymarketMarketView] = Field(default_factory=list)
    source_status: str
    source_note: str = ""
    related_assets: list[str] = Field(default_factory=list)


class PolymarketHunterView(BaseModel):
    generated_at: datetime
    source_status: str
    source_note: str = ""
    query: str = ""
    tag: str = ""
    sort: str = "volume"
    available_tags: list[str] = Field(default_factory=list)
    events: list[PolymarketEventView] = Field(default_factory=list)
    markets: list[PolymarketMarketView] = Field(default_factory=list)


class NewsView(BaseModel):
    source: str
    published_at: datetime
    freshness_minutes: int
    freshness_state: str
    title: str
    summary: str
    url: str
    tags: list[str]
    entity_tags: list[str]
    affected_assets: list[str]
    primary_asset: str | None = None
    event_relevance: str
    market_data_mode: str
    data_quality: str
    related_polymarket_markets: list[PolymarketMarketView] = Field(default_factory=list)


class WatchlistView(BaseModel):
    symbol: str
    label: str
    thesis: str
    priority: int
    status: str
    last_signal_score: float
    updated_at: datetime
    freshness_minutes: int


class WatchlistSummaryView(BaseModel):
    symbol: str
    label: str
    status: str
    last_price: float
    change_pct: float
    freshness_minutes: int
    freshness_state: str
    realism_grade: str
    market_data_mode: str
    source_label: str
    top_setup_tag: str
    sparkline: list[float] = Field(default_factory=list)
    instrument_mapping: InstrumentMappingView


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
    data_reality: DataRealityView | None = None


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
    data_reality: DataRealityView | None = None


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
    market_data_mode: str
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
    data_reality: DataRealityView | None = None
    related_polymarket_markets: list[PolymarketMarketView] = Field(default_factory=list)
    crowd_implied_narrative: str = ""


class AssetContextView(BaseModel):
    symbol: str
    latest_signal: SignalView | None
    latest_risk: RiskView | None
    research: ResearchView | None
    related_news: list[NewsView]
    latest_backtest: BacktestListView | None
    data_reality: DataRealityView | None = None
    related_polymarket_markets: list[PolymarketMarketView] = Field(default_factory=list)
    crowd_implied_narrative: str = ""


class SignalDetailView(SignalView):
    evidence: list[SignalEvidenceView]
    catalyst_news: list[NewsView]
    related_risk: RiskView | None
    freshness_status: str
    related_polymarket_markets: list[PolymarketMarketView] = Field(default_factory=list)
    crowd_implied_narrative: str = ""


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


class PaperTradeOutcomeView(BaseModel):
    entry_quality_label: str
    entry_zone_delta_pct: float
    stop_adherence: bool
    target_attainment: str
    time_to_outcome_minutes: int
    mfe_pct: float
    mae_pct: float
    plan_adherence_flags: dict[str, bool]
    realized_pnl_pct: float


class ExecutionRealismView(BaseModel):
    entry_slippage_bps: float
    stop_slippage_bps: float
    target_fill_mode: str
    gap_through_stop_flag: bool
    event_latency_penalty: float
    delayed_source_penalty: float
    effective_entry: float | None = None
    effective_stop: float | None = None
    fill_note: str = ""


class ExecutionQualityView(BaseModel):
    signal_quality: str
    plan_quality: str
    execution_quality: str
    slippage_penalty_bps: float
    latency_penalty: float
    delayed_penalty: float
    notes: list[str] = Field(default_factory=list)


class ScenarioStressItemView(BaseModel):
    scenario: str
    entity_type: str
    entity_id: str
    symbol: str
    severity: str
    shock_pct: float
    pnl_impact_pct: float
    confidence_impact: float
    rationale: str


class ScenarioStressSummaryView(BaseModel):
    generated_at: datetime
    signal_impacts: list[ScenarioStressItemView]
    active_trade_impacts: list[ScenarioStressItemView]
    promoted_strategy_impacts: list[ScenarioStressItemView]


class TradeTimelineEventView(BaseModel):
    timestamp: datetime
    phase: str
    event_type: str
    title: str
    note: str
    price: float | None = None
    related_alert_ids: list[str] = Field(default_factory=list)


class TradeTimelineView(BaseModel):
    trade_id: str
    symbol: str
    generated_at: datetime
    pre_event: list[TradeTimelineEventView]
    event_trigger: list[TradeTimelineEventView]
    post_event: list[TradeTimelineEventView]
    trade_actions: list[TradeTimelineEventView]
    progression: list[TradeTimelineEventView]


class ReplayFrameView(BaseModel):
    cursor: datetime
    bars: list[BarView]
    signals: list[SignalView]
    risks: list[RiskView]
    alerts: list[AlertEnvelope]
    paper_trades: list["PaperTradeView"]


class ReplayView(BaseModel):
    generated_at: datetime
    symbol: str
    signal_id: str | None = None
    trade_id: str | None = None
    event_window_minutes: int
    frames: list[ReplayFrameView]


class PaperTradeAdherenceView(BaseModel):
    entered_inside_suggested_zone: bool | None = None
    invalidation_respected: bool | None = None
    time_stop_respected: bool | None = None
    realism_warning_ignored: bool | None = None
    size_plan_respected: bool | None = None
    exited_per_plan: bool | None = None
    adherence_score: float = 0.0
    breached_rules: list[str] = Field(default_factory=list)


class PaperAccountSummaryView(BaseModel):
    account_size: float
    current_equity: float
    allocated_capital: float
    open_risk_amount: float
    projected_base_pnl: float
    projected_stretch_pnl: float
    projected_stop_loss: float
    risk_pct_of_account: float
    projected_reward_to_risk: float


class PaperTradeReviewView(BaseModel):
    review_id: str
    trade_id: str
    thesis_respected: bool | None = None
    invalidation_respected: bool | None = None
    entered_inside_suggested_zone: bool | None = None
    time_stop_respected: bool | None = None
    entered_too_early: bool | None = None
    entered_too_late: bool | None = None
    oversized: bool | None = None
    undersized: bool | None = None
    realism_warning_ignored: bool | None = None
    size_plan_respected: bool | None = None
    exited_per_plan: bool | None = None
    catalyst_mattered: bool | None = None
    failure_category: str = ""
    failure_categories: list[str] = Field(default_factory=list)
    operator_notes: str = ""
    updated_at: datetime


class PaperTradeView(BaseModel):
    trade_id: str
    signal_id: str | None = None
    risk_report_id: str | None = None
    strategy_id: str | None = None
    symbol: str
    side: str
    proposed_entry_zone: dict[str, float]
    actual_entry: float | None = None
    stop: float
    targets: dict[str, float]
    size_plan: dict[str, Any]
    actual_size: float
    status: str
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    close_reason: str = ""
    close_price: float | None = None
    notes: str = ""
    freshness_minutes: int
    data_quality: str
    lifecycle_events: list[dict[str, Any]] = Field(default_factory=list)
    outcome: PaperTradeOutcomeView | None = None
    execution_realism: ExecutionRealismView | None = None
    execution_quality: ExecutionQualityView | None = None
    adherence: PaperTradeAdherenceView | None = None
    review_due: bool = False
    paper_account: PaperAccountSummaryView | None = None
    data_reality: DataRealityView | None = None


class PaperTradeDetailView(PaperTradeView):
    linked_signal: SignalView | None = None
    linked_risk: RiskView | None = None
    review: PaperTradeReviewView | None = None
    timeline: TradeTimelineView | None = None
    scenario_stress: list[ScenarioStressItemView] = Field(default_factory=list)


class TradeTicketChecklistView(BaseModel):
    freshness_acceptable: bool = False
    realism_acceptable: bool = False
    risk_budget_available: bool = False
    cluster_exposure_acceptable: bool = False
    review_complete: bool = False
    operator_acknowledged: bool = False
    completed: bool = False
    blocked_reasons: list[str] = Field(default_factory=list)


class ShadowObservationView(BaseModel):
    observed_at: datetime
    observed_price: float
    planned_reference_price: float
    observed_vs_plan_pct: float
    ticket_valid: bool
    divergence_flag: bool
    divergence_reason: str = ""
    market_path_note: str = ""
    freshness_state: str = "fresh"


class ManualFillReconciliationView(BaseModel):
    planned_entry_reference: float
    actual_fill_price: float
    actual_slippage_bps: float
    modeled_slippage_bps: float
    slippage_variance_bps: float
    entered_inside_zone: bool
    requires_review: bool
    summary: str


class ManualFillView(BaseModel):
    fill_id: str
    ticket_id: str
    trade_id: str | None = None
    source: str
    symbol: str
    side: str
    filled_at: datetime
    fill_price: float
    fill_size: float
    fees: float
    slippage_bps: float
    notes: str = ""
    import_batch_id: str | None = None
    reconciliation: ManualFillReconciliationView


class BrokerBalanceView(BaseModel):
    venue: str
    account_label: str
    asset: str
    free: float
    locked: float
    usd_value: float
    source_type: str


class BrokerPositionView(BaseModel):
    venue: str
    symbol: str
    side: str
    size: float
    entry_price: float
    mark_price: float
    unrealized_pnl_pct: float
    source_type: str


class BrokerFillImportView(BaseModel):
    venue: str
    import_batch_id: str
    fill_count: int
    latest_fill_at: datetime | None = None
    notes: str = ""
    source_type: str


class BrokerAdapterSnapshotView(BaseModel):
    generated_at: datetime
    balances: list[BrokerBalanceView]
    positions: list[BrokerPositionView]
    fill_imports: list[BrokerFillImportView]


class TradeTicketView(BaseModel):
    ticket_id: str
    signal_id: str | None = None
    risk_report_id: str | None = None
    trade_id: str | None = None
    strategy_id: str | None = None
    symbol: str
    side: str
    proposed_entry_zone: dict[str, float]
    planned_stop: float
    planned_targets: dict[str, float]
    planned_size: dict[str, Any]
    realism_summary: dict[str, Any]
    freshness_summary: dict[str, Any]
    checklist_status: TradeTicketChecklistView
    approval_status: str
    status: str
    shadow_status: str
    created_at: datetime
    expires_at: datetime | None = None
    notes: str = ""
    freshness_minutes: int
    linked_signal_family: str = ""
    paper_account: PaperAccountSummaryView | None = None
    data_reality: DataRealityView | None = None


class TradeTicketDetailView(TradeTicketView):
    linked_signal: SignalDetailView | None = None
    linked_risk: RiskDetailView | None = None
    linked_trade: PaperTradeDetailView | None = None
    shadow_summary: ShadowObservationView | None = None
    manual_fills: list[ManualFillView] = Field(default_factory=list)
    broker_snapshot: BrokerAdapterSnapshotView | None = None


class TradeTicketCreateRequest(BaseModel):
    signal_id: str
    risk_report_id: str | None = None
    trade_id: str | None = None
    strategy_id: str | None = None
    symbol: str | None = None
    side: str | None = None
    expires_at: datetime | None = None
    notes: str = ""


class TradeTicketUpdateRequest(BaseModel):
    proposed_entry_zone: dict[str, float] | None = None
    planned_stop: float | None = None
    planned_targets: dict[str, float] | None = None
    planned_size: dict[str, Any] | None = None
    checklist_status: dict[str, bool] | None = None
    expires_at: datetime | None = None
    notes: str | None = None
    status: str | None = None


class TradeTicketApprovalRequest(BaseModel):
    approval_status: str
    approval_notes: str = ""


class ManualFillCreateRequest(BaseModel):
    fill_price: float
    fill_size: float
    filled_at: datetime = Field(default_factory=datetime.utcnow)
    fees: float = 0.0
    notes: str = ""
    trade_id: str | None = None


class ManualFillImportRequest(BaseModel):
    fills: list[ManualFillCreateRequest]
    import_batch_id: str | None = None
    notes: str = ""


class PaperTradeProposalRequest(BaseModel):
    signal_id: str
    risk_report_id: str | None = None
    strategy_id: str | None = None
    symbol: str | None = None
    side: str | None = None
    notes: str = ""


class PaperTradeOpenRequest(BaseModel):
    actual_entry: float
    actual_size: float
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    notes: str = ""


class PaperTradeScaleRequest(BaseModel):
    actual_entry: float
    added_size: float
    notes: str = ""


class PaperTradePartialExitRequest(BaseModel):
    exit_price: float
    exit_size: float
    closed_at: datetime = Field(default_factory=datetime.utcnow)
    close_reason: str = "target_partial"
    notes: str = ""


class PaperTradeCloseRequest(BaseModel):
    close_price: float
    closed_at: datetime = Field(default_factory=datetime.utcnow)
    close_reason: str
    notes: str = ""


class PaperTradeReviewRequest(BaseModel):
    thesis_respected: bool | None = None
    invalidation_respected: bool | None = None
    entered_inside_suggested_zone: bool | None = None
    time_stop_respected: bool | None = None
    entered_too_early: bool | None = None
    entered_too_late: bool | None = None
    oversized: bool | None = None
    undersized: bool | None = None
    realism_warning_ignored: bool | None = None
    size_plan_respected: bool | None = None
    exited_per_plan: bool | None = None
    catalyst_mattered: bool | None = None
    failure_category: str = ""
    failure_categories: list[str] = Field(default_factory=list)
    operator_notes: str = ""


class PaperTradeAnalyticsBucketView(BaseModel):
    grouping: str
    key: str
    trade_count: int
    hit_rate: float
    expectancy_proxy: float
    target_attainment_rate: float
    invalidation_rate: float
    avg_entry_zone_delta_pct: float
    avg_mfe_pct: float
    avg_mae_pct: float


class PaperTradeFailureCategoryView(BaseModel):
    category: str
    trade_count: int
    operator_error: bool


class PaperTradeHygieneSummaryView(BaseModel):
    trade_count: int
    reviewed_trade_count: int
    adherence_rate: float
    invalidation_discipline_rate: float
    realism_warning_violation_rate: float
    review_completion_rate: float
    poor_adherence_streak: int
    review_backlog: int
    realism_warning_violation_count: int
    invalidation_breach_count: int
    promoted_strategy_drift_count: int
    promoted_strategy_drift: list[str] = Field(default_factory=list)


class PaperTradeAnalyticsView(BaseModel):
    generated_at: datetime
    by_signal_family: list[PaperTradeAnalyticsBucketView]
    by_asset_class: list[PaperTradeAnalyticsBucketView]
    by_strategy: list[PaperTradeAnalyticsBucketView]
    by_strategy_lifecycle_state: list[PaperTradeAnalyticsBucketView]
    by_score_bucket: list[PaperTradeAnalyticsBucketView]
    by_realism_bucket: list[PaperTradeAnalyticsBucketView]
    by_realism_grade: list[PaperTradeAnalyticsBucketView]
    by_freshness_state: list[PaperTradeAnalyticsBucketView]
    by_asset: list[PaperTradeAnalyticsBucketView]
    by_signal_quality: list[PaperTradeAnalyticsBucketView]
    by_plan_quality: list[PaperTradeAnalyticsBucketView]
    by_execution_quality: list[PaperTradeAnalyticsBucketView]
    hygiene_summary: PaperTradeHygieneSummaryView
    failure_categories: list[PaperTradeFailureCategoryView]


class StrategyOperatorFeedbackView(BaseModel):
    trade_count: int
    adherence_rate: float
    adherence_adjusted_expectancy_proxy: float
    realism_adjusted_expectancy_proxy: float
    operator_error_rate: float
    drift_indicator: str
    dominant_failure_categories: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


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
    signal_id: str | None = None
    risk_report_id: str | None = None
    asset_ids: list[str]
    severity: str
    category: str
    channel_targets: list[str]
    title: str
    body: str
    tags: list[str]
    dedupe_key: str
    status: str = "queued"
    delivery_metadata: dict[str, Any] = Field(default_factory=dict)
    data_quality: str = "fixture"
    suppressed_reason: str | None = None


class ReviewTaskView(BaseModel):
    task_id: str
    task_type: str
    title: str
    summary: str
    state: str
    priority: str
    session_state: str
    linked_entity_type: str
    linked_entity_id: str
    linked_symbol: str
    signal_id: str | None = None
    risk_report_id: str | None = None
    trade_id: str | None = None
    strategy_name: str | None = None
    due_at: datetime
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    freshness_minutes: int
    overdue: bool
    notes: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReviewTaskUpdateRequest(BaseModel):
    state: str
    notes: str = ""


class BriefingTradeAttentionView(BaseModel):
    trade_id: str
    symbol: str
    status: str
    attention_reason: str
    freshness_minutes: int
    signal_id: str | None = None
    risk_report_id: str | None = None


class DegradedSourceView(BaseModel):
    symbol: str
    source_type: str
    source_timing: str
    freshness_state: str
    realism_grade: str
    warning: str


class StrategyDriftWarningView(BaseModel):
    strategy_name: str
    lifecycle_state: str
    drift_indicator: str
    note: str


class DailyBriefingView(BaseModel):
    generated_at: datetime
    top_ranked_signals: list[SignalView]
    high_risk_setups: list[SignalView]
    open_trades_needing_attention: list[BriefingTradeAttentionView]
    exposure_summary: list[RiskExposureView]
    degraded_data_sources: list[DegradedSourceView]
    scout_to_focus_promotions: list[OpportunityView]
    promoted_strategy_drift_warnings: list[StrategyDriftWarningView]


class WeeklyReviewView(BaseModel):
    generated_at: datetime
    signal_family_outcomes: list[PaperTradeAnalyticsBucketView]
    adherence_trend: PaperTradeHygieneSummaryView
    failure_attribution_trend: list[PaperTradeFailureCategoryView]
    realism_warning_violations: list[PaperTradeReviewView]
    strategy_promotion_health: list[StrategyDriftWarningView]
    paper_trade_outcome_distribution: dict[str, int]


class OperationalBacklogItemView(BaseModel):
    item_id: str
    category: str
    title: str
    priority: str
    status: str
    linked_symbol: str = ""
    linked_entity_type: str = ""
    linked_entity_id: str = ""
    due_at: datetime | None = None
    freshness_minutes: int = 0
    note: str = ""


class OperationalBacklogView(BaseModel):
    generated_at: datetime
    overdue_count: int
    high_priority_count: int
    items: list[OperationalBacklogItemView]


class SessionStateView(BaseModel):
    state: str
    title: str
    headline: str
    summary: str
    item_count: int
    overdue_count: int
    high_priority_count: int
    freshness_status: str


class SessionOverviewView(BaseModel):
    generated_at: datetime
    states: list[SessionStateView]
    review_tasks: list[ReviewTaskView]
    daily_briefing: DailyBriefingView
    weekly_review: WeeklyReviewView
    operational_backlog: OperationalBacklogView


class DeskSummaryView(BaseModel):
    generated_at: datetime
    session_states: list[SessionStateView] = Field(default_factory=list)
    execution_gate: ExecutionGateView
    operational_backlog: OperationalBacklogView
    review_tasks: list[ReviewTaskView] = Field(default_factory=list)
    degraded_sources: list[DegradedSourceView] = Field(default_factory=list)
    high_priority_signals: list[SignalView] = Field(default_factory=list)
    high_risk_signals: list[SignalView] = Field(default_factory=list)
    focus_opportunities: list[OpportunityView] = Field(default_factory=list)
    open_tickets: list[TradeTicketView] = Field(default_factory=list)
    active_paper_trades: list[PaperTradeView] = Field(default_factory=list)
    shadow_divergence: list[dict[str, Any]] = Field(default_factory=list)
    adapter_health: list["AdapterHealthView"] = Field(default_factory=list)
    audit_log_tail: list["AuditLogView"] = Field(default_factory=list)


class PilotMetricSummaryView(BaseModel):
    generated_at: datetime
    ticket_conversion: dict[str, float]
    shadow_metrics: dict[str, float]
    slippage_metrics: dict[str, float]
    alert_metrics: dict[str, float]
    adherence_metrics: dict[str, float]
    review_backlog_metrics: dict[str, float]
    promoted_strategy_metrics: dict[str, float]
    mismatch_causes: list[dict[str, Any]] = Field(default_factory=list)


class ExecutionGateView(BaseModel):
    status: str
    blockers: list[str] = Field(default_factory=list)
    thresholds: dict[str, float | int]
    metrics: dict[str, float]
    rationale: list[str] = Field(default_factory=list)


class AdapterHealthView(BaseModel):
    health_id: str
    adapter_name: str
    status: str
    checked_at: datetime
    details: dict[str, Any] = Field(default_factory=dict)


class AuditLogView(BaseModel):
    audit_id: str
    created_at: datetime
    event_type: str
    entity_type: str
    entity_id: str
    actor: str
    details: dict[str, Any] = Field(default_factory=dict)


class PilotDashboardView(BaseModel):
    generated_at: datetime
    pilot_metrics: PilotMetricSummaryView
    trust_by_asset_class: list[dict[str, Any]] = Field(default_factory=list)
    divergence_hotspots: list[dict[str, Any]] = Field(default_factory=list)
    operator_discipline: dict[str, float]
    review_backlog: OperationalBacklogView
    execution_gate: ExecutionGateView
    adapter_health: list[AdapterHealthView] = Field(default_factory=list)
    recent_audit_logs: list[AuditLogView] = Field(default_factory=list)


class OpsActionSpecView(BaseModel):
    action_name: str
    label: str
    category: str
    is_heavy: bool
    warning: str = ""


class OpsActionView(BaseModel):
    action_id: str
    action_name: str
    category: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    summary: str
    log_path: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class OpsActionRequest(BaseModel):
    confirm_heavy: bool = False


class OpsSummaryView(BaseModel):
    generated_at: datetime
    latest_fast_verify: OpsActionView | None = None
    latest_full_verify: OpsActionView | None = None
    latest_export: OpsActionView | None = None
    latest_bundle: OpsActionView | None = None
    latest_refresh: OpsActionView | None = None
    latest_contract_snapshot: OpsActionView | None = None
    action_history: list[OpsActionView] = Field(default_factory=list)
    available_actions: list[OpsActionSpecView] = Field(default_factory=list)


class CommandCenterStatusView(BaseModel):
    generated_at: datetime
    runtime_status: str
    backend_health: str = "ok"
    frontend_runtime_status: str = "available"
    source_mode: str
    pipeline_status: str
    pipeline_freshness_minutes: int = 0
    last_refresh: datetime | None = None
    latest_export_path: str | None = None
    latest_export_generated_at: datetime | None = None
    latest_review_bundle_path: str | None = None
    latest_review_bundle_generated_at: datetime | None = None
    frontend_build_generated_at: datetime | None = None
    diagnostics_updated_at: datetime | None = None
    verify_fast_available: bool = True
    verify_full_available: bool = True
    review_bundle_available: bool = True
    available_actions: list[str] = Field(default_factory=list)
    safe_actions: list[OpsActionSpecView] = Field(default_factory=list)
    heavy_actions: list[OpsActionSpecView] = Field(default_factory=list)
    latest_fast_verify: OpsActionView | None = None
    latest_full_verify: OpsActionView | None = None
    latest_export: OpsActionView | None = None
    latest_bundle: OpsActionView | None = None
    latest_refresh_action: OpsActionView | None = None
    latest_contract_snapshot: OpsActionView | None = None
    action_history: list[OpsActionView] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PilotExportResponse(BaseModel):
    generated_at: datetime
    report_path: str
    source_mode: str
    pipeline_status: str


class HomeOperatorSummaryView(BaseModel):
    generated_at: datetime
    session_states: list[SessionStateView] = Field(default_factory=list)
    session_state: str
    pilot_gate_state: str
    degraded_source_count: int
    review_backlog_counts: dict[str, int] = Field(default_factory=dict)
    top_signals_summary: list[SignalView] = Field(default_factory=list)
    open_ticket_counts: dict[str, int] = Field(default_factory=dict)
    active_trade_counts: dict[str, int] = Field(default_factory=dict)
    shadow_divergence_summary: dict[str, Any] = Field(default_factory=dict)
    adapter_health_summary: dict[str, int] = Field(default_factory=dict)


class SignalsSummaryView(BaseModel):
    generated_at: datetime
    filter_metadata: dict[str, list[str]] = Field(default_factory=dict)
    grouped_counts: dict[str, dict[str, int]] = Field(default_factory=dict)
    top_ranked_signals: list[SignalView] = Field(default_factory=list)
    warning_counts: dict[str, int] = Field(default_factory=dict)


class TicketSummaryView(BaseModel):
    generated_at: datetime
    counts_by_state: dict[str, int] = Field(default_factory=dict)
    checklist_blockers: dict[str, int] = Field(default_factory=dict)
    shadow_active_count: int = 0
    reconciliation_needed_count: int = 0
    ready_for_review_count: int = 0


class ReviewSummaryView(BaseModel):
    generated_at: datetime
    overdue_reviews: int
    adherence_summary: dict[str, float] = Field(default_factory=dict)
    failure_attribution_summary: dict[str, int] = Field(default_factory=dict)
    realism_warning_violations: int
    review_completion_trend: dict[str, float] = Field(default_factory=dict)


class PilotSummaryView(BaseModel):
    generated_at: datetime
    gate_state: str
    blockers: list[str] = Field(default_factory=list)
    ticket_funnel: dict[str, float] = Field(default_factory=dict)
    divergence_metrics: dict[str, float] = Field(default_factory=dict)
    adapter_health: list[AdapterHealthView] = Field(default_factory=list)
    audit_anomalies: list[AuditLogView] = Field(default_factory=list)
    asset_class_trust_split: list[dict[str, Any]] = Field(default_factory=list)


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
    lifecycle_state: str
    lifecycle_updated_at: datetime
    lifecycle_note: str
    tags: list[str]
    validation: dict[str, Any]
    data_reality: DataRealityView | None = None


class ForwardValidationSummaryView(BaseModel):
    sample_size: int
    hit_rate: float
    expectancy_proxy: float
    drawdown: float
    target_attainment: float
    invalidation_rate: float
    time_stop_frequency: float
    modes: dict[str, int]


class ForwardValidationRecordView(BaseModel):
    validation_id: str
    strategy_name: str
    mode: str
    signal_id: str | None
    risk_report_id: str | None
    trade_id: str | None
    opened_at: datetime
    closed_at: datetime | None
    entry_price: float
    exit_price: float
    pnl_pct: float
    drawdown_pct: float
    target_attained: bool
    invalidated: bool
    time_stopped: bool
    data_quality: str
    notes: str


class CalibrationBucketView(BaseModel):
    bucket: str
    sample_size: int
    avg_score: float
    avg_confidence: float
    hit_rate: float
    expectancy_proxy: float
    invalidation_rate: float
    target_attainment: float


class CalibrationSnapshotView(BaseModel):
    strategy_name: str
    created_at: datetime
    bucket_kind: str
    buckets: list[CalibrationBucketView]
    notes: str


class PromotionTransitionView(BaseModel):
    strategy_name: str
    from_state: str
    to_state: str
    changed_at: datetime
    note: str


class PromotionRationaleView(BaseModel):
    state: str
    recommended_state: str
    gate_results: dict[str, bool]
    notes: list[str]
    penalties: list[DataRealismPenaltyView]


class StrategyDetailView(StrategyListView):
    search_space: dict[str, Any]
    spec: dict[str, Any]
    promotion_rationale: PromotionRationaleView
    operator_feedback_summary: StrategyOperatorFeedbackView | None = None
    calibration_summary: list[CalibrationSnapshotView]
    forward_validation_summary: ForwardValidationSummaryView
    forward_validation_records: list[ForwardValidationRecordView]
    data_realism_penalties: list[DataRealismPenaltyView]
    transition_history: list[PromotionTransitionView]


class StrategyLifecycleUpdateRequest(BaseModel):
    to_state: str
    note: str = ""


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
    lifecycle_state: str = "experimental"
    data_realism_penalties: list[DataRealismPenaltyView] = Field(default_factory=list)
    data_reality: DataRealityView | None = None


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
    promotion_rationale: PromotionRationaleView | None = None
    forward_validation_summary: ForwardValidationSummaryView | None = None
    calibration_summary: list[CalibrationSnapshotView] = Field(default_factory=list)


ReplayFrameView.model_rebuild()
ReplayView.model_rebuild()
