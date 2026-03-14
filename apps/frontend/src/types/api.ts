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
  symbol: string;
  signal_type: string;
  timestamp: string;
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

export interface NewsView {
  source: string;
  published_at: string;
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
}

export interface RiskView {
  symbol: string;
  as_of: string;
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
  symbol: string;
  entered_at: string;
  note: string;
  mood: string;
  tags: string[];
  setup_quality: number;
  execution_quality: number;
  follow_through: string;
  outcome: string;
  lessons: string;
  review_status: string;
}
