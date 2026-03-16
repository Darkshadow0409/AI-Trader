import { useEffect, useState } from "react";
import { apiClient } from "./client";
import type {
  ActiveTradeView,
  AlertEnvelope,
  AssetContextView,
  BacktestListView,
  BarView,
  HealthView,
  JournalReviewView,
  NewsView,
  OpportunityHunterView,
  PaperTradeAnalyticsView,
  PaperTradeDetailView,
  PaperTradeReviewView,
  PaperTradeView,
  ResearchView,
  RibbonView,
  RiskDetailView,
  RiskExposureView,
  RiskView,
  SignalDetailView,
  SignalView,
  WalletBalanceView,
  WatchlistView,
} from "../types/api";

export interface ResourceState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function usePollingResource<T>(loader: () => Promise<T>, initialData: T, deps: unknown[] = [], intervalMs = 30000): ResourceState<T> {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runLoad() {
      try {
        const nextData = await loader();
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Request failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void runLoad();
    const timer = window.setInterval(() => {
      void runLoad();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    loading,
    error,
    refresh: async () => {
      const nextData = await loader();
      setData(nextData);
      setError(null);
    },
  };
}

function emptySignalDetail(signalId: string): SignalDetailView {
  return {
    signal_id: signalId,
    symbol: "",
    signal_type: "",
    timestamp: "",
    freshness_minutes: 0,
    direction: "",
    score: 0,
    confidence: 0,
    noise_probability: 0,
    thesis: "",
    invalidation: 0,
    targets: {},
    uncertainty: 0,
    data_quality: "loading",
    affected_assets: [],
    features: {},
    data_reality: null,
    evidence: [],
    catalyst_news: [],
    related_risk: null,
    freshness_status: "loading",
  };
}

function emptyRiskDetail(riskReportId: string): RiskDetailView {
  return {
    risk_report_id: riskReportId,
    signal_id: "",
    symbol: "",
    as_of: "",
    freshness_minutes: 0,
    stop_price: 0,
    size_band: "",
    max_portfolio_risk_pct: 0,
    exposure_cluster: "",
    uncertainty: 0,
    data_quality: "loading",
    scenario_shocks: {},
    report: {},
    data_reality: null,
    linked_signal: null,
    stop_logic: {},
    risk_notes: [],
    cluster_exposure: null,
    freshness_status: "loading",
  };
}

function emptyPaperTradeDetail(tradeId: string): PaperTradeDetailView {
  return {
    trade_id: tradeId,
    signal_id: null,
    risk_report_id: null,
    strategy_id: null,
    symbol: "",
    side: "",
    proposed_entry_zone: {},
    actual_entry: null,
    stop: 0,
    targets: {},
    size_plan: {},
    actual_size: 0,
    status: "",
    opened_at: null,
    closed_at: null,
    close_reason: "",
    close_price: null,
    notes: "",
    freshness_minutes: 0,
    data_quality: "loading",
    lifecycle_events: [],
    outcome: null,
    adherence: null,
    review_due: false,
    data_reality: null,
    linked_signal: null,
    linked_risk: null,
    review: null,
  };
}

export function useDashboardData(
  selectedSymbol: string,
  selectedSignalId: string | null,
  selectedRiskReportId: string | null,
  selectedTradeId: string | null,
) {
  const health = usePollingResource<HealthView>(() => apiClient.health(), {
    status: "loading",
    sqlite_path: "",
    duckdb_path: "",
    parquet_dir: "",
  });
  const overview = usePollingResource<RibbonView>(() => apiClient.overview(), {
    macro_regime: "loading",
    data_freshness_minutes: 0,
    freshness_status: "loading",
    risk_budget_used_pct: 0,
    risk_budget_total_pct: 0,
    pipeline_status: "loading",
    source_mode: "loading",
    last_refresh: null,
    next_event: null,
  });
  const signals = usePollingResource<SignalView[]>(() => apiClient.signals(), []);
  const highRiskSignals = usePollingResource<SignalView[]>(() => apiClient.highRiskSignals(), []);
  const news = usePollingResource<NewsView[]>(() => apiClient.news(), []);
  const watchlist = usePollingResource<WatchlistView[]>(() => apiClient.watchlist(), []);
  const opportunities = usePollingResource<OpportunityHunterView>(
    () => apiClient.opportunities(),
    { generated_at: "", focus_queue: [], scout_queue: [] },
  );
  const research = usePollingResource<ResearchView[]>(() => apiClient.research(), []);
  const risk = usePollingResource<RiskView[]>(() => apiClient.risk(), []);
  const riskExposure = usePollingResource<RiskExposureView[]>(() => apiClient.riskExposure(), []);
  const activeTrades = usePollingResource<ActiveTradeView[]>(() => apiClient.activeTrades(), []);
  const proposedPaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.proposedPaperTrades(), []);
  const activePaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.activePaperTrades(), []);
  const closedPaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.closedPaperTrades(), []);
  const paperTradeAnalytics = usePollingResource<PaperTradeAnalyticsView>(
    () => apiClient.paperTradeAnalytics(),
    {
      generated_at: "",
      by_signal_family: [],
      by_asset_class: [],
      by_strategy: [],
      by_strategy_lifecycle_state: [],
      by_score_bucket: [],
      by_realism_bucket: [],
      by_realism_grade: [],
      by_freshness_state: [],
      by_asset: [],
      hygiene_summary: {
        trade_count: 0,
        reviewed_trade_count: 0,
        adherence_rate: 0,
        invalidation_discipline_rate: 0,
        realism_warning_violation_rate: 0,
        review_completion_rate: 0,
        poor_adherence_streak: 0,
        review_backlog: 0,
        realism_warning_violation_count: 0,
        invalidation_breach_count: 0,
        promoted_strategy_drift_count: 0,
        promoted_strategy_drift: [],
      },
      failure_categories: [],
    },
  );
  const paperTradeReviews = usePollingResource<PaperTradeReviewView[]>(() => apiClient.paperTradeReviews(), []);
  const walletBalance = usePollingResource<WalletBalanceView[]>(() => apiClient.walletBalance(), []);
  const journal = usePollingResource<JournalReviewView[]>(() => apiClient.journal(), []);
  const alerts = usePollingResource<AlertEnvelope[]>(() => apiClient.alerts(), []);
  const backtests = usePollingResource<BacktestListView[]>(() => apiClient.backtests(), []);
  const bars = usePollingResource<BarView[]>(() => apiClient.bars(selectedSymbol), [], [selectedSymbol]);
  const assetContext = usePollingResource<AssetContextView>(
    () => apiClient.assetContext(selectedSymbol),
    {
      symbol: selectedSymbol,
      latest_signal: null,
      latest_risk: null,
      research: null,
      related_news: [],
      latest_backtest: null,
      data_reality: null,
    },
    [selectedSymbol],
  );
  const signalDetail = usePollingResource<SignalDetailView | null>(
    () => (selectedSignalId ? apiClient.signalDetail(selectedSignalId) : Promise.resolve(null)),
    selectedSignalId ? emptySignalDetail(selectedSignalId) : null,
    [selectedSignalId],
  );
  const riskDetail = usePollingResource<RiskDetailView | null>(
    () => (selectedRiskReportId ? apiClient.riskDetail(selectedRiskReportId) : Promise.resolve(null)),
    selectedRiskReportId ? emptyRiskDetail(selectedRiskReportId) : null,
    [selectedRiskReportId],
  );
  const paperTradeDetail = usePollingResource<PaperTradeDetailView | null>(
    () => (selectedTradeId ? apiClient.paperTradeDetail(selectedTradeId) : Promise.resolve(null)),
    selectedTradeId ? emptyPaperTradeDetail(selectedTradeId) : null,
    [selectedTradeId],
  );

  return {
    health,
    overview,
    signals,
    signalDetail,
    highRiskSignals,
    news,
    watchlist,
    opportunities,
    research,
    risk,
    riskDetail,
    riskExposure,
    activeTrades,
    proposedPaperTrades,
    activePaperTrades,
    closedPaperTrades,
    paperTradeAnalytics,
    paperTradeReviews,
    paperTradeDetail,
    walletBalance,
    journal,
    alerts,
    backtests,
    bars,
    assetContext,
  };
}
