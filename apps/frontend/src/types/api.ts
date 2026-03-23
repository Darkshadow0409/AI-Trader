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

export interface ChartIndicatorPointView {
  timestamp: string;
  value: number;
}

export interface ChartIndicatorSetView {
  ema_20: ChartIndicatorPointView[];
  ema_50: ChartIndicatorPointView[];
  ema_200: ChartIndicatorPointView[];
  rsi_14: ChartIndicatorPointView[];
  atr_14: ChartIndicatorPointView[];
}

export interface ChartOverlayMarkerView {
  marker_id: string;
  timestamp: string;
  label: string;
  kind: string;
  tone: string;
}

export interface ChartOverlayLineView {
  line_id: string;
  label: string;
  value: number;
  kind: string;
  tone: string;
}

export interface ChartOverlayView {
  markers: ChartOverlayMarkerView[];
  price_lines: ChartOverlayLineView[];
}

export interface InstrumentMappingView {
  requested_symbol: string;
  canonical_symbol: string;
  trader_symbol: string;
  display_symbol: string;
  display_name: string;
  underlying_asset: string;
  research_symbol: string;
  public_symbol: string;
  broker_symbol: string;
  broker_truth: boolean;
  mapping_notes: string;
}

export interface MarketChartView {
  symbol: string;
  timeframe: string;
  available_timeframes: string[];
  status: string;
  status_note: string;
  source_mode: string;
  market_data_mode: string;
  freshness_minutes: number;
  freshness_state: string;
  data_quality: string;
  is_fixture_mode: boolean;
  bars: BarView[];
  indicators: ChartIndicatorSetView;
  overlays: ChartOverlayView;
  instrument_mapping: InstrumentMappingView;
  data_reality: DataRealityView | null;
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

export interface PolymarketOutcomeView {
  label: string;
  probability: number;
}

export interface PolymarketMarketView {
  market_id: string;
  event_id: string | null;
  event_title: string;
  question: string;
  slug: string;
  status: string;
  active: boolean;
  closed: boolean;
  end_date: string | null;
  volume: number;
  liquidity: number;
  recent_activity: number;
  open_interest: number;
  primary_tag: string;
  tags: string[];
  category: string;
  outcomes: PolymarketOutcomeView[];
  source_status: string;
  source_note: string;
  related_assets: string[];
  relevance_score: number;
  relevance_reason: string;
  url: string;
}

export interface PolymarketEventView {
  event_id: string;
  title: string;
  slug: string;
  status: string;
  active: boolean;
  closed: boolean;
  end_date: string | null;
  volume: number;
  liquidity: number;
  recent_activity: number;
  category: string;
  primary_tag: string;
  tags: string[];
  market_count: number;
  markets: PolymarketMarketView[];
  source_status: string;
  source_note: string;
  related_assets: string[];
}

export interface PolymarketHunterView {
  generated_at: string;
  source_status: string;
  source_note: string;
  query: string;
  tag: string;
  sort: string;
  available_tags: string[];
  events: PolymarketEventView[];
  markets: PolymarketMarketView[];
}

export interface NewsView {
  source: string;
  published_at: string;
  freshness_minutes: number;
  freshness_state: string;
  title: string;
  summary: string;
  url: string;
  tags: string[];
  entity_tags: string[];
  affected_assets: string[];
  primary_asset: string | null;
  event_relevance: string;
  market_data_mode: string;
  data_quality: string;
  related_polymarket_markets?: PolymarketMarketView[];
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
  freshness_state: string;
}

export interface WatchlistSummaryView {
  symbol: string;
  label: string;
  status: string;
  last_price: number;
  change_pct: number;
  freshness_minutes: number;
  freshness_state: string;
  realism_grade: string;
  market_data_mode: string;
  source_label: string;
  top_setup_tag: string;
  sparkline: number[];
  instrument_mapping: InstrumentMappingView;
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
  related_polymarket_markets?: PolymarketMarketView[];
  crowd_implied_narrative?: string;
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
  market_data_as_of: string | null;
  system_refresh_minutes: number | null;
  system_refresh_status: string;
  risk_budget_used_pct: number;
  risk_budget_total_pct: number;
  pipeline_status: string;
  source_mode: string;
  market_data_mode: string;
  data_mode_label: string;
  feed_source_label: string;
  mode_explainer: string;
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
  related_polymarket_markets?: PolymarketMarketView[];
  crowd_implied_narrative?: string;
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
  related_polymarket_markets?: PolymarketMarketView[];
  crowd_implied_narrative?: string;
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

export interface ExecutionRealismView {
  entry_slippage_bps: number;
  stop_slippage_bps: number;
  target_fill_mode: string;
  gap_through_stop_flag: boolean;
  event_latency_penalty: number;
  delayed_source_penalty: number;
  effective_entry: number | null;
  effective_stop: number | null;
  fill_note: string;
}

export interface ExecutionQualityView {
  signal_quality: string;
  plan_quality: string;
  execution_quality: string;
  slippage_penalty_bps: number;
  latency_penalty: number;
  delayed_penalty: number;
  notes: string[];
}

export interface ScenarioStressItemView {
  scenario: string;
  entity_type: string;
  entity_id: string;
  symbol: string;
  severity: string;
  shock_pct: number;
  pnl_impact_pct: number;
  confidence_impact: number;
  rationale: string;
}

export interface ScenarioStressSummaryView {
  generated_at: string;
  signal_impacts: ScenarioStressItemView[];
  active_trade_impacts: ScenarioStressItemView[];
  promoted_strategy_impacts: ScenarioStressItemView[];
}

export interface TradeTimelineEventView {
  timestamp: string;
  phase: string;
  event_type: string;
  title: string;
  note: string;
  price: number | null;
  related_alert_ids: string[];
}

export interface TradeTimelineView {
  trade_id: string;
  symbol: string;
  generated_at: string;
  pre_event: TradeTimelineEventView[];
  event_trigger: TradeTimelineEventView[];
  post_event: TradeTimelineEventView[];
  trade_actions: TradeTimelineEventView[];
  progression: TradeTimelineEventView[];
}

export interface ReplayFrameView {
  cursor: string;
  bars: BarView[];
  signals: SignalView[];
  risks: RiskView[];
  alerts: AlertEnvelope[];
  paper_trades: PaperTradeView[];
}

export interface ReplayView {
  generated_at: string;
  symbol: string;
  signal_id: string | null;
  trade_id: string | null;
  event_window_minutes: number;
  frames: ReplayFrameView[];
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

export interface PaperAccountSummaryView {
  account_size: number;
  current_equity: number;
  allocated_capital: number;
  open_risk_amount: number;
  projected_base_pnl: number;
  projected_stretch_pnl: number;
  projected_stop_loss: number;
  risk_pct_of_account: number;
  projected_reward_to_risk: number;
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
  execution_realism: ExecutionRealismView | null;
  execution_quality: ExecutionQualityView | null;
  adherence: PaperTradeAdherenceView | null;
  review_due: boolean;
  paper_account: PaperAccountSummaryView | null;
  data_reality: DataRealityView | null;
}

export interface PaperTradeDetailView extends PaperTradeView {
  linked_signal: SignalView | null;
  linked_risk: RiskView | null;
  review: PaperTradeReviewView | null;
  timeline: TradeTimelineView | null;
  scenario_stress: ScenarioStressItemView[];
}

export interface TradeTicketChecklistView {
  freshness_acceptable: boolean;
  realism_acceptable: boolean;
  risk_budget_available: boolean;
  cluster_exposure_acceptable: boolean;
  review_complete: boolean;
  operator_acknowledged: boolean;
  completed: boolean;
  blocked_reasons: string[];
}

export interface ShadowObservationView {
  observed_at: string;
  observed_price: number;
  planned_reference_price: number;
  observed_vs_plan_pct: number;
  ticket_valid: boolean;
  divergence_flag: boolean;
  divergence_reason: string;
  market_path_note: string;
  freshness_state: string;
}

export interface ManualFillReconciliationView {
  planned_entry_reference: number;
  actual_fill_price: number;
  actual_slippage_bps: number;
  modeled_slippage_bps: number;
  slippage_variance_bps: number;
  entered_inside_zone: boolean;
  requires_review: boolean;
  summary: string;
}

export interface ManualFillView {
  fill_id: string;
  ticket_id: string;
  trade_id: string | null;
  source: string;
  symbol: string;
  side: string;
  filled_at: string;
  fill_price: number;
  fill_size: number;
  fees: number;
  slippage_bps: number;
  notes: string;
  import_batch_id: string | null;
  reconciliation: ManualFillReconciliationView;
}

export interface BrokerBalanceView {
  venue: string;
  account_label: string;
  asset: string;
  free: number;
  locked: number;
  usd_value: number;
  source_type: string;
}

export interface BrokerPositionView {
  venue: string;
  symbol: string;
  side: string;
  size: number;
  entry_price: number;
  mark_price: number;
  unrealized_pnl_pct: number;
  source_type: string;
}

export interface BrokerFillImportView {
  venue: string;
  import_batch_id: string;
  fill_count: number;
  latest_fill_at: string | null;
  notes: string;
  source_type: string;
}

export interface BrokerAdapterSnapshotView {
  generated_at: string;
  balances: BrokerBalanceView[];
  positions: BrokerPositionView[];
  fill_imports: BrokerFillImportView[];
}

export interface TradeTicketView {
  ticket_id: string;
  signal_id: string | null;
  risk_report_id: string | null;
  trade_id: string | null;
  strategy_id: string | null;
  symbol: string;
  side: string;
  proposed_entry_zone: Record<string, number>;
  planned_stop: number;
  planned_targets: Record<string, number>;
  planned_size: Record<string, unknown>;
  realism_summary: Record<string, unknown>;
  freshness_summary: Record<string, unknown>;
  checklist_status: TradeTicketChecklistView;
  approval_status: string;
  status: string;
  shadow_status: string;
  created_at: string;
  expires_at: string | null;
  notes: string;
  freshness_minutes: number;
  linked_signal_family: string;
  paper_account: PaperAccountSummaryView | null;
  data_reality: DataRealityView | null;
}

export interface TradeTicketDetailView extends TradeTicketView {
  linked_signal: SignalDetailView | null;
  linked_risk: RiskDetailView | null;
  linked_trade: PaperTradeDetailView | null;
  shadow_summary: ShadowObservationView | null;
  manual_fills: ManualFillView[];
  broker_snapshot: BrokerAdapterSnapshotView | null;
}

export interface TradeTicketCreateRequest {
  signal_id: string;
  risk_report_id?: string | null;
  trade_id?: string | null;
  strategy_id?: string | null;
  symbol?: string | null;
  side?: string | null;
  expires_at?: string | null;
  notes?: string;
}

export interface TradeTicketUpdateRequest {
  proposed_entry_zone?: Record<string, number>;
  planned_stop?: number;
  planned_targets?: Record<string, number>;
  planned_size?: Record<string, unknown>;
  checklist_status?: Record<string, boolean>;
  expires_at?: string | null;
  notes?: string;
  status?: string;
}

export interface TradeTicketApprovalRequest {
  approval_status: string;
  approval_notes?: string;
}

export interface ManualFillCreateRequest {
  fill_price: number;
  fill_size: number;
  filled_at?: string;
  fees?: number;
  notes?: string;
  trade_id?: string | null;
}

export interface ManualFillImportRequest {
  fills: ManualFillCreateRequest[];
  import_batch_id?: string | null;
  notes?: string;
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
  by_signal_quality: PaperTradeAnalyticsBucketView[];
  by_plan_quality: PaperTradeAnalyticsBucketView[];
  by_execution_quality: PaperTradeAnalyticsBucketView[];
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

export interface ReviewTaskView {
  task_id: string;
  task_type: string;
  title: string;
  summary: string;
  state: string;
  priority: string;
  session_state: string;
  linked_entity_type: string;
  linked_entity_id: string;
  linked_symbol: string;
  signal_id: string | null;
  risk_report_id: string | null;
  trade_id: string | null;
  strategy_name: string | null;
  due_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  freshness_minutes: number;
  overdue: boolean;
  notes: string;
  metadata: Record<string, unknown>;
}

export interface ReviewTaskUpdateRequest {
  state: string;
  notes?: string;
}

export interface BriefingTradeAttentionView {
  trade_id: string;
  symbol: string;
  status: string;
  attention_reason: string;
  freshness_minutes: number;
  signal_id: string | null;
  risk_report_id: string | null;
}

export interface DegradedSourceView {
  symbol: string;
  source_type: string;
  source_timing: string;
  freshness_state: string;
  realism_grade: string;
  warning: string;
}

export interface StrategyDriftWarningView {
  strategy_name: string;
  lifecycle_state: string;
  drift_indicator: string;
  note: string;
}

export interface DailyBriefingView {
  generated_at: string;
  top_ranked_signals: SignalView[];
  high_risk_setups: SignalView[];
  open_trades_needing_attention: BriefingTradeAttentionView[];
  exposure_summary: RiskExposureView[];
  degraded_data_sources: DegradedSourceView[];
  scout_to_focus_promotions: OpportunityView[];
  promoted_strategy_drift_warnings: StrategyDriftWarningView[];
}

export interface WeeklyReviewView {
  generated_at: string;
  signal_family_outcomes: PaperTradeAnalyticsBucketView[];
  adherence_trend: PaperTradeHygieneSummaryView;
  failure_attribution_trend: PaperTradeFailureCategoryView[];
  realism_warning_violations: PaperTradeReviewView[];
  strategy_promotion_health: StrategyDriftWarningView[];
  paper_trade_outcome_distribution: Record<string, number>;
}

export interface OperationalBacklogItemView {
  item_id: string;
  category: string;
  title: string;
  priority: string;
  status: string;
  linked_symbol: string;
  linked_entity_type: string;
  linked_entity_id: string;
  due_at: string | null;
  freshness_minutes: number;
  note: string;
}

export interface OperationalBacklogView {
  generated_at: string;
  overdue_count: number;
  high_priority_count: number;
  items: OperationalBacklogItemView[];
}

export interface SessionStateView {
  state: string;
  title: string;
  headline: string;
  summary: string;
  item_count: number;
  overdue_count: number;
  high_priority_count: number;
  freshness_status: string;
}

export interface SessionOverviewView {
  generated_at: string;
  states: SessionStateView[];
  review_tasks: ReviewTaskView[];
  daily_briefing: DailyBriefingView;
  weekly_review: WeeklyReviewView;
  operational_backlog: OperationalBacklogView;
}

export interface DeskSummaryView {
  generated_at: string;
  session_states: SessionStateView[];
  execution_gate: ExecutionGateView;
  operational_backlog: OperationalBacklogView;
  section_readiness: Record<string, string>;
  section_notes: Record<string, string>;
  review_tasks: ReviewTaskView[];
  degraded_sources: DegradedSourceView[];
  high_priority_signals: SignalView[];
  high_risk_signals: SignalView[];
  focus_opportunities: OpportunityView[];
  open_tickets: TradeTicketView[];
  active_paper_trades: PaperTradeView[];
  shadow_divergence: Array<Record<string, unknown>>;
  adapter_health: AdapterHealthView[];
  audit_log_tail: AuditLogView[];
}

export interface PilotMetricSummaryView {
  generated_at: string;
  ticket_conversion: Record<string, number>;
  shadow_metrics: Record<string, number>;
  slippage_metrics: Record<string, number>;
  alert_metrics: Record<string, number>;
  adherence_metrics: Record<string, number>;
  review_backlog_metrics: Record<string, number>;
  promoted_strategy_metrics: Record<string, number>;
  mismatch_causes: Array<Record<string, unknown>>;
}

export interface ExecutionGateView {
  status: string;
  blockers: string[];
  thresholds: Record<string, number>;
  metrics: Record<string, number>;
  rationale: string[];
}

export interface AdapterHealthView {
  health_id: string;
  adapter_name: string;
  status: string;
  checked_at: string;
  details: Record<string, unknown>;
}

export interface AuditLogView {
  audit_id: string;
  created_at: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor: string;
  details: Record<string, unknown>;
}

export interface PilotDashboardView {
  generated_at: string;
  pilot_metrics: PilotMetricSummaryView;
  trust_by_asset_class: Array<Record<string, unknown>>;
  divergence_hotspots: Array<Record<string, unknown>>;
  operator_discipline: Record<string, number>;
  review_backlog: OperationalBacklogView;
  execution_gate: ExecutionGateView;
  adapter_health: AdapterHealthView[];
  recent_audit_logs: AuditLogView[];
}

export interface OpsActionSpecView {
  action_name: string;
  label: string;
  category: string;
  is_heavy: boolean;
  warning: string;
}

export interface OpsActionView {
  action_id: string;
  action_name: string;
  category: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string;
  log_path: string | null;
  details: Record<string, unknown>;
}

export interface OpsActionRequest {
  confirm_heavy?: boolean;
}

export interface OpsSummaryView {
  generated_at: string;
  latest_fast_verify: OpsActionView | null;
  latest_full_verify: OpsActionView | null;
  latest_export: OpsActionView | null;
  latest_bundle: OpsActionView | null;
  latest_refresh: OpsActionView | null;
  latest_contract_snapshot: OpsActionView | null;
  action_history: OpsActionView[];
  available_actions: OpsActionSpecView[];
}

export interface AIProviderStatusView {
  provider: string;
  auth_mode: string;
  status: string;
  connected: boolean;
  oauth_enabled: boolean;
  oauth_connect_url: string | null;
  oauth_callback_url: string | null;
  connected_account: string | null;
  default_model: string;
  selected_model: string;
  available_models: string[];
  guidance: string;
  warning: string | null;
  session_expires_at: string | null;
}

export interface AIAgentResultView {
  agent: string;
  headline: string;
  summary: string;
  confidence: number;
  citations: string[];
  warnings: string[];
}

export interface AIAdvisorRequest {
  query: string;
  symbol: string;
  timeframe?: string;
  model?: string | null;
  active_tab?: string | null;
  selected_signal_id?: string | null;
  selected_risk_report_id?: string | null;
}

export interface AIActionStepView {
  label: string;
  workspace: string;
  note: string;
}

export interface AIDeskContextSnapshotView {
  selected_instrument: string;
  active_workspace: string;
  timeframe: string;
  market_freshness: string;
  data_mode_label: string;
  feed_source_label: string;
  truth_note: string;
  signal_focus: string | null;
  risk_focus: string | null;
  watchlist_board: string[];
  catalyst_headlines: string[];
  crowd_markets: string[];
}

export interface AIAdvisorResponseView {
  generated_at: string;
  symbol: string;
  timeframe: string;
  requested_query: string;
  provider_status: AIProviderStatusView;
  market_data_mode: string;
  context_summary: string;
  final_answer: string;
  agent_results: AIAgentResultView[];
  warnings: string[];
  live_data_available: boolean;
  data_truth_note: string;
  context_snapshot: AIDeskContextSnapshotView;
  market_view: string;
  why_it_matters_now: string;
  key_levels: string[];
  catalysts: string[];
  invalidation: string;
  risk_frame: string[];
  related_markets: string[];
  next_actions: AIActionStepView[];
}

export interface CommandCenterStatusView {
  generated_at: string;
  runtime_status: string;
  backend_health: string;
  frontend_runtime_status: string;
  source_mode: string;
  pipeline_status: string;
  pipeline_freshness_minutes: number;
  last_refresh: string | null;
  latest_export_path: string | null;
  latest_export_generated_at: string | null;
  latest_review_bundle_path: string | null;
  latest_review_bundle_generated_at: string | null;
  frontend_build_generated_at: string | null;
  diagnostics_updated_at: string | null;
  verify_fast_available: boolean;
  verify_full_available: boolean;
  review_bundle_available: boolean;
  available_actions: string[];
  safe_actions: OpsActionSpecView[];
  heavy_actions: OpsActionSpecView[];
  latest_fast_verify: OpsActionView | null;
  latest_full_verify: OpsActionView | null;
  latest_export: OpsActionView | null;
  latest_bundle: OpsActionView | null;
  latest_refresh_action: OpsActionView | null;
  latest_contract_snapshot: OpsActionView | null;
  action_history: OpsActionView[];
  notes: string[];
}

export interface PilotExportResponse {
  generated_at: string;
  report_path: string;
  source_mode: string;
  pipeline_status: string;
}

export interface HomeOperatorSummaryView {
  generated_at: string;
  session_states: SessionStateView[];
  session_state: string;
  pilot_gate_state: string;
  degraded_source_count: number;
  review_backlog_counts: Record<string, number>;
  top_signals_summary: SignalView[];
  open_ticket_counts: Record<string, number>;
  active_trade_counts: Record<string, number>;
  shadow_divergence_summary: Record<string, unknown>;
  adapter_health_summary: Record<string, number>;
}

export interface SignalsSummaryView {
  generated_at: string;
  filter_metadata: Record<string, string[]>;
  grouped_counts: Record<string, Record<string, number>>;
  top_ranked_signals: SignalView[];
  warning_counts: Record<string, number>;
}

export interface TicketSummaryView {
  generated_at: string;
  counts_by_state: Record<string, number>;
  checklist_blockers: Record<string, number>;
  shadow_active_count: number;
  reconciliation_needed_count: number;
  ready_for_review_count: number;
}

export interface ReviewSummaryView {
  generated_at: string;
  overdue_reviews: number;
  adherence_summary: Record<string, number>;
  failure_attribution_summary: Record<string, number>;
  realism_warning_violations: number;
  review_completion_trend: Record<string, number>;
}

export interface PilotSummaryView {
  generated_at: string;
  gate_state: string;
  blockers: string[];
  ticket_funnel: Record<string, number>;
  divergence_metrics: Record<string, number>;
  adapter_health: AdapterHealthView[];
  audit_anomalies: AuditLogView[];
  asset_class_trust_split: Array<Record<string, unknown>>;
}
