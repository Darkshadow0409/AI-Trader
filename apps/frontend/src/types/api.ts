export interface HealthView {
  status: string;
  sqlite_path: string;
  duckdb_path: string;
  parquet_dir: string;
}

export interface BarView {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DataRealismPenaltyView {
  code: string;
  severity: string;
  summary: string;
  score_penalty: number;
}

export interface AssetProvenanceView {
  symbol: string;
  underlying_asset: string;
  research_symbol: string;
  tradable_symbol: string;
  intended_venue: string;
  intended_instrument: string;
  source_name: string;
  source_type: string;
  source_timing: string;
  freshness_sla_minutes: number;
  realism_grade: string;
  proxy_mapping_notes: string;
  asset_class: string;
}

export interface DataRealityView {
  provenance: AssetProvenanceView;
  freshness_minutes: number;
  freshness_state: string;
  event_recency_minutes: number | null;
  realism_score: number;
  ranking_penalty: number;
  promotion_blocked: boolean;
  alert_allowed: boolean;
  execution_suitability: string;
  news_suitability: string;
  ui_warning: string;
  timing_semantics_note: string;
  event_context_note: string;
  penalties: DataRealismPenaltyView[];
  tradable_alignment_note: string;
}

export interface SignalView {
  signal_id: string;
  symbol: string;
  signal_type: string;
  timestamp: string;
  freshness_minutes: number;
  direction: string;
  score: number;
  confidence: number;
  noise_probability: number;
  thesis: string;
  invalidation: number;
  targets: Record<string, number>;
  uncertainty: number;
  data_quality: string;
  affected_assets: string[];
  features: Record<string, unknown>;
  data_reality: DataRealityView | null;
}

export interface SignalEvidenceView {
  label: string;
  value: string;
  verdict: string;
  note: string;
}

export interface NewsView {
  source: string;
  published_at: string;
  freshness_minutes: number;
  title: string;
  summary: string;
  url: string;
  tags: string[];
  entity_tags: string[];
  affected_assets: string[];
  data_quality: string;
}

export interface WatchlistView {
  symbol: string;
  label: string;
  thesis: string;
  priority: number;
  status: string;
  last_signal_score: number;
  updated_at: string;
  freshness_minutes: number;
}

export interface OpportunityView {
  symbol: string;
  label: string;
  queue: string;
  score: number;
  score_decomposition: Record<string, number>;
  promotion_reasons: string[];
  freshness_minutes: number;
  risk_notes: string[];
  signal_id: string | null;
  risk_report_id: string | null;
  status: string;
  data_reality: DataRealityView | null;
}

export interface OpportunityHunterView {
  generated_at: string;
  focus_queue: OpportunityView[];
  scout_queue: OpportunityView[];
}

export interface RiskView {
  risk_report_id: string;
  signal_id: string;
  symbol: string;
  as_of: string;
  freshness_minutes: number;
  stop_price: number;
  size_band: string;
  max_portfolio_risk_pct: number;
  exposure_cluster: string;
  uncertainty: number;
  data_quality: string;
  scenario_shocks: Record<string, number>;
  report: Record<string, unknown>;
  data_reality: DataRealityView | null;
}

export interface RiskExposureView {
  cluster: string;
  symbols: string[];
  gross_risk_pct: number;
  worst_scenario_pct: number;
}

export interface SignalDetailView extends SignalView {
  evidence: SignalEvidenceView[];
  catalyst_news: NewsView[];
  related_risk: RiskView | null;
  freshness_status: string;
}

export interface RiskDetailView extends RiskView {
  linked_signal: SignalView | null;
  stop_logic: Record<string, unknown>;
  risk_notes: string[];
  cluster_exposure: RiskExposureView | null;
  freshness_status: string;
}

export interface RibbonView {
  macro_regime: string;
  data_freshness_minutes: number;
  freshness_status: string;
  risk_budget_used_pct: number;
  risk_budget_total_pct: number;
  pipeline_status: string;
  source_mode: string;
  last_refresh: string | null;
  next_event: Record<string, unknown> | null;
}

export interface ResearchView {
  symbol: string;
  label: string;
  timeframe: string;
  last_price: number;
  return_1d_pct: number;
  return_5d_pct: number;
  trend_state: string;
  relative_volume: number;
  atr_pct: number;
  breakout_distance: number;
  structure_score: number;
  data_quality: string;
  data_reality: DataRealityView | null;
}

export interface StrategyListView {
  name: string;
  version: string;
  template: string;
  description: string;
  underlying_symbol: string;
  tradable_symbol: string;
  timeframe: string;
  warmup_bars: number;
  fees_bps: number;
  slippage_bps: number;
  proxy_grade: boolean;
  promoted: boolean;
  lifecycle_state: string;
  lifecycle_updated_at: string;
  lifecycle_note: string;
  tags: string[];
  validation: Record<string, unknown>;
  data_reality: DataRealityView | null;
}

export interface ForwardValidationSummaryView {
  sample_size: number;
  hit_rate: number;
  expectancy_proxy: number;
  drawdown: number;
  target_attainment: number;
  invalidation_rate: number;
  time_stop_frequency: number;
  modes: Record<string, number>;
}

export interface ForwardValidationRecordView {
  validation_id: string;
  strategy_name: string;
  mode: string;
  signal_id: string | null;
  risk_report_id: string | null;
  trade_id: string | null;
  opened_at: string;
  closed_at: string | null;
  entry_price: number;
  exit_price: number;
  pnl_pct: number;
  drawdown_pct: number;
  target_attained: boolean;
  invalidated: boolean;
  time_stopped: boolean;
  data_quality: string;
  notes: string;
}

export interface CalibrationBucketView {
  bucket: string;
  sample_size: number;
  avg_score: number;
  avg_confidence: number;
  hit_rate: number;
  expectancy_proxy: number;
  invalidation_rate: number;
  target_attainment: number;
}

export interface CalibrationSnapshotView {
  strategy_name: string;
  created_at: string;
  bucket_kind: string;
  buckets: CalibrationBucketView[];
  notes: string;
}

export interface PromotionTransitionView {
  strategy_name: string;
  from_state: string;
  to_state: string;
  changed_at: string;
  note: string;
}

export interface PromotionRationaleView {
  state: string;
  recommended_state: string;
  gate_results: Record<string, boolean>;
  notes: string[];
  penalties: DataRealismPenaltyView[];
}

export interface StrategyOperatorFeedbackView {
  trade_count: number;
  adherence_rate: number;
  adherence_adjusted_expectancy_proxy: number;
  realism_adjusted_expectancy_proxy: number;
  operator_error_rate: number;
  drift_indicator: string;
  dominant_failure_categories: string[];
  notes: string[];
}

export interface StrategyDetailView extends StrategyListView {
  search_space: Record<string, unknown>;
  spec: Record<string, unknown>;
  promotion_rationale: PromotionRationaleView;
  operator_feedback_summary: StrategyOperatorFeedbackView | null;
  calibration_summary: CalibrationSnapshotView[];
  forward_validation_summary: ForwardValidationSummaryView;
  forward_validation_records: ForwardValidationRecordView[];
  data_realism_penalties: DataRealismPenaltyView[];
  transition_history: PromotionTransitionView[];
}

export interface EquityCurvePoint {
  timestamp: string;
  equity: number;
}

export interface TradeView {
  entry_time: string;
  exit_time: string;
  side: string;
  entry_price: number;
  exit_price: number;
  pnl_pct: number;
}

export interface HeatmapView {
  x_param: string;
  y_param: string;
  x_labels: string[];
  y_labels: string[];
  values: number[][];
}

export interface RegimeSummaryView {
  regime: string;
  return_pct: number;
  trade_count: number;
  win_rate: number;
}

export interface BacktestListView {
  id: number;
  strategy_name: string;
  engine: string;
  status: string;
  symbol: string;
  timeframe: string;
  created_at: string;
  proxy_grade: boolean;
  promoted_candidate: boolean;
  search_method: string;
  robustness_score: number;
  net_return_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  trade_count: number;
  lifecycle_state: string;
  data_realism_penalties: DataRealismPenaltyView[];
  data_reality: DataRealityView | null;
}

export interface BacktestDetailView extends BacktestListView {
  completed_at: string | null;
  fees_bps: number;
  slippage_bps: number;
  warmup_bars: number;
  validation: Record<string, unknown>;
  summary: Record<string, unknown>;
  equity_curve: EquityCurvePoint[];
  trades: TradeView[];
  stability_heatmap: HeatmapView[];
  regime_summary: RegimeSummaryView[];
  metadata: Record<string, unknown>;
  promotion_rationale: PromotionRationaleView | null;
  forward_validation_summary: ForwardValidationSummaryView | null;
  calibration_summary: CalibrationSnapshotView[];
}

export interface BacktestRunRequest {
  strategy_name: string;
  symbol?: string | null;
  search_method?: "grid" | "random" | "optuna";
  max_trials?: number;
  promote_candidate?: boolean;
  parameter_overrides?: Record<string, unknown>;
}

export interface AssetContextView {
  symbol: string;
  latest_signal: SignalView | null;
  latest_risk: RiskView | null;
  research: ResearchView | null;
  related_news: NewsView[];
  latest_backtest: BacktestListView | null;
  data_reality: DataRealityView | null;
}

export interface ActiveTradeView {
  trade_id: string;
  symbol: string;
  strategy_name: string;
  side: string;
  entry_time: string;
  entry_price: number;
  current_price: number;
  stop_price: number;
  target_price: number;
  pnl_pct: number;
  size_band: string;
  status: string;
  thesis: string;
  data_quality: string;
  signal_id: string | null;
  risk_report_id: string | null;
  notes: string;
  updated_at: string;
  freshness_minutes: number;
}

export interface ActiveTradeCreateRequest {
  symbol: string;
  strategy_name: string;
  side: string;
  entry_time: string;
  entry_price: number;
  current_price: number;
  stop_price: number;
  target_price: number;
  size_band: string;
  status: string;
  thesis: string;
  signal_id?: string | null;
  risk_report_id?: string | null;
  notes?: string;
  data_quality?: string;
}

export interface ActiveTradeUpdateRequest {
  current_price?: number;
  stop_price?: number;
  target_price?: number;
  status?: string;
  size_band?: string;
  thesis?: string;
  notes?: string;
  signal_id?: string | null;
  risk_report_id?: string | null;
}

export interface PaperTradeOutcomeView {
  entry_quality_label: string;
  entry_zone_delta_pct: number;
  stop_adherence: boolean;
  target_attainment: string;
  time_to_outcome_minutes: number;
  mfe_pct: number;
  mae_pct: number;
  plan_adherence_flags: Record<string, boolean>;
  realized_pnl_pct: number;
}

export interface PaperTradeAdherenceView {
  entered_inside_suggested_zone: boolean | null;
  invalidation_respected: boolean | null;
  time_stop_respected: boolean | null;
  realism_warning_ignored: boolean | null;
  size_plan_respected: boolean | null;
  exited_per_plan: boolean | null;
  adherence_score: number;
  breached_rules: string[];
}

export interface PaperTradeReviewView {
  review_id: string;
  trade_id: string;
  thesis_respected: boolean | null;
  invalidation_respected: boolean | null;
  entered_inside_suggested_zone: boolean | null;
  time_stop_respected: boolean | null;
  entered_too_early: boolean | null;
  entered_too_late: boolean | null;
  oversized: boolean | null;
  undersized: boolean | null;
  realism_warning_ignored: boolean | null;
  size_plan_respected: boolean | null;
  exited_per_plan: boolean | null;
  catalyst_mattered: boolean | null;
  failure_category: string;
  failure_categories: string[];
  operator_notes: string;
  updated_at: string;
}

export interface PaperTradeView {
  trade_id: string;
  signal_id: string | null;
  risk_report_id: string | null;
  strategy_id: string | null;
  symbol: string;
  side: string;
  proposed_entry_zone: Record<string, number>;
  actual_entry: number | null;
  stop: number;
  targets: Record<string, number>;
  size_plan: Record<string, unknown>;
  actual_size: number;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  close_reason: string;
  close_price: number | null;
  notes: string;
  freshness_minutes: number;
  data_quality: string;
  lifecycle_events: Array<Record<string, unknown>>;
  outcome: PaperTradeOutcomeView | null;
  adherence: PaperTradeAdherenceView | null;
  review_due: boolean;
  data_reality: DataRealityView | null;
}

export interface PaperTradeDetailView extends PaperTradeView {
  linked_signal: SignalView | null;
  linked_risk: RiskView | null;
  review: PaperTradeReviewView | null;
}

export interface PaperTradeProposalRequest {
  signal_id: string;
  risk_report_id?: string | null;
  strategy_id?: string | null;
  symbol?: string | null;
  side?: string | null;
  notes?: string;
}

export interface PaperTradeOpenRequest {
  actual_entry: number;
  actual_size: number;
  opened_at?: string;
  notes?: string;
}

export interface PaperTradeScaleRequest {
  actual_entry: number;
  added_size: number;
  notes?: string;
}

export interface PaperTradePartialExitRequest {
  exit_price: number;
  exit_size: number;
  closed_at?: string;
  close_reason?: string;
  notes?: string;
}

export interface PaperTradeCloseRequest {
  close_price: number;
  closed_at?: string;
  close_reason: string;
  notes?: string;
}

export interface PaperTradeReviewRequest {
  thesis_respected?: boolean | null;
  invalidation_respected?: boolean | null;
  entered_inside_suggested_zone?: boolean | null;
  time_stop_respected?: boolean | null;
  entered_too_early?: boolean | null;
  entered_too_late?: boolean | null;
  oversized?: boolean | null;
  undersized?: boolean | null;
  realism_warning_ignored?: boolean | null;
  size_plan_respected?: boolean | null;
  exited_per_plan?: boolean | null;
  catalyst_mattered?: boolean | null;
  failure_category?: string;
  failure_categories?: string[];
  operator_notes?: string;
}

export interface PaperTradeAnalyticsBucketView {
  grouping: string;
  key: string;
  trade_count: number;
  hit_rate: number;
  expectancy_proxy: number;
  target_attainment_rate: number;
  invalidation_rate: number;
  avg_entry_zone_delta_pct: number;
  avg_mfe_pct: number;
  avg_mae_pct: number;
}

export interface PaperTradeFailureCategoryView {
  category: string;
  trade_count: number;
  operator_error: boolean;
}

export interface PaperTradeHygieneSummaryView {
  trade_count: number;
  reviewed_trade_count: number;
  adherence_rate: number;
  invalidation_discipline_rate: number;
  realism_warning_violation_rate: number;
  review_completion_rate: number;
  poor_adherence_streak: number;
  review_backlog: number;
  realism_warning_violation_count: number;
  invalidation_breach_count: number;
  promoted_strategy_drift_count: number;
  promoted_strategy_drift: string[];
}

export interface PaperTradeAnalyticsView {
  generated_at: string;
  by_signal_family: PaperTradeAnalyticsBucketView[];
  by_asset_class: PaperTradeAnalyticsBucketView[];
  by_strategy: PaperTradeAnalyticsBucketView[];
  by_strategy_lifecycle_state: PaperTradeAnalyticsBucketView[];
  by_score_bucket: PaperTradeAnalyticsBucketView[];
  by_realism_bucket: PaperTradeAnalyticsBucketView[];
  by_realism_grade: PaperTradeAnalyticsBucketView[];
  by_freshness_state: PaperTradeAnalyticsBucketView[];
  by_asset: PaperTradeAnalyticsBucketView[];
  hygiene_summary: PaperTradeHygieneSummaryView;
  failure_categories: PaperTradeFailureCategoryView[];
}

export interface WalletBalanceLineView {
  asset: string;
  free: number;
  locked: number;
  usd_value: number;
}

export interface WalletBalanceView {
  venue: string;
  account_label: string;
  updated_at: string;
  total_usd: number;
  available_usd: number;
  data_quality: string;
  balances: WalletBalanceLineView[];
}

export interface JournalReviewView {
  journal_id: string;
  symbol: string;
  entered_at: string;
  entry_type: string;
  note: string;
  mood: string;
  tags: string[];
  signal_id: string | null;
  risk_report_id: string | null;
  trade_id: string | null;
  setup_quality: number;
  execution_quality: number;
  follow_through: string;
  outcome: string;
  lessons: string;
  review_status: string;
  updated_at: string;
  freshness_minutes: number;
}

export interface JournalEntryCreateRequest {
  symbol: string;
  entered_at: string;
  entry_type?: string;
  note: string;
  mood: string;
  tags?: string[];
  signal_id?: string | null;
  risk_report_id?: string | null;
  trade_id?: string | null;
  setup_quality?: number;
  execution_quality?: number;
  follow_through?: string;
  outcome?: string;
  lessons?: string;
  review_status?: string;
}

export interface JournalEntryUpdateRequest {
  note?: string;
  mood?: string;
  tags?: string[];
  signal_id?: string | null;
  risk_report_id?: string | null;
  trade_id?: string | null;
  setup_quality?: number;
  execution_quality?: number;
  follow_through?: string;
  outcome?: string;
  lessons?: string;
  review_status?: string;
}

export interface AlertEnvelope {
  alert_id: string;
  created_at: string;
  signal_id: string | null;
  risk_report_id: string | null;
  asset_ids: string[];
  severity: string;
  category: string;
  channel_targets: string[];
  title: string;
  body: string;
  tags: string[];
  dedupe_key: string;
  status: string;
  delivery_metadata: Record<string, unknown>;
  data_quality: string;
  suppressed_reason: string | null;
}
