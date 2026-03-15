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
  tags: string[];
  validation: Record<string, unknown>;
}

export interface StrategyDetailView extends StrategyListView {
  search_space: Record<string, unknown>;
  spec: Record<string, unknown>;
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
