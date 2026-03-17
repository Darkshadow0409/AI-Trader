import { useEffect, useState } from "react";
import { apiClient } from "./client";
import type {
  ActiveTradeView,
  AlertEnvelope,
  AssetContextView,
  BacktestListView,
  BarView,
  MarketChartView,
  BrokerAdapterSnapshotView,
  CommandCenterStatusView,
  DailyBriefingView,
  DeskSummaryView,
  HomeOperatorSummaryView,
  HealthView,
  JournalReviewView,
  NewsView,
  OpsSummaryView,
  OperationalBacklogView,
  PilotDashboardView,
  PilotMetricSummaryView,
  PolymarketHunterView,
  OpportunityHunterView,
  ReplayView,
  PaperTradeAnalyticsView,
  PaperTradeDetailView,
  PaperTradeReviewView,
  PaperTradeView,
  PilotSummaryView,
  ResearchView,
  ReviewSummaryView,
  ReviewTaskView,
  RibbonView,
  RiskDetailView,
  RiskExposureView,
  RiskView,
  ScenarioStressItemView,
  ScenarioStressSummaryView,
  SessionOverviewView,
  ExecutionGateView,
  AdapterHealthView,
  AuditLogView,
  SignalDetailView,
  SignalsSummaryView,
  SignalView,
  TradeTimelineView,
  TradeTicketDetailView,
  TicketSummaryView,
  TradeTicketView,
  WalletBalanceView,
  WatchlistView,
  WatchlistSummaryView,
} from "../types/api";

export interface ResourceState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface PollingOptions {
  deps?: unknown[];
  intervalMs?: number;
  enabled?: boolean;
}

export function usePollingResource<T>(loader: () => Promise<T>, initialData: T, options: PollingOptions = {}): ResourceState<T> {
  const { deps = [], intervalMs = 30000, enabled = true } = options;
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function runLoad() {
      if (inFlight) {
        return;
      }
      inFlight = true;
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
        inFlight = false;
      }
    }

    setData(initialData);
    setError(null);
    if (!enabled) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void runLoad();
    const timer = window.setInterval(() => {
      void runLoad();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    loading,
    error,
    refresh: async () => {
      setLoading(true);
      try {
        const nextData = await loader();
        setData(nextData);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Request failed");
      } finally {
        setLoading(false);
      }
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
    execution_realism: null,
    execution_quality: null,
    adherence: null,
    review_due: false,
    paper_account: null,
    data_reality: null,
    linked_signal: null,
    linked_risk: null,
    review: null,
    timeline: null,
    scenario_stress: [],
  };
}

export function useDashboardData(
  activeTab: string,
  commandCenterOpen: boolean,
  selectedSymbol: string,
  selectedTimeframe: string,
  selectedSignalId: string | null,
  selectedRiskReportId: string | null,
  selectedTradeId: string | null,
  selectedTicketId: string | null,
) {
  const showDesk = activeTab === "desk";
  const showSignals = activeTab === "signals";
  const showHighRiskSignals = activeTab === "high_risk";
  const showWatchlist = activeTab === "watchlist";
  const showRisk = activeTab === "risk";
  const showTrades = activeTab === "active_trades";
  const showJournal = activeTab === "journal";
  const showSession = activeTab === "session";
  const showReplay = activeTab === "replay";
  const showTickets = activeTab === "trade_tickets";
  const showPilot = activeTab === "pilot_ops";
  const showNews = activeTab === "news";
  const showPolymarket = activeTab === "polymarket";
  const showResearch = activeTab === "research";
  const showWallet = activeTab === "wallet_balance";
  const showBacktests = activeTab === "backtests";

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
    market_data_mode: "fixture",
    last_refresh: null,
    next_event: null,
  });
  const deskSummary = usePollingResource<DeskSummaryView>(
    () => apiClient.deskSummary(),
    {
      generated_at: "",
      session_states: [],
      execution_gate: { status: "not_ready", blockers: [], thresholds: {}, metrics: {}, rationale: [] },
      operational_backlog: { generated_at: "", overdue_count: 0, high_priority_count: 0, items: [] },
      review_tasks: [],
      degraded_sources: [],
      high_priority_signals: [],
      high_risk_signals: [],
      focus_opportunities: [],
      open_tickets: [],
      active_paper_trades: [],
      shadow_divergence: [],
      adapter_health: [],
      audit_log_tail: [],
    },
    { enabled: showDesk, intervalMs: 60000 },
  );
  const homeSummary = usePollingResource<HomeOperatorSummaryView>(
    () => apiClient.homeSummary(),
    {
      generated_at: "",
      session_states: [],
      session_state: "pre_session",
      pilot_gate_state: "not_ready",
      degraded_source_count: 0,
      review_backlog_counts: {},
      top_signals_summary: [],
      open_ticket_counts: {},
      active_trade_counts: {},
      shadow_divergence_summary: {},
      adapter_health_summary: {},
    },
    { enabled: showDesk, intervalMs: 60000 },
  );
  const controlCenter = usePollingResource<CommandCenterStatusView>(
    () => apiClient.controlCenter(),
    {
      generated_at: "",
      runtime_status: "loading",
      backend_health: "loading",
      frontend_runtime_status: "loading",
      source_mode: "loading",
      pipeline_status: "loading",
      pipeline_freshness_minutes: 0,
      last_refresh: null,
      latest_export_path: null,
      latest_export_generated_at: null,
      latest_review_bundle_path: null,
      latest_review_bundle_generated_at: null,
      frontend_build_generated_at: null,
      diagnostics_updated_at: null,
      verify_fast_available: true,
      verify_full_available: true,
      review_bundle_available: true,
      available_actions: [],
      safe_actions: [],
      heavy_actions: [],
      latest_fast_verify: null,
      latest_full_verify: null,
      latest_export: null,
      latest_bundle: null,
      latest_refresh_action: null,
      latest_contract_snapshot: null,
      action_history: [],
      notes: [],
    },
    { enabled: commandCenterOpen, intervalMs: 60000 },
  );
  const opsSummary = usePollingResource<OpsSummaryView>(
    () => apiClient.opsSummary(),
    {
      generated_at: "",
      latest_fast_verify: null,
      latest_full_verify: null,
      latest_export: null,
      latest_bundle: null,
      latest_refresh: null,
      latest_contract_snapshot: null,
      action_history: [],
      available_actions: [],
    },
    { enabled: commandCenterOpen, intervalMs: 60000 },
  );
  const sessionOverview = usePollingResource<SessionOverviewView>(
    () => apiClient.sessionOverview(),
    {
      generated_at: "",
      states: [],
      review_tasks: [],
      daily_briefing: {
        generated_at: "",
        top_ranked_signals: [],
        high_risk_setups: [],
        open_trades_needing_attention: [],
        exposure_summary: [],
        degraded_data_sources: [],
        scout_to_focus_promotions: [],
        promoted_strategy_drift_warnings: [],
      },
      weekly_review: {
        generated_at: "",
        signal_family_outcomes: [],
        adherence_trend: {
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
        failure_attribution_trend: [],
        realism_warning_violations: [],
        strategy_promotion_health: [],
        paper_trade_outcome_distribution: {},
      },
      operational_backlog: {
        generated_at: "",
        overdue_count: 0,
        high_priority_count: 0,
        items: [],
      },
    },
    { enabled: showSession },
  );
  const reviewTasks = usePollingResource<ReviewTaskView[]>(() => apiClient.reviewTasks(), [], { enabled: showSession || showDesk, intervalMs: 60000 });
  const dailyBriefing = usePollingResource<DailyBriefingView>(
    () => apiClient.dailyBriefing(),
    {
      generated_at: "",
      top_ranked_signals: [],
      high_risk_setups: [],
      open_trades_needing_attention: [],
      exposure_summary: [],
      degraded_data_sources: [],
      scout_to_focus_promotions: [],
      promoted_strategy_drift_warnings: [],
    },
    { enabled: showSession },
  );
  const weeklyReview = usePollingResource(
    () => apiClient.weeklyReview(),
    {
      generated_at: "",
      signal_family_outcomes: [],
      adherence_trend: {
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
      failure_attribution_trend: [],
      realism_warning_violations: [],
      strategy_promotion_health: [],
      paper_trade_outcome_distribution: {},
    },
    { enabled: showSession },
  );
  const operationalBacklog = usePollingResource<OperationalBacklogView>(
    () => apiClient.operationalBacklog(),
    {
      generated_at: "",
      overdue_count: 0,
      high_priority_count: 0,
      items: [],
    },
    { enabled: showDesk || showSession || showPilot, intervalMs: 60000 },
  );
  const reviewSummary = usePollingResource<ReviewSummaryView>(
    () => apiClient.reviewSummary(),
    {
      generated_at: "",
      overdue_reviews: 0,
      adherence_summary: {},
      failure_attribution_summary: {},
      realism_warning_violations: 0,
      review_completion_trend: {},
    },
    { enabled: showSession },
  );
  const pilotMetrics = usePollingResource<PilotMetricSummaryView>(
    () => apiClient.pilotMetrics(),
    {
      generated_at: "",
      ticket_conversion: {},
      shadow_metrics: {},
      slippage_metrics: {},
      alert_metrics: {},
      adherence_metrics: {},
      review_backlog_metrics: {},
      promoted_strategy_metrics: {},
      mismatch_causes: [],
    },
    { enabled: showPilot },
  );
  const pilotSummary = usePollingResource<PilotSummaryView>(
    () => apiClient.pilotSummary(),
    {
      generated_at: "",
      gate_state: "not_ready",
      blockers: [],
      ticket_funnel: {},
      divergence_metrics: {},
      adapter_health: [],
      audit_anomalies: [],
      asset_class_trust_split: [],
    },
    { enabled: showPilot },
  );
  const executionGate = usePollingResource<ExecutionGateView>(
    () => apiClient.executionGate(),
    { status: "not_ready", blockers: [], thresholds: {}, metrics: {}, rationale: [] },
    { enabled: showDesk || showPilot || commandCenterOpen, intervalMs: 60000 },
  );
  const pilotDashboard = usePollingResource<PilotDashboardView>(
    () => apiClient.pilotDashboard(),
    {
      generated_at: "",
      pilot_metrics: {
        generated_at: "",
        ticket_conversion: {},
        shadow_metrics: {},
        slippage_metrics: {},
        alert_metrics: {},
        adherence_metrics: {},
        review_backlog_metrics: {},
        promoted_strategy_metrics: {},
        mismatch_causes: [],
      },
      trust_by_asset_class: [],
      divergence_hotspots: [],
      operator_discipline: {},
      review_backlog: { generated_at: "", overdue_count: 0, high_priority_count: 0, items: [] },
      execution_gate: { status: "not_ready", blockers: [], thresholds: {}, metrics: {}, rationale: [] },
      adapter_health: [],
      recent_audit_logs: [],
    },
    { enabled: showPilot },
  );
  const adapterHealth = usePollingResource<AdapterHealthView[]>(() => apiClient.adapterHealth(), [], { enabled: showPilot || showDesk, intervalMs: 60000 });
  const auditLogs = usePollingResource<AuditLogView[]>(() => apiClient.auditLogs(), [], { enabled: showPilot || showDesk, intervalMs: 60000 });
  const signals = usePollingResource<SignalView[]>(() => apiClient.signals(), [], { enabled: showSignals || showHighRiskSignals });
  const signalsSummary = usePollingResource<SignalsSummaryView>(
    () => apiClient.signalsSummary(),
    { generated_at: "", filter_metadata: {}, grouped_counts: {}, top_ranked_signals: [], warning_counts: {} },
    { enabled: showSignals || showHighRiskSignals || showDesk, intervalMs: 60000 },
  );
  const highRiskSignals = usePollingResource<SignalView[]>(() => apiClient.highRiskSignals(), [], { enabled: showHighRiskSignals });
  const news = usePollingResource<NewsView[]>(() => apiClient.news(), [], { enabled: showNews });
  const polymarketHunter = usePollingResource<PolymarketHunterView>(
    () => apiClient.polymarketHunter(),
    { generated_at: "", source_status: "loading", source_note: "", query: "", tag: "", sort: "volume", available_tags: [], events: [], markets: [] },
    { enabled: showPolymarket || showNews || showResearch || showDesk, intervalMs: 120000 },
  );
  const watchlist = usePollingResource<WatchlistView[]>(() => apiClient.watchlist(), [], { enabled: showWatchlist });
  const watchlistSummary = usePollingResource<WatchlistSummaryView[]>(() => apiClient.watchlistSummary(), [], {
    enabled: showWatchlist || showDesk || Boolean(selectedSymbol),
    intervalMs: 60000,
  });
  const opportunities = usePollingResource<OpportunityHunterView>(
    () => apiClient.opportunities(),
    { generated_at: "", focus_queue: [], scout_queue: [] },
    { enabled: showWatchlist || showDesk },
  );
  const research = usePollingResource<ResearchView[]>(() => apiClient.research(), [], { enabled: showResearch });
  const risk = usePollingResource<RiskView[]>(() => apiClient.risk(), [], { enabled: showRisk });
  const riskExposure = usePollingResource<RiskExposureView[]>(() => apiClient.riskExposure(), [], { enabled: showRisk });
  const activeTrades = usePollingResource<ActiveTradeView[]>(() => apiClient.activeTrades(), [], { enabled: showTrades });
  const proposedPaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.proposedPaperTrades(), [], { enabled: showTrades || showJournal || showReplay || Boolean(selectedTradeId) });
  const activePaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.activePaperTrades(), [], { enabled: showTrades || showJournal || showReplay || Boolean(selectedTradeId) });
  const closedPaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.closedPaperTrades(), [], { enabled: showTrades || showJournal || Boolean(selectedTradeId) });
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
      by_signal_quality: [],
      by_plan_quality: [],
      by_execution_quality: [],
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
    { enabled: showJournal },
  );
  const paperTradeReviews = usePollingResource<PaperTradeReviewView[]>(() => apiClient.paperTradeReviews(), [], { enabled: showJournal });
  const walletBalance = usePollingResource<WalletBalanceView[]>(() => apiClient.walletBalance(), [], { enabled: showWallet });
  const journal = usePollingResource<JournalReviewView[]>(() => apiClient.journal(), [], { enabled: showJournal });
  const alerts = usePollingResource<AlertEnvelope[]>(() => apiClient.alerts(), [], { intervalMs: 60000 });
  const backtests = usePollingResource<BacktestListView[]>(() => apiClient.backtests(), [], { enabled: showBacktests });
  const bars = usePollingResource<BarView[]>(() => apiClient.bars(selectedSymbol), [], {
    deps: [selectedSymbol],
    enabled: false,
  });
  const marketChart = usePollingResource<MarketChartView>(
    () => apiClient.marketChart(selectedSymbol, selectedTimeframe),
    {
      symbol: selectedSymbol,
      timeframe: selectedTimeframe,
      available_timeframes: [],
      status: "loading",
      status_note: "Loading chart data…",
      source_mode: "loading",
      market_data_mode: "fixture",
      freshness_minutes: 0,
      freshness_state: "loading",
      data_quality: "loading",
      is_fixture_mode: false,
      bars: [],
      indicators: { ema_20: [], ema_50: [], ema_200: [], rsi_14: [], atr_14: [] },
      overlays: { markers: [], price_lines: [] },
      instrument_mapping: {
        requested_symbol: selectedSymbol,
        canonical_symbol: selectedSymbol,
        display_symbol: selectedSymbol,
        underlying_asset: selectedSymbol,
        research_symbol: selectedSymbol,
        public_symbol: selectedSymbol,
        broker_symbol: selectedSymbol,
        broker_truth: true,
        mapping_notes: "Loading symbol mapping…",
      },
      data_reality: null,
    },
    { deps: [selectedSymbol, selectedTimeframe], enabled: Boolean(selectedSymbol), intervalMs: 60000 },
  );
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
      related_polymarket_markets: [],
      crowd_implied_narrative: "",
    },
    { deps: [selectedSymbol], enabled: Boolean(selectedSymbol), intervalMs: 60000 },
  );
  const signalDetail = usePollingResource<SignalDetailView | null>(
    () => (selectedSignalId ? apiClient.signalDetail(selectedSignalId) : Promise.resolve(null)),
    selectedSignalId ? emptySignalDetail(selectedSignalId) : null,
    { deps: [selectedSignalId], enabled: Boolean(selectedSignalId) },
  );
  const riskDetail = usePollingResource<RiskDetailView | null>(
    () => (selectedRiskReportId ? apiClient.riskDetail(selectedRiskReportId) : Promise.resolve(null)),
    selectedRiskReportId ? emptyRiskDetail(selectedRiskReportId) : null,
    { deps: [selectedRiskReportId], enabled: Boolean(selectedRiskReportId) },
  );
  const paperTradeDetail = usePollingResource<PaperTradeDetailView | null>(
    () => (selectedTradeId ? apiClient.paperTradeDetail(selectedTradeId) : Promise.resolve(null)),
    selectedTradeId ? emptyPaperTradeDetail(selectedTradeId) : null,
    { deps: [selectedTradeId], enabled: Boolean(selectedTradeId) },
  );
  const paperTradeTimeline = usePollingResource<TradeTimelineView | null>(
    () => (selectedTradeId ? apiClient.paperTradeTimeline(selectedTradeId) : Promise.resolve(null)),
    null,
    { deps: [selectedTradeId], enabled: showReplay && Boolean(selectedTradeId) },
  );
  const paperTradeScenarioStress = usePollingResource<ScenarioStressItemView[]>(
    () => (selectedTradeId ? apiClient.paperTradeScenarioStress(selectedTradeId) : Promise.resolve([])),
    [],
    { deps: [selectedTradeId], enabled: showReplay && Boolean(selectedTradeId) },
  );
  const tradeTickets = usePollingResource<TradeTicketView[]>(() => apiClient.tradeTickets(), [], { enabled: showTickets || showDesk || Boolean(selectedTicketId) });
  const tradeTicketSummary = usePollingResource<TicketSummaryView>(
    () => apiClient.tradeTicketSummary(),
    { generated_at: "", counts_by_state: {}, checklist_blockers: {}, shadow_active_count: 0, reconciliation_needed_count: 0, ready_for_review_count: 0 },
    { enabled: showTickets },
  );
  const tradeTicketDetail = usePollingResource<TradeTicketDetailView | null>(
    () => (selectedTicketId ? apiClient.tradeTicketDetail(selectedTicketId) : Promise.resolve(null)),
    null,
    { deps: [selectedTicketId], enabled: Boolean(selectedTicketId) },
  );
  const shadowModeTickets = usePollingResource<TradeTicketDetailView[]>(() => apiClient.shadowModeTickets(), [], { enabled: showTickets });
  const brokerSnapshot = usePollingResource<BrokerAdapterSnapshotView>(
    () => apiClient.brokerSnapshot(),
    { generated_at: "", balances: [], positions: [], fill_imports: [] },
    { enabled: showTickets },
  );
  const replay = usePollingResource<ReplayView>(
    () => apiClient.replay(selectedSymbol, selectedSignalId, selectedTradeId),
    {
      generated_at: "",
      symbol: selectedSymbol,
      signal_id: selectedSignalId,
      trade_id: selectedTradeId,
      event_window_minutes: 180,
      frames: [],
    },
    { deps: [selectedSymbol, selectedSignalId, selectedTradeId], enabled: showReplay && Boolean(selectedSymbol) },
  );
  const scenarioStress = usePollingResource<ScenarioStressSummaryView>(
    () => apiClient.scenarioStress(selectedSymbol, selectedSignalId, selectedTradeId),
    {
      generated_at: "",
      signal_impacts: [],
      active_trade_impacts: [],
      promoted_strategy_impacts: [],
    },
    { deps: [selectedSymbol, selectedSignalId, selectedTradeId], enabled: showReplay && Boolean(selectedSymbol) },
  );

  return {
    health,
    overview,
    deskSummary,
    homeSummary,
    controlCenter,
    opsSummary,
    sessionOverview,
    reviewTasks,
    dailyBriefing,
    weeklyReview,
    operationalBacklog,
    reviewSummary,
    pilotMetrics,
    pilotSummary,
    executionGate,
    pilotDashboard,
    adapterHealth,
    auditLogs,
    signals,
    signalsSummary,
    signalDetail,
    highRiskSignals,
    news,
    polymarketHunter,
    watchlist,
    watchlistSummary,
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
    paperTradeTimeline,
    paperTradeScenarioStress,
    tradeTickets,
    tradeTicketSummary,
    tradeTicketDetail,
    shadowModeTickets,
    brokerSnapshot,
    replay,
    scenarioStress,
    walletBalance,
    journal,
    alerts,
    backtests,
    bars,
    marketChart,
    assetContext,
  };
}
