import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "./api/hooks";
import { CommandCenter } from "./components/CommandCenter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ContextSidebar } from "./components/ContextSidebar";
import { LeftRail, type NavItem } from "./components/LeftRail";
import { Panel } from "./components/Panel";
import { PriceChart } from "./components/PriceChart";
import { SignalDetailsCard } from "./components/SignalDetailsCard";
import { SignalTable } from "./components/SignalTable";
import { StateBlock } from "./components/StateBlock";
import { TopRibbon } from "./components/TopRibbon";
import { ActiveTradesTab } from "./tabs/ActiveTradesTab";
import { AIDeskTab } from "./tabs/AIDeskTab";
import { BacktestsTab } from "./tabs/BacktestsTab";
import { DeskTab } from "./tabs/DeskTab";
import { JournalTab } from "./tabs/JournalTab";
import { NewsTab } from "./tabs/NewsTab";
import { PilotDashboardTab } from "./tabs/PilotDashboardTab";
import { PolymarketHunterTab } from "./tabs/PolymarketHunterTab";
import { ResearchTab } from "./tabs/ResearchTab";
import { ReplayTab } from "./tabs/ReplayTab";
import { RiskExposureTab } from "./tabs/RiskExposureTab";
import { SessionDashboardTab } from "./tabs/SessionDashboardTab";
import { StrategyLabTab } from "./tabs/StrategyLabTab";
import { TradeTicketsTab } from "./tabs/TradeTicketsTab";
import { WalletBalanceTab } from "./tabs/WalletBalanceTab";
import { WatchlistTab } from "./tabs/WatchlistTab";
import { isPrimaryCommodity, preferredCommoditySymbol } from "./lib/terminalFocus";
import { gateStatusLabel } from "./lib/uiLabels";
import type { DeskSummaryView, ExecutionGateView, HomeOperatorSummaryView, OperationalBacklogView, WatchlistSummaryView } from "./types/api";

type TabKey =
  | "desk"
  | "signals"
  | "high_risk"
  | "research"
  | "news"
  | "polymarket"
  | "ai_desk"
  | "active_trades"
  | "wallet_balance"
  | "watchlist"
  | "strategy_lab"
  | "backtests"
  | "risk"
  | "journal"
  | "session"
  | "replay"
  | "trade_tickets"
  | "pilot_ops";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "desk", label: "Desk" },
  { key: "signals", label: "Signals" },
  { key: "high_risk", label: "High Risk" },
  { key: "watchlist", label: "Watchlist" },
  { key: "trade_tickets", label: "Tickets" },
  { key: "active_trades", label: "Trades" },
  { key: "journal", label: "Journal" },
  { key: "session", label: "Review Queue" },
  { key: "strategy_lab", label: "Strategy" },
  { key: "backtests", label: "Backtests" },
  { key: "replay", label: "Replay" },
  { key: "pilot_ops", label: "Pilot Ops" },
  { key: "risk", label: "Risk" },
  { key: "research", label: "Research" },
  { key: "news", label: "News" },
  { key: "polymarket", label: "Polymarket" },
  { key: "ai_desk", label: "AI Desk" },
  { key: "wallet_balance", label: "Wallet" },
];

const focusSurfaceTabs: TabKey[] = ["desk", "signals", "high_risk", "watchlist", "risk"];

function activeTabLabel(tab: TabKey): string {
  return tabs.find((item) => item.key === tab)?.label ?? "Workspace";
}

function normalizeOperationalBacklog(view: OperationalBacklogView): OperationalBacklogView {
  const seen = new Set<string>();
  const items = view.items.filter((item) => {
    const key = item.item_id || [item.category, item.linked_entity_type, item.linked_entity_id, item.title].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return {
    ...view,
    items,
    overdue_count: items.filter((item) => item.status === "overdue").length,
    high_priority_count: items.filter((item) => item.priority === "high").length,
  };
}

function deriveHomeSummaryFromDesk(desk: DeskSummaryView, executionGate: ExecutionGateView): HomeOperatorSummaryView {
  const openTicketCounts = Object.fromEntries(
    Object.entries(desk.open_tickets.reduce<Record<string, number>>((acc, ticket) => {
      acc[ticket.status] = (acc[ticket.status] ?? 0) + 1;
      return acc;
    }, {})),
  );
  const activeTradeCounts = Object.fromEntries(
    Object.entries(desk.active_paper_trades.reduce<Record<string, number>>((acc, trade) => {
      acc[trade.status] = (acc[trade.status] ?? 0) + 1;
      return acc;
    }, {})),
  );
  const adapterHealthSummary = Object.fromEntries(
    Object.entries(desk.adapter_health.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {})),
  );
  const leadState =
    desk.session_states.find((row) => row.high_priority_count || row.overdue_count)?.state
    ?? desk.session_states.find((row) => row.item_count > 0)?.state
    ?? "pre_session";
  const maxShadowGap = desk.shadow_divergence.reduce((highest, row) => {
    const gap = Number(row.observed_vs_plan_pct ?? 0);
    return Number.isFinite(gap) ? Math.max(highest, gap) : highest;
  }, 0);

  return {
    generated_at: desk.generated_at,
    session_states: desk.session_states,
    session_state: leadState,
    pilot_gate_state: executionGate.status,
    degraded_source_count: desk.degraded_sources.length,
    review_backlog_counts: {
      overdue: desk.operational_backlog.overdue_count,
      high_priority: desk.operational_backlog.high_priority_count,
      open_reviews: desk.review_tasks.length,
    },
    top_signals_summary: desk.high_priority_signals.slice(0, 6),
    open_ticket_counts: openTicketCounts,
    active_trade_counts: activeTradeCounts,
    shadow_divergence_summary: {
      count: desk.shadow_divergence.length,
      max_observed_vs_plan_pct: Number(maxShadowGap.toFixed(2)),
    },
    adapter_health_summary: adapterHealthSummary,
  };
}

export default function App() {
  const operatorWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("desk");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1d");
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [selectedRiskReportId, setSelectedRiskReportId] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [hasAutoSelectedSymbol, setHasAutoSelectedSymbol] = useState(false);
  const [hasSettledWorkspaceScroll, setHasSettledWorkspaceScroll] = useState(false);
  const resources = useDashboardData(activeTab, commandCenterOpen, selectedSymbol, selectedTimeframe, selectedSignalId, selectedRiskReportId, selectedTradeId, selectedTicketId);
  const paperTradeRows = useMemo(
    () => [...resources.proposedPaperTrades.data, ...resources.activePaperTrades.data, ...resources.closedPaperTrades.data],
    [resources.activePaperTrades.data, resources.closedPaperTrades.data, resources.proposedPaperTrades.data],
  );
  const paperCapitalSummary = useMemo(() => {
    const activeRows = resources.activePaperTrades.data.filter((row) => row.paper_account);
    const accountSize = activeRows[0]?.paper_account?.account_size ?? 10000;
    const equity = activeRows.reduce(
      (highest, row) => Math.max(highest, row.paper_account?.current_equity ?? accountSize),
      accountSize,
    );
    return {
      accountSize,
      equity,
      allocated: activeRows.reduce((sum, row) => sum + (row.paper_account?.allocated_capital ?? 0), 0),
      openRisk: activeRows.reduce((sum, row) => sum + (row.paper_account?.open_risk_amount ?? 0), 0),
      targetPnl: activeRows.reduce((sum, row) => sum + (row.paper_account?.projected_base_pnl ?? 0), 0),
      stretchPnl: activeRows.reduce((sum, row) => sum + (row.paper_account?.projected_stretch_pnl ?? 0), 0),
      stopLoss: activeRows.reduce((sum, row) => sum + (row.paper_account?.projected_stop_loss ?? 0), 0),
      riskPct: activeRows.reduce((sum, row) => sum + (row.paper_account?.risk_pct_of_account ?? 0), 0),
      openExposureCount: activeRows.length,
      overAllocated: activeRows.reduce((sum, row) => sum + (row.paper_account?.allocated_capital ?? 0), 0) > accountSize,
    };
  }, [resources.activePaperTrades.data]);
  const resolvedExecutionGate = useMemo(() => {
    const directGate = resources.executionGate.data;
    const deskGate = resources.deskSummary.data.execution_gate;
    const pilotGate = {
      status: resources.pilotSummary.data.gate_state,
      blockers: resources.pilotSummary.data.blockers,
      thresholds: directGate.thresholds,
      metrics: directGate.metrics,
      rationale: directGate.rationale,
    };
    if (!(directGate.status === "not_ready" && directGate.blockers.length === 0)) {
      return directGate;
    }
    if (deskGate.blockers.length > 0 || deskGate.status !== "not_ready") {
      return deskGate;
    }
    if (pilotGate.blockers.length > 0 || pilotGate.status !== "not_ready") {
      return pilotGate;
    }
    return directGate;
  }, [resources.deskSummary.data.execution_gate, resources.executionGate.data, resources.pilotSummary.data.blockers, resources.pilotSummary.data.gate_state]);
  const resolvedOperationalBacklog = useMemo(() => {
    const directBacklog = normalizeOperationalBacklog(resources.operationalBacklog.data);
    const deskBacklog = normalizeOperationalBacklog(resources.deskSummary.data.operational_backlog);
    const sessionBacklog = normalizeOperationalBacklog(resources.sessionOverview.data.operational_backlog);
    if (directBacklog.overdue_count > 0 || directBacklog.high_priority_count > 0 || directBacklog.items.length > 0) {
      return directBacklog;
    }
    if (deskBacklog.overdue_count > 0 || deskBacklog.high_priority_count > 0 || deskBacklog.items.length > 0) {
      return deskBacklog;
    }
    if (sessionBacklog.overdue_count > 0 || sessionBacklog.high_priority_count > 0 || sessionBacklog.items.length > 0) {
      return sessionBacklog;
    }
    return directBacklog;
  }, [resources.deskSummary.data.operational_backlog, resources.operationalBacklog.data, resources.sessionOverview.data.operational_backlog]);
  const resolvedHomeSummary = useMemo(() => {
    if (resources.homeSummary.data.generated_at) {
      return resources.homeSummary.data;
    }
    return deriveHomeSummaryFromDesk(resources.deskSummary.data, resolvedExecutionGate);
  }, [resolvedExecutionGate, resources.deskSummary.data, resources.homeSummary.data]);
  const showFocusSurface = focusSurfaceTabs.includes(activeTab);
  const showResolvedFocusSurface = showFocusSurface && Boolean(selectedSymbol);
  const selectedWatchlistSummary = useMemo(
    () => resources.watchlistSummary.data.find((row) => row.symbol === selectedSymbol) ?? null,
    [resources.watchlistSummary.data, selectedSymbol],
  );
  const visibleMarketChart = useMemo(() => {
    if (
      resources.marketChart.data.symbol === selectedSymbol
      && resources.marketChart.data.timeframe === selectedTimeframe
    ) {
      return resources.marketChart.data;
    }
    const instrumentMapping = selectedWatchlistSummary?.instrument_mapping;
    return {
      ...resources.marketChart.data,
      symbol: selectedSymbol,
      timeframe: selectedTimeframe,
      available_timeframes: [],
      status: "loading",
      status_note: "Syncing chart data from the active backend.",
      freshness_minutes: 0,
      freshness_state: "loading",
      data_quality: "loading",
      bars: [],
      indicators: { ema_20: [], ema_50: [], ema_200: [], rsi_14: [], atr_14: [] },
      overlays: { markers: [], price_lines: [] },
      instrument_mapping: instrumentMapping
        ? {
            requested_symbol: instrumentMapping.requested_symbol,
            canonical_symbol: instrumentMapping.canonical_symbol,
            trader_symbol: instrumentMapping.trader_symbol,
            display_symbol: instrumentMapping.display_symbol,
            display_name: instrumentMapping.display_name,
            underlying_asset: instrumentMapping.underlying_asset,
            research_symbol: instrumentMapping.research_symbol,
            public_symbol: instrumentMapping.public_symbol,
            broker_symbol: instrumentMapping.broker_symbol,
            broker_truth: instrumentMapping.broker_truth,
            mapping_notes: instrumentMapping.mapping_notes,
          }
        : {
            requested_symbol: selectedSymbol,
            canonical_symbol: selectedSymbol,
            trader_symbol: selectedSymbol,
            display_symbol: selectedSymbol,
            display_name: selectedSymbol,
            underlying_asset: selectedSymbol,
            research_symbol: selectedSymbol,
            public_symbol: selectedSymbol,
            broker_symbol: selectedSymbol,
            broker_truth: true,
            mapping_notes: "Loading symbol mapping…",
          },
      data_reality: null,
    };
  }, [resources.marketChart.data, selectedSymbol, selectedTimeframe, selectedWatchlistSummary]);
  const visibleAssetContext = useMemo(
    () =>
      resources.assetContext.data.symbol === selectedSymbol
        ? resources.assetContext.data
        : {
            ...resources.assetContext.data,
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
    [resources.assetContext.data, selectedSymbol],
  );
  const visibleSignalDetail = useMemo(
    () => (resources.signalDetail.data?.symbol === selectedSymbol ? resources.signalDetail.data : null),
    [resources.signalDetail.data, selectedSymbol],
  );
  const visibleRiskDetail = useMemo(
    () => (resources.riskDetail.data?.symbol === selectedSymbol ? resources.riskDetail.data : null),
    [resources.riskDetail.data, selectedSymbol],
  );
  const visibleTradeDetail = useMemo(
    () => (resources.paperTradeDetail.data?.symbol === selectedSymbol ? resources.paperTradeDetail.data : null),
    [resources.paperTradeDetail.data, selectedSymbol],
  );
  const visibleTicketDetail = useMemo(
    () => (resources.tradeTicketDetail.data?.symbol === selectedSymbol ? resources.tradeTicketDetail.data : null),
    [resources.tradeTicketDetail.data, selectedSymbol],
  );
  const selectedSignalLabel = visibleSignalDetail
    ? `${visibleSignalDetail.symbol} ${visibleSignalDetail.signal_type}`
    : visibleAssetContext.latest_signal
      ? `${visibleAssetContext.latest_signal.symbol} ${visibleAssetContext.latest_signal.signal_type}`
      : null;
  const focusInstrumentLabel = visibleMarketChart.instrument_mapping.trader_symbol ?? selectedSymbol;
  const focusUnderlyingLabel = visibleMarketChart.instrument_mapping.underlying_asset !== focusInstrumentLabel
    ? visibleMarketChart.instrument_mapping.underlying_asset
    : null;

  function scrollOperatorWorkspaceIntoView() {
    const node = operatorWorkspaceRef.current;
    if (!node || typeof window.scrollTo !== "function") {
      return;
    }
    const top = node.getBoundingClientRect().top + window.scrollY - 8;
    try {
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    } catch {
      // jsdom and older browser surfaces may not implement scroll options.
    }
  }

  function queueOperatorWorkspaceScroll() {
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      scrollOperatorWorkspaceIntoView();
      return;
    }
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollOperatorWorkspaceIntoView()));
      return;
    }
    scrollOperatorWorkspaceIntoView();
  }

  function navigateTab(nextTab: TabKey) {
    setActiveTab(nextTab);
    queueOperatorWorkspaceScroll();
  }

  function isNotFoundError(error: string | null | undefined): boolean {
    return Boolean(error && error.includes("404"));
  }

  function friendlyShellError(error: string | null | undefined): string | null {
    if (!error) {
      return null;
    }
    if ((error.includes("Failed to fetch") || error.includes("CORS")) && error.includes("/journal")) {
      return "Journal data is temporarily unavailable. The rest of the operator workflow remains usable while it reconnects.";
    }
    if (error.includes("Failed to fetch") || error.includes("CORS")) {
      return "The local backend is temporarily unreachable. The shell will keep the last known operator context until it reconnects.";
    }
    if (error.includes("Timed out loading") || error.includes("timed out after")) {
      return "The active backend is taking longer than expected. The shell remains usable while slower sections catch up.";
    }
    if (error.includes("/dashboard/assets/") && error.includes("404")) {
      return "Selected asset context is temporarily unavailable. Choose another board symbol or refresh the local stack if it persists.";
    }
    if (error.includes("/market/chart/") && error.includes("404")) {
      return "Chart data is unavailable for the selected asset in the current mode.";
    }
    if (error.includes("returned 404")) {
      return "Part of the current operator snapshot is unavailable. The shell is keeping the rest of the workspace usable.";
    }
    return "Operator data is temporarily unavailable right now.";
  }

  useEffect(() => {
    queueOperatorWorkspaceScroll();
  }, [activeTab]);

  useEffect(() => {
    const shellBootstrapReady =
      !resources.overview.loading
      && !resources.watchlistSummary.loading
      && !resources.deskSummary.loading;
    if (!hasSettledWorkspaceScroll && shellBootstrapReady) {
      queueOperatorWorkspaceScroll();
      setHasSettledWorkspaceScroll(true);
    }
  }, [hasSettledWorkspaceScroll, resources.deskSummary.loading, resources.overview.loading, resources.watchlistSummary.loading]);

  useEffect(() => {
    const preferredSymbol =
      preferredCommoditySymbol(resources.watchlistSummary.data)
      ?? resources.watchlist.data[0]?.symbol
      ?? resources.signalsSummary.data.top_ranked_signals[0]?.symbol
      ?? resources.signals.data[0]?.symbol;
    if (preferredSymbol) {
      const shouldAdoptPreferred =
        !hasAutoSelectedSymbol
        || !selectedSymbol
        || (!isPrimaryCommodity(selectedSymbol) && isPrimaryCommodity(preferredSymbol));
      if (shouldAdoptPreferred) {
        setSelectedSymbol(preferredSymbol);
        setHasAutoSelectedSymbol(true);
      }
    }
  }, [hasAutoSelectedSymbol, resources.signals.data, resources.signalsSummary.data.top_ranked_signals, resources.watchlist.data, resources.watchlistSummary.data, selectedSymbol]);

  useEffect(() => {
    const signalId = resources.assetContext.data.latest_signal?.signal_id ?? resources.signals.data.find((row) => row.symbol === selectedSymbol)?.signal_id ?? null;
    const riskReportId = resources.assetContext.data.latest_risk?.risk_report_id ?? resources.risk.data.find((row) => row.symbol === selectedSymbol)?.risk_report_id ?? null;
    setSelectedSignalId((current) => {
      const isCurrentForSymbol = resources.signals.data.some((row) => row.signal_id === current && row.symbol === selectedSymbol);
      return isCurrentForSymbol ? current : signalId;
    });
    setSelectedRiskReportId((current) => {
      const isCurrentForSymbol = resources.risk.data.some((row) => row.risk_report_id === current && row.symbol === selectedSymbol);
      return isCurrentForSymbol ? current : riskReportId;
    });
  }, [resources.assetContext.data.latest_risk, resources.assetContext.data.latest_signal, resources.risk.data, resources.signals.data, selectedSymbol]);

  useEffect(() => {
    if (selectedSignalId && isNotFoundError(resources.signalDetail.error)) {
      setSelectedSignalId(null);
    }
  }, [resources.signalDetail.error, selectedSignalId]);

  useEffect(() => {
    if (selectedRiskReportId && isNotFoundError(resources.riskDetail.error)) {
      setSelectedRiskReportId(null);
    }
  }, [resources.riskDetail.error, selectedRiskReportId]);

  useEffect(() => {
    const nextTradeId = paperTradeRows.find((row) => row.trade_id === selectedTradeId && row.symbol === selectedSymbol)?.trade_id
      ?? paperTradeRows.find((row) => row.symbol === selectedSymbol)?.trade_id
      ?? paperTradeRows[0]?.trade_id
      ?? null;
    setSelectedTradeId(nextTradeId);
  }, [paperTradeRows, selectedSymbol, selectedTradeId]);

  useEffect(() => {
    const ticketRows = resources.tradeTickets.data;
    const nextTicketId = ticketRows.find((row) => row.ticket_id === selectedTicketId && row.symbol === selectedSymbol)?.ticket_id
      ?? ticketRows.find((row) => row.symbol === selectedSymbol)?.ticket_id
      ?? ticketRows[0]?.ticket_id
      ?? null;
    setSelectedTicketId(nextTicketId);
  }, [resources.tradeTickets.data, selectedSymbol, selectedTicketId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "/") {
        event.preventDefault();
        setCommandCenterOpen((current) => !current);
        return;
      }
      if (event.altKey) {
        const commodityKey = event.key.toLowerCase();
        const commodityShortcuts: Record<string, string> = {
          o: "WTI",
          g: "GOLD",
          s: "SILVER",
        };
        if (commodityShortcuts[commodityKey]) {
          event.preventDefault();
          setSelectedSymbol(commodityShortcuts[commodityKey]);
          setSelectedSignalId(null);
          setSelectedRiskReportId(null);
          setSelectedTradeId(null);
          setSelectedTicketId(null);
          setActiveTab("watchlist");
          queueOperatorWorkspaceScroll();
          return;
        }
        const index = Number(event.key) - 1;
        if (Number.isInteger(index) && tabs[index]) {
          event.preventDefault();
          navigateTab(tabs[index].key);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function refreshDesk() {
    await Promise.all([
      resources.health.refresh(),
      resources.overview.refresh(),
      resources.controlCenter.refresh(),
      resources.opsSummary.refresh(),
      resources.deskSummary.refresh(),
      resources.sessionOverview.refresh(),
      resources.reviewTasks.refresh(),
      resources.dailyBriefing.refresh(),
      resources.weeklyReview.refresh(),
      resources.operationalBacklog.refresh(),
      resources.reviewSummary.refresh(),
      resources.pilotMetrics.refresh(),
      resources.pilotSummary.refresh(),
      resources.executionGate.refresh(),
      resources.pilotDashboard.refresh(),
      resources.adapterHealth.refresh(),
      resources.auditLogs.refresh(),
      resources.signals.refresh(),
      resources.signalsSummary.refresh(),
      resources.highRiskSignals.refresh(),
      resources.news.refresh(),
      resources.polymarketHunter.refresh(),
      resources.watchlist.refresh(),
      resources.opportunities.refresh(),
      resources.research.refresh(),
      resources.risk.refresh(),
      resources.riskExposure.refresh(),
      resources.proposedPaperTrades.refresh(),
      resources.activePaperTrades.refresh(),
      resources.closedPaperTrades.refresh(),
      resources.paperTradeAnalytics.refresh(),
      resources.paperTradeReviews.refresh(),
      resources.tradeTickets.refresh(),
      resources.tradeTicketSummary.refresh(),
      resources.shadowModeTickets.refresh(),
      resources.brokerSnapshot.refresh(),
      resources.alerts.refresh(),
      resources.assetContext.refresh(),
      resources.bars.refresh(),
      resources.marketChart.refresh(),
    ]);
    if (selectedSignalId) {
      await resources.signalDetail.refresh();
    }
    if (selectedRiskReportId) {
      await resources.riskDetail.refresh();
    }
    if (selectedTradeId) {
      await Promise.all([
        resources.paperTradeDetail.refresh(),
        resources.paperTradeTimeline.refresh(),
        resources.paperTradeScenarioStress.refresh(),
      ]);
    }
    if (selectedTicketId) {
      await resources.tradeTicketDetail.refresh();
    }
  }

  async function refreshFocusSurface() {
    await Promise.all([
      resources.assetContext.refresh(),
      resources.marketChart.refresh(),
      resources.watchlistSummary.refresh(),
      resources.signals.refresh(),
      resources.news.refresh(),
    ]);
    if (selectedSignalId) {
      await resources.signalDetail.refresh();
    }
    if (selectedRiskReportId) {
      await resources.riskDetail.refresh();
    }
    if (selectedTradeId) {
      await Promise.all([
        resources.paperTradeDetail.refresh(),
        resources.paperTradeTimeline.refresh(),
        resources.paperTradeScenarioStress.refresh(),
      ]);
    }
    if (selectedTicketId) {
      await resources.tradeTicketDetail.refresh();
    }
  }

  function focusSymbol(symbol: string, signalId?: string | null, riskReportId?: string | null) {
    setSelectedSymbol(symbol);
    setSelectedSignalId(signalId ?? null);
    setSelectedRiskReportId(riskReportId ?? null);
    setSelectedTradeId(null);
    setSelectedTicketId(null);
  }

  function focusSymbolFromRail(symbol: string) {
    focusSymbol(symbol);
    if (!focusSurfaceTabs.includes(activeTab)) {
      navigateTab("watchlist");
    }
  }

  function focusTrade(tradeId: string | null) {
    setSelectedTradeId(tradeId);
    const trade = paperTradeRows.find((row) => row.trade_id === tradeId);
    if (!trade) {
      return;
    }
    setSelectedSymbol(trade.symbol);
    if (trade.signal_id) {
      setSelectedSignalId(trade.signal_id);
    }
    if (trade.risk_report_id) {
      setSelectedRiskReportId(trade.risk_report_id);
    }
  }

  function focusTicket(ticketId: string | null) {
    setSelectedTicketId(ticketId);
    const ticket = resources.tradeTickets.data.find((row) => row.ticket_id === ticketId);
    if (!ticket) {
      return;
    }
    setSelectedSymbol(ticket.symbol);
    if (ticket.signal_id) {
      setSelectedSignalId(ticket.signal_id);
    }
    if (ticket.risk_report_id) {
      setSelectedRiskReportId(ticket.risk_report_id);
    }
    if (ticket.trade_id) {
      setSelectedTradeId(ticket.trade_id);
    }
  }

  const shellError = useMemo(
    () =>
      [
        resources.overview.error,
        resources.watchlist.error,
        showResolvedFocusSurface && visibleAssetContext.data_reality === null ? resources.assetContext.error : null,
        showResolvedFocusSurface && visibleMarketChart.bars.length === 0 ? resources.marketChart.error : null,
      ]
        .map((item) => friendlyShellError(item))
        .find(Boolean) ?? null,
    [
      resources.assetContext.error,
      resources.marketChart.error,
      resources.overview.error,
      resources.watchlist.error,
      showResolvedFocusSurface,
      visibleAssetContext.data_reality,
      visibleMarketChart.bars.length,
    ],
  );

  const showShellLoadingState =
    (resources.overview.loading
      && resources.overview.data.source_mode === "syncing"
      && resources.watchlist.data.length === 0
      && resources.watchlistSummary.data.length === 0
      && resources.overview.data.last_refresh === null)
    || (resources.watchlist.loading && resources.watchlist.data.length === 0 && resources.watchlistSummary.data.length === 0)
    || (
      activeTab === "desk"
      && resources.deskSummary.loading
      && !resources.deskSummary.data.generated_at
      && resources.watchlistSummary.data.length === 0
    );

  const navItems: NavItem[] = useMemo(
    () =>
      tabs.map((tab, index) => ({
        key: tab.key,
        label: `${index < 9 ? `${index + 1}. ` : ""}${tab.label}`,
        badge:
          tab.key === "session"
            ? `${resolvedOperationalBacklog.overdue_count}/${resolvedOperationalBacklog.high_priority_count}`
            : tab.key === "pilot_ops"
              ? gateStatusLabel(resolvedExecutionGate.status)
              : tab.key === "trade_tickets"
                ? String(resources.tradeTickets.data.length)
                : tab.key === "active_trades"
                  ? String(resources.activePaperTrades.data.length)
                  : undefined,
        tone:
          tab.key === activeTab
            ? "active"
            : tab.key === "pilot_ops" && resolvedExecutionGate.status === "review_required"
              ? "warning"
              : tab.key === "session" && resolvedOperationalBacklog.overdue_count > 0
                ? "critical"
                : "default",
      })),
    [
      activeTab,
      resources.activePaperTrades.data.length,
      resolvedExecutionGate.status,
      resolvedOperationalBacklog.high_priority_count,
      resolvedOperationalBacklog.overdue_count,
      resources.tradeTickets.data.length,
    ],
  );

  function renderTabContent() {
    switch (activeTab) {
      case "desk":
        return (
          <DeskTab
            desk={resources.deskSummary.data}
            executionGate={resolvedExecutionGate}
            homeSummary={resolvedHomeSummary}
            onNavigate={(tab) => navigateTab(tab as TabKey)}
            onOpenCommandCenter={() => setCommandCenterOpen(true)}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={focusSymbol}
            onSelectTicket={focusTicket}
            onSelectTrade={focusTrade}
            operationalBacklog={resolvedOperationalBacklog}
            paperCapitalSummary={paperCapitalSummary}
          />
        );
      case "signals":
        return (
          <SignalTable
            onSelectSignal={setSelectedSignalId}
            onSelectSymbol={focusSymbol}
            rows={resources.signals.data.length > 0 ? resources.signals.data : resources.signalsSummary.data.top_ranked_signals}
            selectedSymbol={selectedSymbol}
          />
        );
      case "high_risk":
        return (
          <SignalTable
            onSelectSignal={setSelectedSignalId}
            onSelectSymbol={focusSymbol}
            rows={resources.highRiskSignals.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "research":
        return <ResearchTab onSelectSymbol={focusSymbol} rows={resources.research.data} selectedSymbol={selectedSymbol} />;
      case "news":
        return <NewsTab onSelectSymbol={focusSymbol} rows={resources.news.data} />;
      case "polymarket":
        return (
          <PolymarketHunterTab
            error={resources.polymarketHunter.error}
            hunter={resources.polymarketHunter.data}
            loading={resources.polymarketHunter.loading}
            onSelectSymbol={focusSymbol}
          />
        );
      case "ai_desk":
        return (
          <AIDeskTab
            activeTab={activeTab}
            assetContext={visibleAssetContext}
            assetLabel={focusInstrumentLabel}
            chart={visibleMarketChart}
            deskSectionNotes={resources.deskSummary.data.section_notes}
            onNavigate={(tab) => navigateTab(tab as TabKey)}
            riskDetail={visibleRiskDetail}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            signalDetail={visibleSignalDetail}
            signals={resources.signalsSummary.data.top_ranked_signals}
            timeframe={selectedTimeframe}
            watchlist={resources.watchlistSummary.data}
          />
        );
      case "active_trades":
        return (
          <ActiveTradesTab
            activeRows={resources.activePaperTrades.data}
            closedRows={resources.closedPaperTrades.data}
            detail={resources.paperTradeDetail.data}
            onChanged={refreshDesk}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectTrade={focusTrade}
            onSelectSymbol={focusSymbol}
            proposedRows={resources.proposedPaperTrades.data}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSignalReality={resources.signalDetail.data?.data_reality ?? resources.assetContext.data.latest_signal?.data_reality ?? null}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
          />
        );
      case "wallet_balance":
        return <WalletBalanceTab rows={resources.walletBalance.data} />;
      case "watchlist":
        return (
          <WatchlistTab
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={focusSymbol}
            opportunities={resources.opportunities.data}
            rows={resources.watchlist.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "strategy_lab":
        return <StrategyLabTab />;
      case "backtests":
        return <BacktestsTab rows={resources.backtests.data} />;
      case "risk":
        return (
          <RiskExposureTab
            exposures={resources.riskExposure.data}
            onOpenRisk={setSelectedRiskReportId}
            onSelectSymbol={focusSymbol}
            reports={resources.risk.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "journal":
        return (
          <JournalTab
            analytics={resources.paperTradeAnalytics.data}
            detail={resources.paperTradeDetail.data}
            error={resources.journal.error}
            onChanged={refreshDesk}
            onSelectTrade={focusTrade}
            reviews={resources.paperTradeReviews.data}
            rows={resources.journal.data}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
            trades={paperTradeRows}
          />
        );
      case "session":
        return (
          <SessionDashboardTab
            backlog={resolvedOperationalBacklog}
            dailyBriefing={resources.dailyBriefing.data}
            onChanged={refreshDesk}
            overview={resources.sessionOverview.data}
            reviewTasks={resources.reviewTasks.data}
            weeklyReview={resources.weeklyReview.data}
          />
        );
      case "replay":
        return (
          <ReplayTab
            replay={resources.replay.data}
            scenarioStress={resources.scenarioStress.data}
            timeline={resources.paperTradeTimeline.data}
          />
        );
      case "trade_tickets":
        return (
          <TradeTicketsTab
            brokerSnapshot={resources.brokerSnapshot.data}
            detail={resources.tradeTicketDetail.data}
            onChanged={refreshDesk}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            selectedRiskLabel={visibleRiskDetail?.symbol ? `${visibleRiskDetail.symbol} stop ${visibleRiskDetail.stop_price.toFixed(2)}` : null}
            onSelectTicket={focusTicket}
            onSelectTrade={focusTrade}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalLabel={visibleSignalDetail ? `${visibleSignalDetail.symbol} ${visibleSignalDetail.signal_type}` : null}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            selectedTicketId={selectedTicketId}
            shadowRows={resources.shadowModeTickets.data}
            tickets={resources.tradeTickets.data}
          />
        );
      case "pilot_ops":
        return (
          <PilotDashboardTab
            adapterHealth={resources.adapterHealth.data}
            auditLogs={resources.auditLogs.data}
            dashboard={resources.pilotDashboard.data}
            executionGate={resolvedExecutionGate}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="terminal-shell operator-shell">
      <TopRibbon
        backlog={resolvedOperationalBacklog}
        executionGate={resolvedExecutionGate}
        error={friendlyShellError(resources.overview.error)}
        health={resources.health.data}
        loading={resources.overview.loading}
        ribbon={resources.overview.data}
      />

      <div className="workspace operator-workspace">
        <LeftRail
          activeTab={activeTab}
          backlog={resolvedOperationalBacklog}
          executionGate={resolvedExecutionGate}
          navItems={navItems}
          onSelectSymbol={focusSymbolFromRail}
          onSelectTab={(key) => navigateTab(key as TabKey)}
          research={resources.research.data}
          selectedSymbol={selectedSymbol}
          watchlist={resources.watchlistSummary.data}
        />

        <main className="main-pane operator-main">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">Commodities Terminal</p>
              <h1>{activeTabLabel(activeTab)}</h1>
              <small className="compact-copy">
                {showFocusSurface
                  ? "Use the chart as the lead narrative surface for USOUSD, XAUUSD, and XAGUSD, then confirm invalidation, risk, and ticket discipline from the surrounding panels."
                  : "Use this workspace for deeper commodity workflow steps while the current asset, data-truth state, and related context remain visible in the shell."}
                {" "}Hotkeys: `Alt+1..9` tabs, `Alt+O/G/S` oil-gold-silver jumps, `/` ops.
              </small>
            </div>
            <div className="workspace-actions">
              <div className="workspace-badges">
                <span className="tag">asset {focusInstrumentLabel}</span>
                {focusUnderlyingLabel ? <span className="tag">context {focusUnderlyingLabel}</span> : null}
                <span className="tag">{resources.overview.data.data_mode_label}</span>
                <span className="tag" title={selectedSignalId ?? "n/a"}>
                  signal {selectedSignalLabel ?? "not selected"}
                </span>
                {resolvedExecutionGate.status === "review_required" ? (
                  <button className="text-button workspace-inline-link" onClick={() => navigateTab("session")} type="button">
                    Review required
                  </button>
                ) : null}
              </div>
              <div className="workspace-cta-group">
                <button className="action-button" onClick={() => void refreshFocusSurface()} type="button">
                  Refresh Data
                </button>
                <button className="text-button" onClick={() => setCommandCenterOpen((current) => !current)} type="button">
                  {commandCenterOpen ? "Hide Command Center" : "Open Command Center"} (/)
                </button>
              </div>
            </div>
          </header>

          <StateBlock
            error={shellError || null}
            loading={showShellLoadingState}
          />

          {commandCenterOpen ? (
            <ErrorBoundary label="Command Center" resetKey={`${resources.controlCenter.data.generated_at}-${resources.opsSummary.data.generated_at}`}>
              <CommandCenter onRefreshAll={refreshDesk} status={resources.controlCenter.data} summary={resources.opsSummary.data} />
            </ErrorBoundary>
          ) : null}

          {showResolvedFocusSurface ? (
            <div className="focus-layout operator-focus" key={`focus-${activeTab}-${selectedSymbol}-${selectedSignalId ?? "none"}`}>
              <Panel
                title={`${focusInstrumentLabel} Focus`}
                eyebrow={focusUnderlyingLabel ? `${focusUnderlyingLabel} research context` : "Current Asset"}
                extra={
                  <div className="inline-tags">
                    <span className="tag">{visibleAssetContext.research?.trend_state ?? "n/a"}</span>
                    <span className="tag">{visibleMarketChart.freshness_state ?? visibleAssetContext.data_reality?.freshness_state ?? "unknown"}</span>
                    <span className="tag">{visibleMarketChart.data_reality?.provenance.realism_grade ?? visibleAssetContext.data_reality?.provenance.realism_grade ?? "n/a"}</span>
                  </div>
                }
              >
                <ErrorBoundary label="Chart Surface" resetKey={`${activeTab}-${selectedSymbol}-${selectedTimeframe}-${resources.marketChart.data.status}`}>
                  <PriceChart
                    chart={visibleMarketChart}
                    error={resources.marketChart.error}
                    loading={resources.marketChart.loading}
                    onRefresh={() => void refreshFocusSurface()}
                    onRetry={() => void refreshFocusSurface()}
                    onTimeframeChange={setSelectedTimeframe}
                    selectedRisk={visibleRiskDetail}
                    selectedSignal={visibleSignalDetail}
                    selectedTicket={visibleTicketDetail}
                    selectedTrade={visibleTradeDetail}
                    timeframe={selectedTimeframe}
                  />
                </ErrorBoundary>
              </Panel>
              <ErrorBoundary label="Signal Detail" resetKey={`${activeTab}-${selectedSymbol}-${selectedSignalId ?? "none"}`}>
                <SignalDetailsCard
                  chart={visibleMarketChart}
                  context={visibleAssetContext}
                  detail={visibleSignalDetail}
                  error={resources.signalDetail.error}
                  loading={resources.signalDetail.loading}
                  onRetry={() => void refreshFocusSurface()}
                  ribbon={resources.overview.data}
                />
              </ErrorBoundary>
            </div>
          ) : null}

          <div className="operator-workspace-anchor" data-testid="operator-workspace-anchor" ref={operatorWorkspaceRef}>
            <Panel key={activeTab} title={activeTabLabel(activeTab)} eyebrow="Operator Workspace">
              <ErrorBoundary label={`${activeTabLabel(activeTab)} Workspace`} resetKey={`${activeTab}-${selectedSymbol}-${selectedTradeId ?? "none"}-${selectedTicketId ?? "none"}`}>
                {renderTabContent()}
              </ErrorBoundary>
            </Panel>
          </div>
        </main>

        <aside className="right-pane">
          <ErrorBoundary label="Context Sidebar" resetKey={`${selectedSymbol}-${selectedRiskReportId ?? "none"}`}>
            <ContextSidebar
              alerts={resources.alerts.data}
              chart={visibleMarketChart}
              context={visibleAssetContext}
              onOpenRisk={setSelectedRiskReportId}
              onOpenSignal={setSelectedSignalId}
              onRefreshContext={() => void refreshFocusSurface()}
              onSelectSymbol={(symbol) => focusSymbol(symbol)}
              ribbon={resources.overview.data}
              riskDetail={visibleRiskDetail}
              riskError={resources.riskDetail.error}
              riskLoading={resources.riskDetail.loading}
            />
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
}
