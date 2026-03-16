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


class AssetContextView(BaseModel):
    symbol: str
    latest_signal: SignalView | None
    latest_risk: RiskView | None
    research: ResearchView | None
    related_news: list[NewsView]
    latest_backtest: BacktestListView | None
    data_reality: DataRealityView | None = None


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


class PaperTradeAdherenceView(BaseModel):
    entered_inside_suggested_zone: bool | None = None
    invalidation_respected: bool | None = None
    time_stop_respected: bool | None = None
    realism_warning_ignored: bool | None = None
    size_plan_respected: bool | None = None
    exited_per_plan: bool | None = None
    adherence_score: float = 0.0
    breached_rules: list[str] = Field(default_factory=list)


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
    adherence: PaperTradeAdherenceView | None = None
    review_due: bool = False
    data_reality: DataRealityView | None = None


class PaperTradeDetailView(PaperTradeView):
    linked_signal: SignalView | None = None
    linked_risk: RiskView | None = None
    review: PaperTradeReviewView | None = None


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
