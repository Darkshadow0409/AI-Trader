import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "./api/client";
import { useDashboardData } from "./api/hooks";
import { CommandCenter } from "./components/CommandCenter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ContextSidebar } from "./components/ContextSidebar";
import { LeftRail, type NavGroup, type NavItem } from "./components/LeftRail";
import { Panel } from "./components/Panel";
import { SignalDetailsCard } from "./components/SignalDetailsCard";
import { SignalTable } from "./components/SignalTable";
import { StateBlock } from "./components/StateBlock";
import { TopRibbon } from "./components/TopRibbon";
import { WorkspaceContinuityBar } from "./components/WorkspaceContinuityBar";
import { DeskTab } from "./tabs/DeskTab";
import { WatchlistTab } from "./tabs/WatchlistTab";
import { deriveAssetReadiness, instrumentMappingExplainer } from "./lib/assetReadiness";
import {
  selectedAssetTruthFallbackLabel,
  selectedAssetTruthFreshnessLabel,
  selectedAssetTruthSourceFamilyLabel,
  selectedAssetTruthStateLabel,
} from "./lib/selectedAssetTruth";
import { isPrimaryCommodity, preferredCommoditySymbol, sameTerminalFocusSymbol } from "./lib/terminalFocus";
import { gateStatusLabel } from "./lib/uiLabels";
import {
  DEFAULT_WORKSPACE_ROUTE,
  assetWorkspaceTarget,
  buildWorkspaceHref,
  operatorWireTarget,
  parseWorkspaceRoute,
  resolveWorkspaceTarget,
  reviewTaskAssetTarget,
  reviewTaskPrimaryTarget,
  signalContextTarget,
  riskContextTarget,
  tradeThreadTarget,
  workspaceStateEquals,
  workspaceTabTarget,
  type WorkspaceRouteState,
  type WorkspaceTabKey,
  type WorkspaceTarget,
} from "./lib/workspaceNavigation";
import type {
  CommodityTruthStatusView,
  DeskSummaryView,
  ExecutionGateView,
  OperationalBacklogItemView,
  HomeOperatorSummaryView,
  OperatorWireItemView,
  OperationalBacklogView,
  PaperTradeAnalyticsView,
  PaperTradeReviewView,
  PaperTradeView,
  MarketChartView,
  ResearchRunView,
  SelectedAssetTruthView,
  SignalView,
  WeeklyReviewView,
  WatchlistSummaryView,
} from "./types/api";
import type { ReviewTaskView } from "./types/api";

type TabKey = WorkspaceTabKey;

const PriceChart = lazy(async () => {
  const module = await import("./components/PriceChart");
  return { default: module.PriceChart };
});

const ActiveTradesTab = lazy(async () => {
  const module = await import("./tabs/ActiveTradesTab");
  return { default: module.ActiveTradesTab };
});

const AIDeskTab = lazy(async () => {
  const module = await import("./tabs/AIDeskTab");
  return { default: module.AIDeskTab };
});

const BacktestsTab = lazy(async () => {
  const module = await import("./tabs/BacktestsTab");
  return { default: module.BacktestsTab };
});

const JournalTab = lazy(async () => {
  const module = await import("./tabs/JournalTab");
  return { default: module.JournalTab };
});

const NewsTab = lazy(async () => {
  const module = await import("./tabs/NewsTab");
  return { default: module.NewsTab };
});

const PilotDashboardTab = lazy(async () => {
  const module = await import("./tabs/PilotDashboardTab");
  return { default: module.PilotDashboardTab };
});

const PolymarketHunterTab = lazy(async () => {
  const module = await import("./tabs/PolymarketHunterTab");
  return { default: module.PolymarketHunterTab };
});

const ResearchTab = lazy(async () => {
  const module = await import("./tabs/ResearchTab");
  return { default: module.ResearchTab };
});

const ReplayTab = lazy(async () => {
  const module = await import("./tabs/ReplayTab");
  return { default: module.ReplayTab };
});

const RiskExposureTab = lazy(async () => {
  const module = await import("./tabs/RiskExposureTab");
  return { default: module.RiskExposureTab };
});

const SessionDashboardTab = lazy(async () => {
  const module = await import("./tabs/SessionDashboardTab");
  return { default: module.SessionDashboardTab };
});

const StrategyLabTab = lazy(async () => {
  const module = await import("./tabs/StrategyLabTab");
  return { default: module.StrategyLabTab };
});

const TradeTicketsTab = lazy(async () => {
  const module = await import("./tabs/TradeTicketsTab");
  return { default: module.TradeTicketsTab };
});

const WalletBalanceTab = lazy(async () => {
  const module = await import("./tabs/WalletBalanceTab");
  return { default: module.WalletBalanceTab };
});

const allTabs: Array<{ key: TabKey; label: string }> = [
  { key: "desk", label: "Desk" },
  { key: "signals", label: "Signals" },
  { key: "high_risk", label: "High Risk" },
  { key: "watchlist", label: "Watchlist" },
  { key: "active_trades", label: "Trades" },
  { key: "journal", label: "Journal" },
  { key: "ai_desk", label: "AI Desk" },
  { key: "risk", label: "Risk" },
  { key: "trade_tickets", label: "Tickets" },
  { key: "session", label: "Review Queue" },
  { key: "polymarket", label: "Polymarket" },
  { key: "research", label: "Research" },
  { key: "news", label: "News" },
  { key: "strategy_lab", label: "Strategy" },
  { key: "backtests", label: "Backtests" },
  { key: "pilot_ops", label: "Pilot Ops" },
  { key: "wallet_balance", label: "Wallet" },
  { key: "replay", label: "Replay" },
];

const hotkeyTabs: TabKey[] = ["desk", "signals", "watchlist", "active_trades", "journal", "ai_desk", "risk", "trade_tickets", "polymarket"];
const focusSurfaceTabs: TabKey[] = ["desk", "signals", "watchlist", "risk"];
const AI_PROVIDER_STORAGE_KEY = "ai-trader:selected-ai-provider";
const AI_MODEL_STORAGE_KEY = "ai-trader:selected-ai-model";
const ACTIVE_TAB_STORAGE_KEY = "ai-trader:active-tab";
const ROUTE_STALL_FALLBACK_MS = 6000;
const RENDERABLE_CHART_STATUSES = new Set<MarketChartView["status"]>([
  "ok",
  "degraded",
  "no_data",
  "unusable",
]);

export function chartMatchesSelectedSymbol(chart: MarketChartView, selectedSymbol: string): boolean {
  return (
    sameTerminalFocusSymbol(chart.symbol, selectedSymbol)
    || sameTerminalFocusSymbol(chart.instrument_mapping.requested_symbol, selectedSymbol)
    || sameTerminalFocusSymbol(chart.instrument_mapping.trader_symbol, selectedSymbol)
    || sameTerminalFocusSymbol(chart.instrument_mapping.broker_symbol, selectedSymbol)
    || sameTerminalFocusSymbol(chart.selected_asset_truth?.symbol, selectedSymbol)
    || sameTerminalFocusSymbol(chart.selected_asset_truth?.trader_facing_symbol, selectedSymbol)
  );
}

export function chartHasRenderablePayload(chart: MarketChartView): boolean {
  return chart.bars.length > 0 || RENDERABLE_CHART_STATUSES.has(chart.status);
}

function activeTabLabel(tab: TabKey): string {
  return allTabs.find((item) => item.key === tab)?.label ?? "Workspace";
}

function isTabKey(value: string | null): value is TabKey {
  return value !== null && allTabs.some((item) => item.key === value);
}

function initialWorkspaceRoute(): WorkspaceRouteState {
  if (typeof window === "undefined") {
    return DEFAULT_WORKSPACE_ROUTE;
  }
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.toString().length > 0) {
    return resolveWorkspaceTarget(parseWorkspaceRoute(window.location.search), DEFAULT_WORKSPACE_ROUTE);
  }
  const storedTab = window.sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return resolveWorkspaceTarget({ tab: isTabKey(storedTab) ? storedTab : "desk" }, DEFAULT_WORKSPACE_ROUTE);
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
  const operatorStateSummary = {
    open_review_items: desk.review_tasks.length,
    overdue_review_items: desk.operational_backlog.overdue_count,
    open_tickets: desk.open_tickets.length,
    ready_for_review_tickets: desk.open_tickets.filter((ticket) => ticket.status === "ready_for_review").length,
    proposed_trades: 0,
    active_trades: desk.active_paper_trades.length,
  };

  return {
    generated_at: desk.generated_at,
    runtime_snapshot: desk.runtime_snapshot ?? null,
    operator_state_summary: operatorStateSummary,
    session_states: desk.session_states,
    session_state: leadState,
    pilot_gate_state: executionGate.status,
    degraded_source_count: desk.degraded_sources.length,
    review_backlog_counts: {
      overdue: operatorStateSummary.overdue_review_items,
      high_priority: desk.operational_backlog.high_priority_count,
      open_reviews: operatorStateSummary.open_review_items,
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

function sumCounts(counts: Record<string, number> | null | undefined): number {
  return Object.values(counts ?? {}).reduce((sum, value) => sum + value, 0);
}

function firstNonEmptyRows<T>(...sources: T[][]): T[] {
  for (const source of sources) {
    if (source.length > 0) {
      return source;
    }
  }
  return sources[0] ?? [];
}

type ReviewQueueContinuityState =
  | "ready"
  | "loading_expected_rows"
  | "reconciling"
  | "load_failed"
  | "empty";

type ReviewQueueSource = "direct" | "session_overview" | "desk_summary" | "backlog" | "empty";

interface ResolvedReviewQueue {
  tasks: ReviewTaskView[];
  continuityState: ReviewQueueContinuityState;
  continuityNote: string | null;
  source: ReviewQueueSource;
}

interface HotkeyHint {
  key: TabKey;
  label: string;
  shortcut: string;
}

interface MarketRouteStatus {
  tone: "syncing" | "degraded";
  title: string;
  detail: string;
}

function ChartSurfaceFallback() {
  return (
    <div className="state-block chart-surface-loading" data-testid="chart-surface-loading">
      <div>Chart surface loading</div>
      <div>The market workspace is already settling. The chart renderer is still loading.</div>
    </div>
  );
}

function LazyTabFallback({ label }: { label: string }) {
  return (
    <div className="state-block" data-testid="lazy-tab-loading">
      <div>{label} module opening</div>
      <div>Keeping the current operator context visible while this workspace code loads.</div>
    </div>
  );
}

function reviewTaskDisplaySymbol(symbol: string | null | undefined): string {
  switch ((symbol ?? "").toUpperCase()) {
    case "WTI":
      return "USOUSD";
    case "GOLD":
      return "XAUUSD";
    case "SILVER":
      return "XAGUSD";
    case "BTC":
      return "BTCUSD";
    case "ETH":
      return "ETHUSD";
    default:
      return symbol ?? "";
  }
}

function reviewTaskSessionState(taskType: string): string {
  switch (taskType) {
    case "open_trade_checkin":
      return "live_session";
    case "post_trade_review_due":
      return "post_session";
    case "realism_warning_violation_review":
      return "weekly_review";
    case "promoted_strategy_re_evaluation":
      return "strategy_review";
    default:
      return "pre_session";
  }
}

function isPersistedReviewTaskBacklogItem(item: OperationalBacklogItemView): boolean {
  return item.item_id.startsWith("review_task_");
}

export function deriveBacklogReviewTasks(
  items: OperationalBacklogItemView[],
): ReviewTaskView[] {
  return items
    .filter(isPersistedReviewTaskBacklogItem)
    .map((item) => ({
      task_id: item.item_id,
      task_type: item.category,
      title: item.title,
      summary: item.note || "Task detail is still reconciling from backlog state.",
      state: item.status,
      priority: item.priority,
      session_state: reviewTaskSessionState(item.category),
      linked_entity_type: item.linked_entity_type,
      linked_entity_id: item.linked_entity_id,
      linked_symbol: item.linked_symbol,
      display_symbol: reviewTaskDisplaySymbol(item.linked_symbol),
      signal_id: null,
      risk_report_id: null,
      trade_id: item.linked_entity_type === "paper_trade" || item.linked_entity_type === "paper_trade_review" ? item.linked_entity_id : null,
      strategy_name: item.linked_entity_type === "strategy" ? item.linked_entity_id : null,
      due_at: item.due_at ?? "",
      created_at: item.due_at ?? "",
      updated_at: item.due_at ?? "",
      completed_at: null,
      freshness_minutes: item.freshness_minutes,
      overdue: item.status === "overdue",
      notes: "",
      metadata: {
        backlog_fallback: true,
        linked_from_backlog: true,
      },
    }));
}

export function resolveReviewQueue(
  {
    directTasks,
    sessionOverviewTasks,
    deskSummaryTasks,
    backlog,
    reviewCount,
    loading,
    error,
    overdueCount,
    highPriorityCount,
  }: {
    directTasks: ReviewTaskView[];
    sessionOverviewTasks: ReviewTaskView[];
    deskSummaryTasks: ReviewTaskView[];
    backlog: OperationalBacklogView;
    reviewCount: number;
    loading: boolean;
    error: string | null;
    overdueCount: number;
    highPriorityCount: number;
  },
): ResolvedReviewQueue {
  const backlogTasks = deriveBacklogReviewTasks(backlog.items);
  const candidateSources: Array<[ReviewQueueSource, ReviewTaskView[]]> = [
    ["direct", directTasks],
    ["session_overview", sessionOverviewTasks],
    ["desk_summary", deskSummaryTasks],
    ["backlog", backlogTasks],
  ];
  const [source, tasks] = candidateSources.find(([, rows]) => rows.length > 0) ?? ["empty", []];
  const backlogEvidenceExists =
    backlogTasks.length > 0
    || backlog.items.length > 0
    || overdueCount > 0
    || highPriorityCount > 0;
  const expectedRows = reviewCount > 0 || backlogEvidenceExists;

  if (tasks.length > 0) {
    if (source === "backlog") {
      if (loading) {
        return {
          tasks,
          source,
          continuityState: "reconciling",
          continuityNote: "Using backlog-backed review rows while the detailed queue is still reconciling.",
        };
      }
      if (error) {
        return {
          tasks,
          source,
          continuityState: "load_failed",
          continuityNote: `Using backlog-backed review rows because the detailed queue did not load cleanly. ${error}`,
        };
      }
      return {
        tasks,
        source,
        continuityState: "reconciling",
        continuityNote: "Using backlog-backed review rows while the detailed queue catches up.",
      };
    }
    return {
      tasks,
      source,
      continuityState: "ready",
      continuityNote: null,
    };
  }

  if (!expectedRows) {
    return {
      tasks: [],
      source: "empty",
      continuityState: "empty",
      continuityNote: null,
    };
  }

  if (loading) {
    return {
      tasks: [],
      source: "empty",
      continuityState: "loading_expected_rows",
      continuityNote: `Summary and backlog state show ${Math.max(reviewCount, backlogTasks.length, overdueCount, highPriorityCount)} review item(s). Detailed rows are still loading.`,
    };
  }

  if (error) {
    return {
      tasks: [],
      source: "empty",
      continuityState: "load_failed",
      continuityNote: `Summary and backlog state still show review work, but the detailed queue failed to load. ${error}`,
    };
  }

  return {
    tasks: [],
    source: "empty",
    continuityState: "reconciling",
    continuityNote: "Summary and backlog state imply review work exists, but the detailed queue is still reconciling.",
  };
}

function hasMeaningfulWeeklyReview(view: WeeklyReviewView | null | undefined): boolean {
  if (!view) {
    return false;
  }
  const hygiene = view.adherence_trend;
  if (!hygiene) {
    return false;
  }
  return (
    hygiene.reviewed_trade_count > 0
    || hygiene.trade_count > 0
    || hygiene.adherence_rate > 0
    || hygiene.review_completion_rate > 0
    || hygiene.invalidation_discipline_rate > 0
    || view.signal_family_outcomes.length > 0
    || view.failure_attribution_trend.length > 0
    || view.realism_warning_violations.length > 0
  );
}

function buildWeeklyReviewFromAnalytics(
  analytics: PaperTradeAnalyticsView,
  reviews: PaperTradeReviewView[],
  closedTrades: PaperTradeView[],
  strategyPromotionHealth: WeeklyReviewView["strategy_promotion_health"],
): WeeklyReviewView {
  const distribution = closedTrades.reduce<Record<string, number>>(
    (acc, trade) => {
      if (trade.status === "closed_win") {
        acc.wins += 1;
      } else if (trade.status === "closed_loss") {
        acc.losses += 1;
      } else if (trade.status === "invalidated") {
        acc.invalidated += 1;
      } else if (trade.status === "timed_out") {
        acc.timed_out += 1;
      } else if (trade.status === "cancelled") {
        acc.cancelled += 1;
      }
      return acc;
    },
    { wins: 0, losses: 0, invalidated: 0, timed_out: 0, cancelled: 0 },
  );
  return {
    generated_at: analytics.generated_at,
    signal_family_outcomes: analytics.by_signal_family,
    adherence_trend: analytics.hygiene_summary,
    failure_attribution_trend: analytics.failure_categories,
    realism_warning_violations: reviews.filter((row) => Boolean(row.realism_warning_ignored)),
    strategy_promotion_health: strategyPromotionHealth,
    paper_trade_outcome_distribution: distribution,
  };
}

export function selectionUnavailableError(error: string | null | undefined): boolean {
  if (!error) {
    return false;
  }
  return error.includes("404") || error.includes("no longer available");
}

export function resolveTradeFocusSelection(
  trade: { trade_id: string; symbol: string } | null,
): {
  selectedTradeId: string | null;
  selectedTicketId: string | null;
  selectedSymbol: string | null;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
} {
  return {
    selectedTradeId: trade?.trade_id ?? null,
    selectedTicketId: null,
    selectedSymbol: trade?.symbol ?? null,
    selectedSignalId: null,
    selectedRiskReportId: null,
  };
}

export function resolveTicketFocusSelection(
  ticket: { ticket_id: string; symbol: string; trade_id: string | null } | null,
): {
  selectedTicketId: string | null;
  selectedTradeId: string | null;
  selectedSymbol: string | null;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
} {
  return {
    selectedTicketId: ticket?.ticket_id ?? null,
    selectedTradeId: ticket?.trade_id ?? null,
    selectedSymbol: ticket?.symbol ?? null,
    selectedSignalId: null,
    selectedRiskReportId: null,
  };
}

export function resolveSelectedSignalHydrationId({
  selectedSignalId,
  selectedSymbol,
  signalRows,
  assetSignalId,
}: {
  selectedSignalId: string | null;
  selectedSymbol: string;
  signalRows: SignalView[];
  assetSignalId: string | null;
}): string | null {
  if (!selectedSignalId) {
    return null;
  }
  if (assetSignalId === selectedSignalId) {
    return selectedSignalId;
  }
  const symbolSignals = signalRows.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol));
  if (symbolSignals.length === 0) {
    return selectedSignalId;
  }
  if (symbolSignals.some((row) => row.signal_id === selectedSignalId)) {
    return selectedSignalId;
  }
  return assetSignalId ?? symbolSignals[0]?.signal_id ?? null;
}

export function resolveSelectedRiskHydrationId({
  selectedRiskReportId,
  selectedSymbol,
  riskRows,
  assetRiskId,
  workspaceRiskId,
}: {
  selectedRiskReportId: string | null;
  selectedSymbol: string;
  riskRows: Array<{ risk_report_id: string; symbol: string }>;
  assetRiskId: string | null;
  workspaceRiskId: string | null;
}): string | null {
  if (!selectedRiskReportId) {
    return null;
  }
  const symbolRiskIds = new Set(
    riskRows
      .filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol))
      .map((row) => row.risk_report_id),
  );
  if (assetRiskId) {
    symbolRiskIds.add(assetRiskId);
  }
  if (workspaceRiskId) {
    symbolRiskIds.add(workspaceRiskId);
  }
  if (symbolRiskIds.size === 0) {
    return selectedRiskReportId;
  }
  if (symbolRiskIds.has(selectedRiskReportId)) {
    return selectedRiskReportId;
  }
  const nextKnownRiskId = symbolRiskIds.values().next().value as string | undefined;
  return workspaceRiskId ?? assetRiskId ?? nextKnownRiskId ?? null;
}

export default function App() {
  const operatorWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const operatorMainRef = useRef<HTMLElement | null>(null);
  const tradeDeskHydrationRef = useRef<string | null>(null);
  const ticketDeskHydrationRef = useRef<string | null>(null);
  const routeSyncModeRef = useRef<"push" | "replace">("replace");
  const bootRoute = useMemo(() => initialWorkspaceRoute(), []);
  const selectedSymbolModeRef = useRef<"explicit" | "auto">(bootRoute.symbol ? "explicit" : "auto");
  const [activeTab, setActiveTab] = useState<TabKey>(bootRoute.tab);
  const [selectedAIProvider, setSelectedAIProvider] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "local";
    }
    return window.sessionStorage.getItem(AI_PROVIDER_STORAGE_KEY) ?? "local";
  });
  const [selectedAIModel, setSelectedAIModel] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.sessionStorage.getItem(AI_MODEL_STORAGE_KEY);
  });
  const [selectedSymbol, setSelectedSymbol] = useState(bootRoute.symbol ?? "");
  const [selectedTimeframe, setSelectedTimeframe] = useState(bootRoute.timeframe);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(bootRoute.signalId);
  const [selectedRiskReportId, setSelectedRiskReportId] = useState<string | null>(bootRoute.riskReportId);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(bootRoute.tradeId);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(bootRoute.ticketId);
  const [selectedReviewTaskId, setSelectedReviewTaskId] = useState<string | null>(bootRoute.reviewTaskId);
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [hasAutoSelectedSymbol, setHasAutoSelectedSymbol] = useState(false);
  const [hasSettledWorkspaceScroll, setHasSettledWorkspaceScroll] = useState(false);
  const [watchlistFallbackReady, setWatchlistFallbackReady] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
      window.sessionStorage.setItem(AI_PROVIDER_STORAGE_KEY, selectedAIProvider);
      if (selectedAIModel) {
        window.sessionStorage.setItem(AI_MODEL_STORAGE_KEY, selectedAIModel);
      } else {
        window.sessionStorage.removeItem(AI_MODEL_STORAGE_KEY);
      }
    } catch {
      // Ignore session storage failures in locked-down environments.
    }
  }, [activeTab, selectedAIModel, selectedAIProvider]);
  const currentRouteState = useMemo<WorkspaceRouteState>(
    () =>
      resolveWorkspaceTarget(
        {
          tab: activeTab,
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          tradeId: selectedTradeId,
          ticketId: selectedTicketId,
          reviewTaskId: selectedReviewTaskId,
          timeframe: selectedTimeframe,
        },
        DEFAULT_WORKSPACE_ROUTE,
      ),
    [activeTab, selectedReviewTaskId, selectedRiskReportId, selectedSignalId, selectedSymbol, selectedTicketId, selectedTimeframe, selectedTradeId],
  );
  const resources = useDashboardData(activeTab, commandCenterOpen, selectedSymbol, selectedTimeframe, selectedSignalId, selectedRiskReportId, selectedTradeId, selectedTicketId);

  function setExplicitSelectedSymbol(nextSymbol: string | ((current: string) => string)) {
    selectedSymbolModeRef.current = "explicit";
    setSelectedSymbol(nextSymbol);
  }

  function setAutoSelectedSymbol(nextSymbol: string | ((current: string) => string)) {
    selectedSymbolModeRef.current = "auto";
    setSelectedSymbol(nextSymbol);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const urlState = resolveWorkspaceTarget(parseWorkspaceRoute(window.location.search), DEFAULT_WORKSPACE_ROUTE);
    if (workspaceStateEquals(urlState, currentRouteState)) {
      routeSyncModeRef.current = "replace";
      return;
    }
    const href = buildWorkspaceHref({}, {
      pathname: window.location.pathname,
      baseState: currentRouteState,
    });
    const historyMethod = routeSyncModeRef.current === "push" ? "pushState" : "replaceState";
    window.history[historyMethod](currentRouteState, "", href);
    routeSyncModeRef.current = "replace";
  }, [currentRouteState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    function handlePopState() {
      applyWorkspaceRoute(parseWorkspaceRoute(window.location.search), "replace");
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const signalRows = useMemo<SignalView[]>(
    () => {
      if (resources.signals.data.length > 0) {
        return resources.signals.data;
      }
      if (resources.signalsSummary.data.top_ranked_signals.length > 0) {
        return resources.signalsSummary.data.top_ranked_signals;
      }
      if (resources.homeSummary.data.top_signals_summary.length > 0) {
        return resources.homeSummary.data.top_signals_summary;
      }
      return resources.deskSummary.data.high_priority_signals;
    },
    [
      resources.deskSummary.data.high_priority_signals,
      resources.homeSummary.data.top_signals_summary,
      resources.signals.data,
      resources.signalsSummary.data.top_ranked_signals,
    ],
  );
  const highRiskSignalRows = useMemo<SignalView[]>(
    () => (resources.highRiskSignals.data.length > 0 ? resources.highRiskSignals.data : resources.deskSummary.data.high_risk_signals),
    [resources.deskSummary.data.high_risk_signals, resources.highRiskSignals.data],
  );
  const linkedStateOwnsSelection = ["active_trades", "trade_tickets", "journal", "replay"].includes(activeTab);
  const resolvedProposedPaperTrades = useMemo<PaperTradeView[]>(
    () => firstNonEmptyRows(resources.proposedPaperTrades.data),
    [resources.proposedPaperTrades.data],
  );
  const resolvedActivePaperTrades = useMemo<PaperTradeView[]>(
    () => firstNonEmptyRows(resources.activePaperTrades.data),
    [resources.activePaperTrades.data],
  );
  const resolvedClosedPaperTrades = useMemo<PaperTradeView[]>(
    () => firstNonEmptyRows(resources.closedPaperTrades.data),
    [resources.closedPaperTrades.data],
  );
  const paperTradeRows = useMemo(
    () => [...resolvedProposedPaperTrades, ...resolvedActivePaperTrades, ...resolvedClosedPaperTrades],
    [resolvedActivePaperTrades, resolvedClosedPaperTrades, resolvedProposedPaperTrades],
  );
  const resolvedResearchRuns = useMemo<ResearchRunView[]>(
    () => firstNonEmptyRows(resources.researchRuns.data),
    [resources.researchRuns.data],
  );
  const replayEnabled = paperTradeRows.length > 0;
  const paperCapitalSummary = useMemo(() => {
    const activeRows = resolvedActivePaperTrades.filter((row) => row.paper_account);
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
  }, [resolvedActivePaperTrades]);
  const resolvedExecutionGate = useMemo(() => {
    const directGate = resources.executionGate.data;
    const deskGate = resources.deskSummary.data.execution_gate;
    const pilotGate = {
      status: resources.pilotSummary.data.gate_state,
      blockers: resources.pilotSummary.data.blockers,
      thresholds: directGate.thresholds,
      metrics: directGate.metrics,
      rationale: directGate.rationale,
      blocker_details: directGate.blocker_details,
    };
    const directGateActive =
      activeTab === "desk"
      || activeTab === "session"
      || activeTab === "pilot_ops"
      || commandCenterOpen;
    if (
      directGate.blockers.length > 0
      || directGate.blocker_details.length > 0
      || directGate.status !== "not_ready"
      || (directGateActive && !resources.executionGate.error)
    ) {
      return directGate;
    }
    if (deskGate.blockers.length > 0 || deskGate.status !== "not_ready") {
      return deskGate;
    }
    if (pilotGate.blockers.length > 0 || pilotGate.status !== "not_ready") {
      return pilotGate;
    }
    return directGate;
  }, [activeTab, commandCenterOpen, resources.deskSummary.data.execution_gate, resources.executionGate.data, resources.executionGate.error, resources.pilotSummary.data.blockers, resources.pilotSummary.data.gate_state]);
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
  const resolvedDeskSectionNotes = useMemo(() => {
    const notes = { ...resources.deskSummary.data.section_notes };
    const snapshot = resources.deskSummary.data.runtime_snapshot;
    if (snapshot?.using_last_good_snapshot) {
      notes.runtime_snapshot = `Desk is using the last good operator snapshot from ${snapshot.age_minutes}m ago while the backend refresh completes.`;
    }
    const homeSnapshot = resolvedHomeSummary.runtime_snapshot;
    if (homeSnapshot?.using_last_good_snapshot) {
      notes.home_summary = `Home summary is using the last good operator snapshot from ${homeSnapshot.age_minutes}m ago.`;
    }
    return notes;
  }, [resolvedHomeSummary.runtime_snapshot, resources.deskSummary.data.runtime_snapshot, resources.deskSummary.data.section_notes]);
  const totalOpenTicketCount = useMemo(() => {
    const summaryCount = sumCounts(resources.tradeTicketSummary.data.counts_by_state);
    return summaryCount > 0
      ? summaryCount
      : (resolvedHomeSummary.operator_state_summary?.open_tickets ?? sumCounts(resolvedHomeSummary.open_ticket_counts));
  }, [resources.tradeTicketSummary.data.counts_by_state, resolvedHomeSummary.open_ticket_counts, resolvedHomeSummary.operator_state_summary]);
  const totalActiveTradeCount = useMemo(() => {
    return resolvedActivePaperTrades.length;
  }, [resolvedActivePaperTrades.length]);
  const totalOpenReviewCount =
    resources.reviewSummary.data.task_counts?.rendered_open
    ?? resolvedHomeSummary.operator_state_summary?.open_review_items
    ?? resolvedHomeSummary.review_backlog_counts.open_reviews
    ?? resources.reviewTasks.data.filter((task) => ["open", "overdue", "in_progress"].includes(task.state)).length;
  const totalProposedTradeCount = resolvedProposedPaperTrades.length;
  const resolvedReviewBacklogCounts = useMemo(
    () => ({
      overdue: resolvedHomeSummary.review_backlog_counts.overdue ?? resolvedOperationalBacklog.overdue_count,
      highPriority: resolvedHomeSummary.review_backlog_counts.high_priority ?? resolvedOperationalBacklog.high_priority_count,
      openReviews: resolvedHomeSummary.review_backlog_counts.open_reviews ?? totalOpenReviewCount,
    }),
    [
      resolvedHomeSummary.review_backlog_counts.high_priority,
      resolvedHomeSummary.review_backlog_counts.open_reviews,
      resolvedHomeSummary.review_backlog_counts.overdue,
      resolvedOperationalBacklog.high_priority_count,
      resolvedOperationalBacklog.overdue_count,
      totalOpenReviewCount,
    ],
  );
  const resolvedReviewQueue = useMemo(
    () => resolveReviewQueue({
      directTasks: resources.reviewTasks.data,
      sessionOverviewTasks: resources.sessionOverview.data.review_tasks,
      deskSummaryTasks: resources.deskSummary.data.review_tasks,
      backlog: resolvedOperationalBacklog,
      reviewCount: Math.max(totalOpenReviewCount, resolvedReviewBacklogCounts.openReviews),
      loading: resources.reviewTasks.loading || resources.sessionOverview.loading || resources.deskSummary.loading,
      error: resources.reviewTasks.error ?? resources.sessionOverview.error ?? resources.deskSummary.error ?? null,
      overdueCount: resolvedReviewBacklogCounts.overdue,
      highPriorityCount: resolvedReviewBacklogCounts.highPriority,
    }),
    [
      resolvedOperationalBacklog,
      resolvedReviewBacklogCounts.highPriority,
      resolvedReviewBacklogCounts.openReviews,
      resolvedReviewBacklogCounts.overdue,
      resources.deskSummary.data.review_tasks,
      resources.deskSummary.error,
      resources.deskSummary.loading,
      resources.reviewTasks.data,
      resources.reviewTasks.error,
      resources.reviewTasks.loading,
      resources.sessionOverview.data.review_tasks,
      resources.sessionOverview.error,
      resources.sessionOverview.loading,
      totalOpenReviewCount,
    ],
  );
  const shellBacklogSummary = useMemo(
    () => ({
      ...resolvedOperationalBacklog,
      overdue_count: resolvedReviewBacklogCounts.overdue,
      high_priority_count: resolvedReviewBacklogCounts.highPriority,
    }),
    [resolvedOperationalBacklog, resolvedReviewBacklogCounts.highPriority, resolvedReviewBacklogCounts.overdue],
  );
  const resolvedDailyBriefing = useMemo(() => {
    const sessionBriefing = resources.sessionOverview.data.daily_briefing;
    if (
      sessionBriefing.top_ranked_signals.length > 0
      || sessionBriefing.high_risk_setups.length > 0
      || sessionBriefing.open_trades_needing_attention.length > 0
      || sessionBriefing.degraded_data_sources.length > 0
      || sessionBriefing.scout_to_focus_promotions.length > 0
      || sessionBriefing.promoted_strategy_drift_warnings.length > 0
    ) {
      return sessionBriefing;
    }
    return resources.dailyBriefing.data;
  }, [resources.dailyBriefing.data, resources.sessionOverview.data.daily_briefing]);
  const resolvedWeeklyReview = useMemo(() => {
    const directWeekly = resources.weeklyReview.data;
    if (hasMeaningfulWeeklyReview(directWeekly)) {
      return directWeekly;
    }
    const sessionWeekly = resources.sessionOverview.data.weekly_review;
    if (hasMeaningfulWeeklyReview(sessionWeekly)) {
      return sessionWeekly;
    }
    const analytics = resources.paperTradeAnalytics.data;
    const hasAnalyticsEvidence =
      analytics.hygiene_summary.reviewed_trade_count > 0
      || analytics.hygiene_summary.trade_count > 0
      || analytics.hygiene_summary.adherence_rate > 0
      || analytics.hygiene_summary.review_completion_rate > 0
      || analytics.hygiene_summary.invalidation_discipline_rate > 0
      || analytics.by_signal_family.length > 0;
    if (!hasAnalyticsEvidence) {
      return directWeekly;
    }
    const strategyPromotionHealth =
      directWeekly.strategy_promotion_health.length > 0
        ? directWeekly.strategy_promotion_health
        : sessionWeekly.strategy_promotion_health;
    return buildWeeklyReviewFromAnalytics(
      analytics,
      resources.paperTradeReviews.data,
      resolvedClosedPaperTrades,
      strategyPromotionHealth,
    );
  }, [
    resolvedClosedPaperTrades,
    resources.paperTradeAnalytics.data,
    resources.paperTradeReviews.data,
    resources.sessionOverview.data.weekly_review,
    resources.weeklyReview.data,
  ]);
  const showFocusSurface = focusSurfaceTabs.includes(activeTab);
  const showResolvedFocusSurface = showFocusSurface && Boolean(selectedSymbol);
  const selectedWatchlistSummary = useMemo(
    () => resources.watchlistSummary.data.find((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)) ?? null,
    [resources.watchlistSummary.data, selectedSymbol],
  );
  const selectedSignalWorkspace = useMemo(
    () => {
      const workspace = resources.selectedSignalWorkspace.data as unknown;
      if (!workspace || typeof workspace !== "object" || !("signal" in workspace)) {
        return null;
      }
      const signal = (workspace as { signal?: SignalView | null }).signal;
      if (!signal?.signal_id || signal.signal_id !== selectedSignalId) {
        return null;
      }
      return workspace as NonNullable<typeof resources.selectedSignalWorkspace.data>;
    },
    [resources.selectedSignalWorkspace.data, selectedSignalId],
  );
  const currentSymbolAssetSignalId =
    sameTerminalFocusSymbol(resources.assetContext.data.symbol, selectedSymbol)
      ? resources.assetContext.data.latest_signal?.signal_id ?? null
      : null;
  const currentSymbolAssetRiskId =
    sameTerminalFocusSymbol(resources.assetContext.data.symbol, selectedSymbol)
      ? resources.assetContext.data.latest_risk?.risk_report_id ?? null
      : null;
  const currentWorkspaceRiskId =
    selectedSignalWorkspace && sameTerminalFocusSymbol(selectedSignalWorkspace.selected_symbol, selectedSymbol)
      ? selectedSignalWorkspace.risk?.risk_report_id ?? null
      : null;
  const lastRenderableMarketChartRef = useRef<MarketChartView | null>(null);
  const visibleMarketChart = useMemo(() => {
    const workspaceChartMatchesSelection = (
      selectedSignalWorkspace
      && sameTerminalFocusSymbol(selectedSignalWorkspace.selected_symbol, selectedSymbol)
      && selectedSignalWorkspace.timeframe === selectedTimeframe
    );
    const workspaceChart = workspaceChartMatchesSelection ? selectedSignalWorkspace.chart : null;
    const workspaceChartReady = workspaceChart !== null && chartHasRenderablePayload(workspaceChart);
    const directChartReady = (
      chartMatchesSelectedSymbol(resources.marketChart.data, selectedSymbol)
      && resources.marketChart.data.timeframe === selectedTimeframe
      && chartHasRenderablePayload(resources.marketChart.data)
    );
    const directChartPreservesSwitchingContext = (
      chartMatchesSelectedSymbol(resources.marketChart.data, selectedSymbol)
      && resources.marketChart.data.timeframe !== selectedTimeframe
      && resources.marketChart.data.bars.length > 0
    );
    const lastRenderableChartPreservesSwitchingContext = (
      lastRenderableMarketChartRef.current !== null
      && chartMatchesSelectedSymbol(lastRenderableMarketChartRef.current, selectedSymbol)
      && lastRenderableMarketChartRef.current.timeframe !== selectedTimeframe
      && lastRenderableMarketChartRef.current.bars.length > 0
    );
    if (
      workspaceChartReady
      && workspaceChart
    ) {
      return workspaceChart;
    }
    if (
      directChartReady
      || directChartPreservesSwitchingContext
    ) {
      return resources.marketChart.data;
    }
    if (lastRenderableChartPreservesSwitchingContext && lastRenderableMarketChartRef.current) {
      return lastRenderableMarketChartRef.current;
    }
    if (workspaceChartMatchesSelection && workspaceChart) {
      return workspaceChart;
    }
    const commodityTruth =
      (sameTerminalFocusSymbol(resources.assetContext.data.symbol, selectedSymbol)
        ? resources.assetContext.data.commodity_truth
        : null)
      ?? resources.overview.data.commodity_truth
      ?? resources.health.data.commodity_truth
      ?? null;
    const instrumentMapping = selectedWatchlistSummary?.instrument_mapping;
    if (resources.marketChart.error) {
      const degradedStatus = commodityTruth?.truth_state === "ready_last_verified" ? "degraded" : "unusable";
      return {
        ...resources.marketChart.data,
        symbol: selectedSymbol,
        timeframe: selectedTimeframe,
        available_timeframes: resources.marketChart.data.available_timeframes,
        status: degradedStatus,
        status_note: resources.marketChart.error,
        freshness_minutes: 9999,
        freshness_state: degradedStatus,
        data_quality: "missing",
        bars: [],
        indicators: { ema_20: [], ema_50: [], ema_200: [], rsi_14: [], atr_14: [] },
        overlays: { markers: [], price_lines: [], zones: [] },
        commodity_truth: commodityTruth,
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
          : resources.marketChart.data.instrument_mapping,
        data_reality: null,
      };
    }
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
      overlays: { markers: [], price_lines: [], zones: [] },
      commodity_truth: commodityTruth,
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
  }, [
    resources.assetContext.data.commodity_truth,
    resources.assetContext.data.symbol,
    resources.health.data.commodity_truth,
    resources.marketChart.data,
    resources.marketChart.error,
    resources.marketChart.awaitingLiveUpdate,
    resources.marketChart.loading,
    resources.overview.data.commodity_truth,
    selectedSignalWorkspace,
    selectedSymbol,
    selectedTimeframe,
    selectedWatchlistSummary,
  ]);
  useEffect(() => {
    if (
      chartMatchesSelectedSymbol(visibleMarketChart, selectedSymbol)
      && visibleMarketChart.bars.length > 0
    ) {
      lastRenderableMarketChartRef.current = visibleMarketChart;
    }
  }, [selectedSymbol, visibleMarketChart]);
  const visibleAssetContext = useMemo(
    () =>
      selectedSignalWorkspace && sameTerminalFocusSymbol(selectedSignalWorkspace.selected_symbol, selectedSymbol)
        ? selectedSignalWorkspace.asset_context
        : sameTerminalFocusSymbol(resources.assetContext.data.symbol, selectedSymbol)
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
            commodity_truth: null,
          },
    [resources.assetContext.data, selectedSignalWorkspace, selectedSymbol],
  );
  const visibleCommodityTruth = useMemo<CommodityTruthStatusView | null>(() => {
    if (visibleMarketChart.commodity_truth) {
      return visibleMarketChart.commodity_truth;
    }
    if (visibleAssetContext.commodity_truth) {
      return visibleAssetContext.commodity_truth;
    }
    if (resources.overview.data.commodity_truth) {
      return resources.overview.data.commodity_truth;
    }
    if (resources.health.data.commodity_truth) {
      return resources.health.data.commodity_truth;
    }
    return resources.watchlistSummary.data.find((row) => row.commodity_truth)?.commodity_truth ?? null;
  }, [
    resources.health.data.commodity_truth,
    resources.overview.data.commodity_truth,
    resources.watchlistSummary.data,
    visibleAssetContext.commodity_truth,
    visibleMarketChart.commodity_truth,
  ]);
  const visibleSelectedAssetTruth = useMemo<SelectedAssetTruthView | null>(() => {
    if (!selectedSymbol) {
      return (
        resources.selectedAssetTruth.data
        ?? visibleMarketChart.selected_asset_truth
        ?? visibleAssetContext.selected_asset_truth
        ?? resources.overview.data.selected_asset_truth
        ?? null
      );
    }
    if (resources.selectedAssetTruth.data && sameTerminalFocusSymbol(resources.selectedAssetTruth.data.symbol, selectedSymbol)) {
      return resources.selectedAssetTruth.data;
    }
    if (visibleMarketChart.selected_asset_truth && sameTerminalFocusSymbol(visibleMarketChart.selected_asset_truth.symbol, selectedSymbol)) {
      return visibleMarketChart.selected_asset_truth;
    }
    if (visibleAssetContext.selected_asset_truth && sameTerminalFocusSymbol(visibleAssetContext.selected_asset_truth.symbol, selectedSymbol)) {
      return visibleAssetContext.selected_asset_truth;
    }
    if (resources.overview.data.selected_asset_truth && sameTerminalFocusSymbol(resources.overview.data.selected_asset_truth.symbol, selectedSymbol)) {
      return resources.overview.data.selected_asset_truth;
    }
    return null;
  }, [
    resources.selectedAssetTruth.data,
    resources.overview.data.selected_asset_truth,
    selectedSymbol,
    visibleAssetContext.selected_asset_truth,
    visibleMarketChart.selected_asset_truth,
  ]);
  const visibleSignalDetail = useMemo(
    () => {
      if (selectedSignalWorkspace?.signal && sameTerminalFocusSymbol(selectedSignalWorkspace.selected_symbol, selectedSymbol)) {
        return selectedSignalWorkspace.signal;
      }
      return resources.signalDetail.data && sameTerminalFocusSymbol(resources.signalDetail.data.symbol, selectedSymbol)
        ? resources.signalDetail.data
        : null;
    },
    [resources.signalDetail.data, selectedSignalWorkspace, selectedSymbol],
  );
  const visibleSignalSummary = useMemo(
    () =>
      signalRows.find((row) => row.signal_id === selectedSignalId && sameTerminalFocusSymbol(row.symbol, selectedSymbol))
      ?? signalRows.find((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol))
      ?? null,
    [selectedSignalId, selectedSymbol, signalRows],
  );
  const visibleRiskDetail = useMemo(
    () => {
      if (selectedSignalWorkspace?.risk && sameTerminalFocusSymbol(selectedSignalWorkspace.selected_symbol, selectedSymbol)) {
        return selectedSignalWorkspace.risk;
      }
      return resources.riskDetail.data && sameTerminalFocusSymbol(resources.riskDetail.data.symbol, selectedSymbol)
        ? resources.riskDetail.data
        : null;
    },
    [resources.riskDetail.data, selectedSignalWorkspace, selectedSymbol],
  );
  const visibleTradeDetail = useMemo(
    () => (resources.paperTradeDetail.data && sameTerminalFocusSymbol(resources.paperTradeDetail.data.symbol, selectedSymbol)
      ? resources.paperTradeDetail.data
      : null),
    [resources.paperTradeDetail.data, selectedSymbol],
  );
  const visibleTicketDetail = useMemo(
    () => (resources.tradeTicketDetail.data && sameTerminalFocusSymbol(resources.tradeTicketDetail.data.symbol, selectedSymbol)
      ? resources.tradeTicketDetail.data
      : null),
    [resources.tradeTicketDetail.data, selectedSymbol],
  );
  const visibleMarketChartTerminal = useMemo(
    () =>
      visibleMarketChart.bars.length > 0
      || visibleMarketChart.status === "ok"
      || visibleMarketChart.status === "degraded",
    [visibleMarketChart],
  );
  const chartSurfacePending = resources.marketChart.loading
    || resources.marketChart.awaitingLiveUpdate
    || (
      chartMatchesSelectedSymbol(visibleMarketChart, selectedSymbol)
      && visibleMarketChart.timeframe !== selectedTimeframe
      && visibleMarketChart.bars.length > 0
    );
  const visibleAssetContextReady = useMemo(
    () =>
      sameTerminalFocusSymbol(visibleAssetContext.symbol, selectedSymbol)
      && (
        visibleAssetContext.data_reality !== null
        || visibleAssetContext.latest_signal !== null
        || visibleAssetContext.latest_risk !== null
        || visibleAssetContext.research !== null
        || visibleAssetContext.related_news.length > 0
        || visibleAssetContext.commodity_truth !== null
      ),
    [selectedSymbol, visibleAssetContext],
  );
  const focusedWorkflowContextReady = useMemo(
    () =>
      visibleSignalDetail !== null
      || visibleSignalSummary !== null
      || visibleRiskDetail !== null
      || visibleAssetContext.latest_signal !== null
      || visibleAssetContext.latest_risk !== null,
    [
      visibleAssetContext.latest_risk,
      visibleAssetContext.latest_signal,
      visibleRiskDetail,
      visibleSignalDetail,
      visibleSignalSummary,
    ],
  );
  const focusedTradeRows = useMemo(
    () => paperTradeRows.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)),
    [paperTradeRows, selectedSymbol],
  );
  const focusedTicketRows = useMemo(
    () => resources.tradeTickets.data.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)),
    [resources.tradeTickets.data, selectedSymbol],
  );
  const focusedShadowTicketRows = useMemo(
    () => resources.shadowModeTickets.data.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)),
    [resources.shadowModeTickets.data, selectedSymbol],
  );
  const tradesFallbackStateReady =
    !resources.closedPaperTrades.loading
    || (!resources.proposedPaperTrades.loading && !resources.activePaperTrades.loading);
  const ticketsFallbackStateReady =
    !resources.tradeTicketSummary.loading
    && !resources.tradeTickets.loading
    && !resources.shadowModeTickets.loading;
  const marketShellTruthHydrated =
    resources.overview.hydrated
    || resources.selectedAssetTruth.hydrated;
  const watchlistSummaryInitialError =
    !resources.watchlistSummary.hydrated
    && Boolean(resources.watchlistSummary.error);
  const watchlistSummaryRefreshError =
    resources.watchlistSummary.hydrated
    && Boolean(resources.watchlistSummary.error);
  const watchlistSummaryResolved =
    resources.watchlistSummary.hydrated
    || watchlistSummaryInitialError;
  const opportunitiesInitialLoading =
    resources.opportunities.loading
    && !resources.opportunities.hydrated;
  const opportunitiesInitialError =
    !resources.opportunities.hydrated
    && Boolean(resources.opportunities.error);
  const opportunitiesRefreshError =
    resources.opportunities.hydrated
    && Boolean(resources.opportunities.error);
  const polymarketHunterInitialError =
    !resources.polymarketHunter.hydrated
    && Boolean(resources.polymarketHunter.error);
  const polymarketHunterRefreshError =
    resources.polymarketHunter.hydrated
    && Boolean(resources.polymarketHunter.error);
  const polymarketHunterResolved =
    resources.polymarketHunter.hydrated
    || polymarketHunterInitialError;
  useEffect(() => {
    if (activeTab !== "watchlist") {
      setWatchlistFallbackReady(false);
      return;
    }
    if (watchlistSummaryResolved || watchlistSummaryInitialError || !resources.selectedAssetTruth.hydrated) {
      setWatchlistFallbackReady(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setWatchlistFallbackReady(true);
    }, ROUTE_STALL_FALLBACK_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeTab,
    resources.selectedAssetTruth.hydrated,
    watchlistSummaryInitialError,
    watchlistSummaryResolved,
  ]);
  const watchlistWorkspaceFallbackReady =
    activeTab === "watchlist"
    && watchlistFallbackReady
    && resources.selectedAssetTruth.hydrated
    && !watchlistSummaryResolved;
  const deskWorkspaceReady =
    showResolvedFocusSurface
    && (visibleMarketChartTerminal || visibleAssetContextReady)
    && marketShellTruthHydrated;
  const watchlistWorkspaceReady =
    activeTab === "watchlist"
    && (watchlistSummaryResolved || watchlistWorkspaceFallbackReady);
  const polymarketWorkspaceReady =
    activeTab === "polymarket"
    && polymarketHunterResolved;
  const watchlistWorkspaceError =
    watchlistSummaryInitialError
      ? resources.watchlistSummary.error
      : watchlistWorkspaceFallbackReady
        ? "Watchlist board refresh is taking longer than expected. Current route context stays usable while the board reconnects."
        : null;
  const tradesWorkspaceReady =
    activeTab === "active_trades"
    && Boolean(selectedSymbol)
    && (
      (showResolvedFocusSurface && (visibleMarketChartTerminal || visibleAssetContextReady))
      || focusedWorkflowContextReady
      || visibleTradeDetail !== null
      || focusedTradeRows.length > 0
      || totalActiveTradeCount > 0
      || tradesFallbackStateReady
      || (
        !resources.proposedPaperTrades.loading
        && !resources.activePaperTrades.loading
        && !resources.closedPaperTrades.loading
      )
    );
  const ticketsWorkspaceReady =
    activeTab === "trade_tickets"
    && Boolean(selectedSymbol)
    && (
      focusedWorkflowContextReady
      || visibleTicketDetail !== null
      || focusedTicketRows.length > 0
      || focusedShadowTicketRows.length > 0
      || totalOpenTicketCount > 0
      || ticketsFallbackStateReady
    );
  const journalWorkspaceReady =
    activeTab === "journal"
    && (
      focusedWorkflowContextReady
      || resources.reviewSummary.hydrated
      || resources.journal.hydrated
      || resources.paperTradeReviews.hydrated
      || resources.paperTradeAnalytics.hydrated
      || resources.journal.data.length > 0
      || focusedTradeRows.length > 0
      || resources.paperTradeReviews.data.length > 0
      || (
        !resources.journal.loading
        && !resources.paperTradeReviews.loading
        && !resources.paperTradeAnalytics.loading
      )
    );
  const sessionWorkspaceReady =
    activeTab === "session"
    && (
      resources.reviewSummary.hydrated
      || resources.reviewTasks.hydrated
      || resources.sessionOverview.hydrated
      || resolvedReviewQueue.continuityState !== "empty"
      || resolvedReviewQueue.tasks.length > 0
      || totalOpenReviewCount > 0
      || resolvedOperationalBacklog.items.length > 0
      || resolvedReviewBacklogCounts.overdue > 0
      || resolvedReviewBacklogCounts.highPriority > 0
      || hasMeaningfulWeeklyReview(resolvedWeeklyReview)
      || (!resources.reviewTasks.loading && !resources.sessionOverview.loading)
    );
  const workspaceOwnsStateMessaging =
    (activeTab === "desk" && showResolvedFocusSurface)
    || (activeTab === "active_trades" && Boolean(selectedSymbol))
    || (activeTab === "trade_tickets" && Boolean(selectedSymbol))
    || activeTab === "journal"
    || (activeTab === "ai_desk" && Boolean(selectedSymbol))
    || (activeTab === "research" && Boolean(selectedSymbol))
    || activeTab === "session";
  const focusedSignalId =
    selectedSignalId
    ?? visibleSignalDetail?.signal_id
    ?? visibleSignalSummary?.signal_id
    ?? visibleAssetContext.latest_signal?.signal_id
    ?? null;
  const focusedRiskReportId =
    selectedRiskReportId
    ?? visibleRiskDetail?.risk_report_id
    ?? selectedSignalWorkspace?.risk?.risk_report_id
    ?? visibleAssetContext.latest_risk?.risk_report_id
    ?? null;
  const selectedSignalLabel = visibleSignalDetail
    ? `${visibleSignalDetail.display_symbol ?? visibleSignalDetail.data_reality?.provenance.tradable_symbol ?? visibleSignalDetail.symbol} ${visibleSignalDetail.signal_type}`
    : visibleSignalSummary
      ? `${visibleSignalSummary.display_symbol ?? visibleSignalSummary.data_reality?.provenance.tradable_symbol ?? visibleSignalSummary.symbol} ${visibleSignalSummary.signal_type}`
    : visibleAssetContext.latest_signal
      ? `${visibleAssetContext.latest_signal.display_symbol ?? visibleAssetContext.latest_signal.data_reality?.provenance.tradable_symbol ?? visibleAssetContext.latest_signal.symbol} ${visibleAssetContext.latest_signal.signal_type}`
      : null;
  const selectedRiskLabel = visibleRiskDetail
    ? `${visibleRiskDetail.display_symbol ?? visibleRiskDetail.data_reality?.provenance.tradable_symbol ?? visibleRiskDetail.symbol} stop ${visibleRiskDetail.stop_price.toFixed(2)}`
    : null;
  const focusInstrumentLabel = visibleMarketChart.instrument_mapping.trader_symbol ?? selectedSymbol;
  const focusUnderlyingLabel = visibleMarketChart.instrument_mapping.underlying_asset !== focusInstrumentLabel
    ? visibleMarketChart.instrument_mapping.underlying_asset
    : null;
  const selectedAssetTruthState = selectedAssetTruthStateLabel(visibleSelectedAssetTruth);
  const selectedAssetTruthSource = selectedAssetTruthSourceFamilyLabel(visibleSelectedAssetTruth);
  const selectedAssetTruthFallback = selectedAssetTruthFallbackLabel(visibleSelectedAssetTruth);
  const selectedAssetTruthFreshness = selectedAssetTruthFreshnessLabel(visibleSelectedAssetTruth);
  const selectedOpportunity = useMemo(
    () =>
      [...resources.opportunities.data.focus_queue, ...resources.opportunities.data.scout_queue].find((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol))
      ?? null,
    [resources.opportunities.data.focus_queue, resources.opportunities.data.scout_queue, selectedSymbol],
  );
  const selectedAssetReadiness = useMemo(
    () =>
      deriveAssetReadiness({
        watchlistRow: selectedWatchlistSummary,
        opportunity: selectedOpportunity,
        commodityTruth: visibleCommodityTruth,
      }),
    [selectedOpportunity, selectedWatchlistSummary, visibleCommodityTruth],
  );
  const selectedMappingNote = useMemo(
    () => instrumentMappingExplainer(visibleMarketChart.instrument_mapping ?? selectedWatchlistSummary?.instrument_mapping ?? null),
    [selectedWatchlistSummary?.instrument_mapping, visibleMarketChart.instrument_mapping],
  );
  const selectedHasSignal = Boolean(focusedSignalId ?? visibleAssetContext.latest_signal?.signal_id);
  const selectedHasRisk = Boolean(focusedRiskReportId ?? visibleAssetContext.latest_risk?.risk_report_id);

  function scrollOperatorWorkspaceIntoView() {
    const node = operatorWorkspaceRef.current;
    if (!node) {
      return;
    }
    const isJsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
    const mainPane = operatorMainRef.current;
    if (!isJsdom && mainPane) {
      const top = node.getBoundingClientRect().top - mainPane.getBoundingClientRect().top + mainPane.scrollTop - 8;
      const nextTop = Math.max(0, top);
      if (typeof mainPane.scrollTo === "function") {
        try {
          mainPane.scrollTo({ top: nextTop, behavior: "auto" });
          return;
        } catch {
          // Older browser surfaces may not implement scroll options on elements.
        }
      }
      mainPane.scrollTop = nextTop;
      return;
    }
    if (typeof window.scrollTo !== "function") {
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

  function applyWorkspaceRoute(
    nextRouteLike: Partial<WorkspaceRouteState> | WorkspaceRouteState,
    mode: "push" | "replace" = "push",
    options?: { scroll?: boolean },
  ) {
    const nextRoute = resolveWorkspaceTarget(nextRouteLike, DEFAULT_WORKSPACE_ROUTE);
    routeSyncModeRef.current = mode;
    setActiveTab(nextRoute.tab);
    setExplicitSelectedSymbol(nextRoute.symbol ?? "");
    setSelectedSignalId(nextRoute.signalId);
    setSelectedRiskReportId(nextRoute.riskReportId);
    setSelectedTradeId(nextRoute.tradeId);
    setSelectedTicketId(nextRoute.ticketId);
    setSelectedReviewTaskId(nextRoute.reviewTaskId);
    setSelectedTimeframe(nextRoute.timeframe);
    setProposalError(null);
    if (options?.scroll !== false) {
      queueOperatorWorkspaceScroll();
    }
  }

  function navigateWorkspaceTarget(
    target: WorkspaceTarget,
    mode: "push" | "replace" = "push",
    options?: { scroll?: boolean },
  ) {
    applyWorkspaceRoute(resolveWorkspaceTarget(target, currentRouteState), mode, options);
  }

  function navigateTab(nextTab: TabKey) {
    navigateWorkspaceTarget({ tab: nextTab }, "push");
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
    if (activeTab === "high_risk") {
      applyWorkspaceRoute({ tab: "signals" }, "replace", { scroll: false });
      return;
    }
    if (activeTab === "replay" && !replayEnabled) {
      applyWorkspaceRoute({ tab: "active_trades" }, "replace", { scroll: false });
    }
  }, [activeTab, replayEnabled]);

  useEffect(() => {
    if (activeTab !== "signals" || selectedSignalId || signalRows.length === 0) {
      return;
    }
    const boardSignal =
      signalRows.find((row) => isPrimaryCommodity(row.symbol))
      ?? signalRows[0];
    if (!boardSignal) {
      return;
    }
    setAutoSelectedSymbol((current) => (sameTerminalFocusSymbol(current, boardSignal.symbol) ? current : boardSignal.symbol));
    setSelectedSignalId(boardSignal.signal_id);
    setSelectedRiskReportId((current) => current ?? null);
    setSelectedTradeId((current) => current === null ? current : null);
    setSelectedTicketId((current) => current === null ? current : null);
    setProposalError(null);
  }, [activeTab, selectedSignalId, signalRows]);

  useLayoutEffect(() => {
    if (!selectedSymbol || (linkedStateOwnsSelection && (selectedTradeId || selectedTicketId))) {
      return;
    }
    const nextSignalId = resolveSelectedSignalHydrationId({
      selectedSignalId,
      selectedSymbol,
      signalRows,
      assetSignalId: currentSymbolAssetSignalId,
    });
    if (nextSignalId !== selectedSignalId) {
      setSelectedSignalId(nextSignalId);
    }
    const nextRiskReportId = resolveSelectedRiskHydrationId({
      selectedRiskReportId,
      selectedSymbol,
      riskRows: resources.risk.data,
      assetRiskId: currentSymbolAssetRiskId,
      workspaceRiskId: currentWorkspaceRiskId,
    });
    if (nextRiskReportId !== selectedRiskReportId) {
      setSelectedRiskReportId(nextRiskReportId);
    }
  }, [
    currentSymbolAssetRiskId,
    currentSymbolAssetSignalId,
    currentWorkspaceRiskId,
    linkedStateOwnsSelection,
    resources.risk.data,
    selectedTicketId,
    selectedTradeId,
    selectedRiskReportId,
    selectedSignalId,
    selectedSymbol,
    signalRows,
  ]);

  useEffect(() => {
    if (!selectedSignalWorkspace) {
      return;
    }
    const nextSymbol = selectedSignalWorkspace.selected_symbol;
    const nextRiskReportId = selectedSignalWorkspace.risk?.risk_report_id ?? null;
    if (nextSymbol) {
      setExplicitSelectedSymbol((current) => {
        if (!current) {
          return nextSymbol;
        }
        return sameTerminalFocusSymbol(current, nextSymbol) ? current : nextSymbol;
      });
    }
    setSelectedRiskReportId((current) => {
      if (current) {
        return current;
      }
      return nextRiskReportId;
    });
  }, [selectedSignalWorkspace]);

  useEffect(() => {
    if ((linkedStateOwnsSelection && (selectedTradeId || selectedTicketId)) || selectedSignalWorkspace) {
      return;
    }
    const signalId = resources.assetContext.data.latest_signal?.signal_id
      ?? signalRows.find((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol))?.signal_id
      ?? null;
    const riskReportId = resources.assetContext.data.latest_risk?.risk_report_id
      ?? resources.risk.data.find((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol))?.risk_report_id
      ?? null;
    setSelectedSignalId((current) => current ?? signalId);
    setSelectedRiskReportId((current) => current ?? riskReportId);
  }, [
    resources.assetContext.data.latest_risk,
    resources.assetContext.data.latest_signal,
    linkedStateOwnsSelection,
    resources.risk.data,
    selectedSignalWorkspace,
    selectedSymbol,
    selectedTicketId,
    selectedTradeId,
    signalRows,
  ]);

  useEffect(() => {
    if (!linkedStateOwnsSelection || !selectedTradeId || !visibleTradeDetail) {
      return;
    }
    const nextSignalId = visibleTradeDetail.linked_signal?.signal_id ?? (visibleTradeDetail.signal_id ? null : undefined);
    const nextRiskReportId = visibleTradeDetail.linked_risk?.risk_report_id ?? (visibleTradeDetail.risk_report_id ? null : undefined);
    if (nextSignalId !== undefined) {
      setSelectedSignalId((current) => (current === nextSignalId ? current : nextSignalId));
    }
    if (nextRiskReportId !== undefined) {
      setSelectedRiskReportId((current) => (current === nextRiskReportId ? current : nextRiskReportId));
    }
  }, [linkedStateOwnsSelection, selectedTradeId, visibleTradeDetail]);

  useEffect(() => {
    if (!linkedStateOwnsSelection || !selectedTicketId || selectedTradeId || !visibleTicketDetail) {
      return;
    }
    const nextSignalId = visibleTicketDetail.linked_signal?.signal_id ?? (visibleTicketDetail.signal_id ? null : undefined);
    const nextRiskReportId = visibleTicketDetail.linked_risk?.risk_report_id ?? (visibleTicketDetail.risk_report_id ? null : undefined);
    if (nextSignalId !== undefined) {
      setSelectedSignalId((current) => (current === nextSignalId ? current : nextSignalId));
    }
    if (nextRiskReportId !== undefined) {
      setSelectedRiskReportId((current) => (current === nextRiskReportId ? current : nextRiskReportId));
    }
  }, [linkedStateOwnsSelection, selectedTicketId, selectedTradeId, visibleTicketDetail]);

  useEffect(() => {
    const preferredSymbol =
      preferredCommoditySymbol(resources.watchlistSummary.data)
      ?? resources.watchlist.data[0]?.symbol
      ?? resources.signalsSummary.data.top_ranked_signals[0]?.symbol
      ?? resources.signals.data[0]?.symbol;
    if (preferredSymbol) {
      if (selectedSymbolModeRef.current === "explicit" && selectedSymbol) {
        return;
      }
      const shouldAdoptPreferred =
        !hasAutoSelectedSymbol
        || !selectedSymbol
        || (!sameTerminalFocusSymbol(selectedSymbol, preferredSymbol) && !isPrimaryCommodity(selectedSymbol) && isPrimaryCommodity(preferredSymbol));
      if (shouldAdoptPreferred) {
        setAutoSelectedSymbol((current) => (current === preferredSymbol ? current : preferredSymbol));
        setHasAutoSelectedSymbol(true);
      }
    }
  }, [hasAutoSelectedSymbol, resources.signals.data, resources.signalsSummary.data.top_ranked_signals, resources.watchlist.data, resources.watchlistSummary.data, selectedSymbol]);

  useEffect(() => {
    const canonicalOverviewSymbol = resources.overview.data.selected_asset_truth?.symbol ?? null;
    if (!canonicalOverviewSymbol) {
      return;
    }
    if (selectedSymbolModeRef.current === "explicit" && selectedSymbol) {
      return;
    }
    if (!selectedSymbol) {
      setAutoSelectedSymbol((current) => (current === canonicalOverviewSymbol ? current : canonicalOverviewSymbol));
      setHasAutoSelectedSymbol(true);
    }
  }, [resources.overview.data.selected_asset_truth, selectedSymbol]);

  useEffect(() => {
    if (activeTab !== "desk") {
      return;
    }
    const hydrationKey = [
      resolvedHomeSummary.generated_at,
      totalProposedTradeCount,
      totalActiveTradeCount,
      selectedTradeId ?? "",
    ].join("|");
    if (
      tradeDeskHydrationRef.current === hydrationKey
      || resources.proposedPaperTrades.loading
      || resources.activePaperTrades.loading
      || (totalProposedTradeCount <= 0 && totalActiveTradeCount <= 0 && !selectedTradeId)
    ) {
      return;
    }
    tradeDeskHydrationRef.current = hydrationKey;
    void Promise.allSettled([
      resources.proposedPaperTrades.refresh(),
      resources.activePaperTrades.refresh(),
      selectedTradeId ? resources.paperTradeDetail.refresh() : Promise.resolve(),
    ]);
  }, [
    activeTab,
    resolvedHomeSummary.generated_at,
    resources.activePaperTrades,
    resources.proposedPaperTrades,
    resources.paperTradeDetail,
    selectedTradeId,
    totalActiveTradeCount,
    totalProposedTradeCount,
  ]);

  useEffect(() => {
    if (activeTab !== "desk") {
      return;
    }
    const hydrationKey = [
      resolvedHomeSummary.generated_at,
      totalOpenTicketCount,
      selectedTicketId ?? "",
    ].join("|");
    if (
      ticketDeskHydrationRef.current === hydrationKey
      || resources.tradeTickets.loading
      || resources.tradeTicketSummary.loading
      || (totalOpenTicketCount <= 0 && !selectedTicketId)
    ) {
      return;
    }
    ticketDeskHydrationRef.current = hydrationKey;
    void Promise.allSettled([
      resources.tradeTickets.refresh(),
      resources.tradeTicketSummary.refresh(),
      selectedTicketId ? resources.tradeTicketDetail.refresh() : Promise.resolve(),
    ]);
  }, [
    activeTab,
    resolvedHomeSummary.generated_at,
    resources.tradeTicketDetail,
    resources.tradeTicketSummary,
    resources.tradeTickets,
    selectedTicketId,
    totalOpenTicketCount,
  ]);

  useEffect(() => {
    if (selectedSignalId && (selectionUnavailableError(resources.selectedSignalWorkspace.error) || selectionUnavailableError(resources.signalDetail.error))) {
      setSelectedSignalId(null);
    }
  }, [resources.selectedSignalWorkspace.error, resources.signalDetail.error, selectedSignalId]);

  useEffect(() => {
    if (selectedRiskReportId && selectionUnavailableError(resources.riskDetail.error)) {
      setSelectedRiskReportId(null);
    }
  }, [resources.riskDetail.error, selectedRiskReportId]);

  useEffect(() => {
    const nextTradeId = paperTradeRows.find((row) => row.trade_id === selectedTradeId && sameTerminalFocusSymbol(row.symbol, selectedSymbol))?.trade_id
      ?? paperTradeRows.find((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol))?.trade_id
      ?? (!selectedSymbol ? paperTradeRows[0]?.trade_id : null)
      ?? null;
    setSelectedTradeId((current) => current === nextTradeId ? current : nextTradeId);
  }, [paperTradeRows, selectedSymbol, selectedTradeId]);

  useEffect(() => {
    const ticketRows = resources.tradeTickets.data;
    const nextTicketId = ticketRows.find((row) => row.ticket_id === selectedTicketId && sameTerminalFocusSymbol(row.symbol, selectedSymbol))?.ticket_id
      ?? ticketRows.find((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol))?.ticket_id
      ?? (!selectedSymbol ? ticketRows[0]?.ticket_id : null)
      ?? null;
    setSelectedTicketId((current) => current === nextTicketId ? current : nextTicketId);
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
            navigateWorkspaceTarget({
              tab: "watchlist",
              symbol: commodityShortcuts[commodityKey],
              signalId: null,
              riskReportId: null,
              tradeId: null,
              ticketId: null,
              reviewTaskId: null,
            });
            return;
          }
          const index = Number(event.key) - 1;
          if (Number.isInteger(index) && hotkeyTabs[index]) {
            event.preventDefault();
            navigateTab(hotkeyTabs[index]);
          }
        }
      }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentRouteState]);

  async function refreshDesk() {
    await Promise.all([
      resources.health.refresh(),
      resources.overview.refresh(),
      resources.controlCenter.refresh(),
      resources.opsSummary.refresh(),
      resources.deskSummary.refresh(),
      resources.homeSummary.refresh(),
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
      resources.researchRuns.refresh(),
      resources.risk.refresh(),
      resources.riskExposure.refresh(),
      resources.proposedPaperTrades.refresh(),
      resources.activePaperTrades.refresh(),
      resources.closedPaperTrades.refresh(),
      resources.paperTradeAnalytics.refresh(),
      resources.paperTradeReviews.refresh(),
      resources.journal.refresh(),
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
      await Promise.all([
        resources.selectedSignalWorkspace.refresh(),
        resources.signalDetail.refresh(),
      ]);
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
      resources.homeSummary.refresh(),
      resources.assetContext.refresh(),
      resources.marketChart.refresh(),
      resources.watchlistSummary.refresh(),
      resources.signals.refresh(),
      resources.signalsSummary.refresh(),
      resources.highRiskSignals.refresh(),
      resources.news.refresh(),
    ]);
    if (selectedSignalId) {
      await Promise.all([
        resources.selectedSignalWorkspace.refresh(),
        resources.signalDetail.refresh(),
      ]);
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

  async function proposePaperTradeFromSignal(signalId?: string | null, riskReportId?: string | null) {
    const workspaceSignal =
      selectedSignalWorkspace && (!signalId || selectedSignalWorkspace.signal.signal_id === signalId)
        ? selectedSignalWorkspace
        : null;
    const sourceSignal =
      workspaceSignal?.signal
      ?? signalRows.find((row) => row.signal_id === signalId)
      ?? visibleSignalDetail
      ?? visibleSignalSummary
      ?? visibleAssetContext.latest_signal
      ?? null;
    const resolvedSignalId = signalId ?? sourceSignal?.signal_id ?? null;
    const resolvedRiskId =
      riskReportId
      ?? workspaceSignal?.risk?.risk_report_id
      ?? visibleRiskDetail?.risk_report_id
      ?? visibleSignalDetail?.related_risk?.risk_report_id
      ?? visibleAssetContext.latest_risk?.risk_report_id
      ?? selectedRiskReportId
      ?? null;

    if (!resolvedSignalId || !sourceSignal) {
      setProposalError("No signal is in scope yet. Load a setup first, or use Tickets for a manual paper proposal.");
      return;
    }

    setProposalBusy(true);
    setProposalError(null);
    try {
      const proposedTrade = await apiClient.createProposedPaperTrade({
        signal_id: resolvedSignalId,
        risk_report_id: resolvedRiskId,
        symbol: workspaceSignal?.selected_symbol ?? sourceSignal.symbol,
        side: sourceSignal.direction === "short" ? "short" : "long",
        notes: "Proposed from the signal workflow. Advisory-only paper trade.",
      });
      setExplicitSelectedSymbol(proposedTrade.symbol);
      setSelectedSignalId(proposedTrade.signal_id ?? resolvedSignalId);
      setSelectedRiskReportId(proposedTrade.risk_report_id ?? resolvedRiskId);
      setSelectedTradeId(proposedTrade.trade_id);
      setSelectedTicketId(null);
      await refreshDesk();
      navigateTab("active_trades");
    } catch (actionError) {
      setProposalError(actionError instanceof Error ? actionError.message : "Unable to propose the paper trade right now.");
    } finally {
      setProposalBusy(false);
    }
  }

  function focusSymbol(symbol: string, signalId?: string | null, riskReportId?: string | null) {
    routeSyncModeRef.current = "replace";
    setExplicitSelectedSymbol(symbol);
    setSelectedSignalId(signalId ?? null);
    setSelectedRiskReportId(riskReportId ?? null);
    setSelectedTradeId(null);
    setSelectedTicketId(null);
    setSelectedReviewTaskId(null);
    setProposalError(null);
  }

  function focusSymbolFromRail(symbol: string) {
    navigateWorkspaceTarget({
      tab: focusSurfaceTabs.includes(activeTab) ? activeTab : "watchlist",
      symbol,
      signalId: null,
      riskReportId: null,
      tradeId: null,
      ticketId: null,
      reviewTaskId: null,
    });
  }

  function focusTrade(tradeId: string | null) {
    const trade = paperTradeRows.find((row) => row.trade_id === tradeId);
    const nextSelection = resolveTradeFocusSelection(trade ?? null);
    routeSyncModeRef.current = "replace";
    setSelectedTradeId(nextSelection.selectedTradeId);
    setSelectedTicketId(nextSelection.selectedTicketId);
    setSelectedSignalId(nextSelection.selectedSignalId);
    setSelectedRiskReportId(nextSelection.selectedRiskReportId);
    setSelectedReviewTaskId(null);
    if (!trade || !nextSelection.selectedSymbol) {
      return;
    }
    setExplicitSelectedSymbol(nextSelection.selectedSymbol);
    setProposalError(null);
  }

  function focusTicket(ticketId: string | null) {
    const ticket = resources.tradeTickets.data.find((row) => row.ticket_id === ticketId);
    const nextSelection = resolveTicketFocusSelection(ticket ?? null);
    routeSyncModeRef.current = "replace";
    setSelectedTicketId(nextSelection.selectedTicketId);
    setSelectedTradeId(nextSelection.selectedTradeId);
    setSelectedSignalId(nextSelection.selectedSignalId);
    setSelectedRiskReportId(nextSelection.selectedRiskReportId);
    setSelectedReviewTaskId(null);
    if (!ticket || !nextSelection.selectedSymbol) {
      return;
    }
    setExplicitSelectedSymbol(nextSelection.selectedSymbol);
    setProposalError(null);
  }

  function openAssetWorkspace(symbol: string, signalId?: string | null, riskReportId?: string | null, tradeId?: string | null) {
    navigateWorkspaceTarget(
      assetWorkspaceTarget({
        symbol,
        signalId: signalId ?? null,
        riskReportId: riskReportId ?? null,
        tradeId: tradeId ?? null,
        reviewTaskId: selectedReviewTaskId,
        timeframe: selectedTimeframe,
      }),
    );
  }

  function openWorkspaceContext(nextTab: TabKey, symbol: string, signalId?: string | null, riskReportId?: string | null, tradeId?: string | null) {
    navigateWorkspaceTarget(
      workspaceTabTarget(nextTab, {
        symbol,
        signalId: signalId ?? null,
        riskReportId: riskReportId ?? null,
        tradeId: tradeId ?? null,
        ticketId: null,
        reviewTaskId: selectedReviewTaskId,
      }),
    );
  }

  function openSignalContext(symbol: string, signalId: string, riskReportId?: string | null) {
    navigateWorkspaceTarget(
      signalContextTarget({
        symbol,
        signalId,
        riskReportId: riskReportId ?? null,
        reviewTaskId: selectedReviewTaskId,
      }),
    );
  }

  function openRiskContext(symbol: string, riskReportId: string, signalId?: string | null) {
    navigateWorkspaceTarget(
      riskContextTarget({
        symbol,
        signalId: signalId ?? null,
        riskReportId,
        reviewTaskId: selectedReviewTaskId,
      }),
    );
  }

  function openTradeThread(tradeId: string) {
    navigateWorkspaceTarget(
      tradeThreadTarget({
        symbol: selectedSymbol || null,
        signalId: selectedSignalId,
        riskReportId: selectedRiskReportId,
        tradeId,
        reviewTaskId: selectedReviewTaskId,
      }),
    );
  }

  function openWireItem(item: OperatorWireItemView) {
    navigateWorkspaceTarget(operatorWireTarget(item, selectedSymbol), "push");
  }

  function openReviewTask(task: ReviewTaskView) {
    navigateWorkspaceTarget(reviewTaskPrimaryTarget(task, selectedSymbol), "push");
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
  const selectedReviewTask = useMemo(
    () => resolvedReviewQueue.tasks.find((task) => task.task_id === selectedReviewTaskId) ?? null,
    [resolvedReviewQueue.tasks, selectedReviewTaskId],
  );
  const continuityActions = useMemo(
    () => [
      {
        key: "desk",
        label: "Asset workspace",
        target: assetWorkspaceTarget({
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          tradeId: selectedTradeId,
          reviewTaskId: selectedReviewTaskId,
          timeframe: selectedTimeframe,
        }),
      },
      {
        key: "ai_desk",
        label: "AI Desk",
        target: workspaceTabTarget("ai_desk", {
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          tradeId: selectedTradeId,
          reviewTaskId: selectedReviewTaskId,
        }),
      },
      {
        key: "research",
        label: "Research",
        target: workspaceTabTarget("research", {
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          tradeId: selectedTradeId,
          reviewTaskId: selectedReviewTaskId,
        }),
      },
      {
        key: "signals",
        label: "Signals",
        target: signalContextTarget({
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          reviewTaskId: selectedReviewTaskId,
        }),
      },
      {
        key: "risk",
        label: "Risk",
        target: riskContextTarget({
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          reviewTaskId: selectedReviewTaskId,
        }),
      },
      {
        key: "active_trades",
        label: "Trades",
        target: tradeThreadTarget({
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          tradeId: selectedTradeId,
          reviewTaskId: selectedReviewTaskId,
        }),
      },
      {
        key: "journal",
        label: "Journal",
        target: workspaceTabTarget("journal", {
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          tradeId: selectedTradeId,
          reviewTaskId: selectedReviewTaskId,
        }),
      },
      {
        key: "session",
        label: "Review Queue",
        target: workspaceTabTarget("session", {
          symbol: selectedSymbol || null,
          signalId: selectedSignalId,
          riskReportId: selectedRiskReportId,
          tradeId: selectedTradeId,
          reviewTaskId: selectedReviewTaskId,
        }),
      },
    ],
    [selectedReviewTaskId, selectedRiskReportId, selectedSignalId, selectedSymbol, selectedTimeframe, selectedTradeId],
  );

  const routeWorkspaceSettled =
    deskWorkspaceReady
    || watchlistWorkspaceReady
    || polymarketWorkspaceReady
    || tradesWorkspaceReady
    || ticketsWorkspaceReady
    || journalWorkspaceReady
    || sessionWorkspaceReady;
  const shellBootstrapPending = activeTab === "desk"
    ? !deskWorkspaceReady
    : activeTab === "watchlist"
      ? !watchlistWorkspaceReady
      : activeTab === "polymarket"
        ? !polymarketWorkspaceReady
        : !routeWorkspaceSettled
          && !workspaceOwnsStateMessaging
          && !resources.overview.hydrated;
  const showShellLoadingState = shellBootstrapPending;
  const marketRouteStatus = useMemo<MarketRouteStatus | null>(() => {
    if (shellBootstrapPending) {
      return null;
    }

    if (activeTab === "desk" && deskWorkspaceReady) {
      if (
        watchlistSummaryRefreshError
        || (visibleMarketChartTerminal && !visibleAssetContextReady && Boolean(resources.assetContext.error))
        || (visibleAssetContextReady && !visibleMarketChartTerminal && Boolean(resources.marketChart.error))
      ) {
        return {
          tone: "degraded",
          title: "Supporting market context is recovering",
          detail:
            "The focus surface is usable now. Companion chart, asset, or board context is still reconnecting in the background.",
        };
      }

      if (
        (!watchlistSummaryResolved && resources.watchlistSummary.loading)
        || resources.watchlistSummary.refreshing
        || (visibleMarketChartTerminal && !visibleAssetContextReady && (resources.assetContext.loading || resources.assetContext.refreshing))
        || (visibleAssetContextReady && !visibleMarketChartTerminal && (resources.marketChart.loading || resources.marketChart.refreshing))
      ) {
        return {
          tone: "syncing",
          title: "Supporting market context is still syncing",
          detail:
            "The desk is usable now. Board summary and companion context are still catching up without blocking the route.",
        };
      }
    }

    if (activeTab === "watchlist" && watchlistWorkspaceReady) {
      if (watchlistWorkspaceFallbackReady || watchlistSummaryInitialError || watchlistSummaryRefreshError || opportunitiesInitialError || opportunitiesRefreshError) {
        return {
          tone: "degraded",
          title: "Board refresh is degraded but usable",
          detail:
            watchlistWorkspaceFallbackReady
              ? "Selected-asset truth and scouting queues remain usable while the primary commodity board reconnects."
              : "Current watchlist rows remain available while the latest board or scouting refresh reconnects.",
        };
      }

      if (opportunitiesInitialLoading || resources.opportunities.refreshing) {
        return {
          tone: "syncing",
          title: "Scouting queues are still syncing",
          detail:
            "The primary board is usable now. Focus and scout queues are still arriving in the background.",
        };
      }
    }

    if (activeTab === "polymarket" && polymarketWorkspaceReady) {
      if (polymarketHunterInitialError || polymarketHunterRefreshError) {
        return {
          tone: "degraded",
          title: "Crowd-market refresh is degraded but usable",
          detail:
            "Last verified Polymarket context stays visible while the latest scan reconnects.",
        };
      }

      if (resources.polymarketHunter.refreshing) {
        return {
          tone: "syncing",
          title: "Crowd-market refresh is still syncing",
          detail:
            "Current markets remain usable while the next Polymarket scan finishes in the background.",
        };
      }
    }

    return null;
  }, [
    activeTab,
    deskWorkspaceReady,
    opportunitiesInitialLoading,
    opportunitiesInitialError,
    opportunitiesRefreshError,
    polymarketHunterInitialError,
    polymarketHunterRefreshError,
    polymarketWorkspaceReady,
    resources.assetContext.error,
    resources.assetContext.loading,
    resources.assetContext.refreshing,
    resources.marketChart.error,
    resources.marketChart.loading,
    resources.marketChart.refreshing,
    resources.opportunities.refreshing,
    resources.polymarketHunter.refreshing,
    resources.watchlistSummary.loading,
    resources.watchlistSummary.refreshing,
    shellBootstrapPending,
    visibleAssetContextReady,
    visibleMarketChartTerminal,
    watchlistWorkspaceFallbackReady,
    watchlistSummaryInitialError,
    watchlistSummaryRefreshError,
    watchlistSummaryResolved,
    watchlistWorkspaceReady,
  ]);
  useEffect(() => {
    if (!hasSettledWorkspaceScroll && !shellBootstrapPending) {
      queueOperatorWorkspaceScroll();
      setHasSettledWorkspaceScroll(true);
    }
  }, [hasSettledWorkspaceScroll, shellBootstrapPending]);
  const hotkeyHints: HotkeyHint[] = useMemo(
    () =>
      hotkeyTabs.map((tabKey, index) => ({
        key: tabKey,
        label: allTabs.find((item) => item.key === tabKey)?.label ?? tabKey,
        shortcut: String(index + 1),
      })),
    [],
  );

  const navGroups: NavGroup[] = useMemo(() => {
    function buildItem(tabKey: TabKey): NavItem {
      const tab = allTabs.find((item) => item.key === tabKey);
      return {
        key: tabKey,
        label: tab?.label ?? tabKey,
        badge:
          tabKey === "session"
            ? `${resolvedReviewBacklogCounts.overdue}/${Math.max(resolvedReviewBacklogCounts.openReviews, resolvedReviewBacklogCounts.highPriority)}`
            : tabKey === "pilot_ops"
              ? gateStatusLabel(resolvedExecutionGate.status)
              : tabKey === "trade_tickets"
                ? String(totalOpenTicketCount)
                : tabKey === "active_trades"
                  ? String(totalActiveTradeCount)
                  : undefined,
        tone:
          tabKey === activeTab
            ? "active"
            : tabKey === "pilot_ops" && resolvedExecutionGate.status === "review_required"
              ? "warning"
              : tabKey === "session" && resolvedReviewBacklogCounts.overdue > 0
                ? "critical"
                : "default",
      };
    }

    return [
      {
        title: "Primary Workspace",
        items: ["desk", "ai_desk", "research", "signals", "risk"].map((tabKey) => buildItem(tabKey as TabKey)),
      },
      {
        title: "Trading Workflow",
        items: ["active_trades", "trade_tickets", "journal", "session"].map((tabKey) => buildItem(tabKey as TabKey)),
      },
      {
        title: "Market Watch",
        items: ["watchlist", "news", "polymarket"].map((tabKey) => buildItem(tabKey as TabKey)),
      },
      {
        title: "Tools & Ops",
        items: ["strategy_lab", "backtests", "pilot_ops", "wallet_balance"]
          .map((tabKey) => buildItem(tabKey as TabKey))
          .concat(replayEnabled ? [buildItem("replay")] : []),
      },
    ];
  }, [
    activeTab,
    replayEnabled,
    resolvedExecutionGate.status,
    resolvedReviewBacklogCounts.highPriority,
    resolvedReviewBacklogCounts.openReviews,
    resolvedReviewBacklogCounts.overdue,
    totalActiveTradeCount,
    totalOpenReviewCount,
    totalOpenTicketCount,
  ]);

  function renderTabContent() {
    switch (activeTab) {
      case "desk":
        return (
          <DeskTab
            commodityTruth={visibleCommodityTruth}
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
            operationalBacklog={shellBacklogSummary}
            paperCapitalSummary={paperCapitalSummary}
            reviewSummary={resources.reviewSummary.data}
            selectedAssetReadiness={selectedAssetReadiness}
            selectedHasRisk={selectedHasRisk}
            selectedHasSignal={selectedHasSignal}
            selectedInstrumentLabel={focusInstrumentLabel}
            selectedMappingNote={selectedMappingNote}
            selectedUnderlyingLabel={focusUnderlyingLabel}
          />
        );
      case "signals":
        return (
          <SignalTable
            commodityTruth={visibleCommodityTruth}
            highRiskRows={highRiskSignalRows}
            onSelectSignal={setSelectedSignalId}
            onSelectSymbol={focusSymbol}
            rows={signalRows}
            selectedSymbol={selectedSymbol}
          />
        );
      case "high_risk":
        return (
          <SignalTable
            commodityTruth={visibleCommodityTruth}
            highRiskRows={highRiskSignalRows}
            onSelectSignal={setSelectedSignalId}
            onSelectSymbol={focusSymbol}
            rows={signalRows}
            selectedSymbol={selectedSymbol}
          />
        );
        case "research":
          return (
            <ResearchTab
              commodityTruth={visibleCommodityTruth}
              selectedAIModel={selectedAIModel}
              selectedAIProvider={selectedAIProvider}
              focusedRiskReportId={focusedRiskReportId}
              focusedSignalId={focusedSignalId}
              onAIModelChange={setSelectedAIModel}
              onAIProviderChange={setSelectedAIProvider}
              onNavigateWorkspaceTarget={navigateWorkspaceTarget}
              onRefreshRuns={resources.researchRuns.refresh}
              onSelectSymbol={focusSymbol}
              runsError={resources.researchRuns.error}
            runsLoading={resources.researchRuns.loading}
            rows={resources.research.data}
            runs={resolvedResearchRuns}
            scenario={resources.scenario.data}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
            timeframe={selectedTimeframe}
          />
        );
      case "news":
        return <NewsTab onSelectSymbol={focusSymbol} rows={resources.news.data} />;
      case "polymarket":
        return (
          <PolymarketHunterTab
            error={polymarketHunterInitialError ? resources.polymarketHunter.error : null}
            hunter={resources.polymarketHunter.data}
            loading={resources.polymarketHunter.loading && !resources.polymarketHunter.hydrated}
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
            deskSectionNotes={resolvedDeskSectionNotes}
              focusedRiskReportId={focusedRiskReportId}
              focusedSignalId={focusedSignalId}
              onAIModelChange={setSelectedAIModel}
              onAIProviderChange={setSelectedAIProvider}
              onNavigate={(tab) => navigateTab(tab as TabKey)}
              onNavigateWorkspaceTarget={navigateWorkspaceTarget}
              onProposePaperTrade={() => void proposePaperTradeFromSignal(focusedSignalId, focusedRiskReportId)}
              riskDetail={visibleRiskDetail}
            scenario={resources.scenario.data}
            selectedAIModel={selectedAIModel}
            selectedAIProvider={selectedAIProvider}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedAssetTruth={visibleSelectedAssetTruth}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
            signalDetail={visibleSignalDetail}
            signals={signalRows}
            timeframe={selectedTimeframe}
            tradeDetail={visibleTradeDetail}
            watchlist={resources.watchlistSummary.data}
            workspaceBaseState={currentRouteState}
          />
        );
      case "active_trades":
        return (
          <ActiveTradesTab
            activeError={resources.activePaperTrades.error}
            activeLoading={resources.activePaperTrades.loading}
            activeRows={resolvedActivePaperTrades}
            closedRows={resolvedClosedPaperTrades}
            detail={resources.paperTradeDetail.data}
            openTradeCount={totalActiveTradeCount}
            onChanged={refreshDesk}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectTrade={focusTrade}
            onSelectSymbol={focusSymbol}
            proposedError={resources.proposedPaperTrades.error}
            proposedLoading={resources.proposedPaperTrades.loading}
            proposedRows={resolvedProposedPaperTrades}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedDisplaySymbol={focusInstrumentLabel}
            selectedSignalReality={visibleSignalDetail?.data_reality ?? visibleAssetContext.latest_signal?.data_reality ?? null}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
          />
        );
      case "wallet_balance":
        return <WalletBalanceTab rows={resources.walletBalance.data} />;
      case "watchlist":
        return (
          <WatchlistTab
            commodityTruth={visibleCommodityTruth}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={focusSymbol}
            opportunitiesError={opportunitiesInitialError ? resources.opportunities.error : null}
            opportunitiesLoading={opportunitiesInitialLoading}
            opportunities={resources.opportunities.data}
            rows={resources.watchlistSummary.data}
            selectedSymbol={selectedSymbol}
            summaryError={watchlistWorkspaceError}
          />
        );
      case "strategy_lab":
        return <StrategyLabTab />;
      case "backtests":
        return <BacktestsTab rows={resources.backtests.data} />;
      case "risk":
        return (
          <RiskExposureTab
            commodityTruth={visibleCommodityTruth}
            exposures={resources.riskExposure.data}
            highRiskSignals={highRiskSignalRows}
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
              analyticsError={resources.paperTradeAnalytics.error}
              analyticsLoading={resources.paperTradeAnalytics.loading}
              detail={resources.paperTradeDetail.data}
              error={resources.journal.error}
              onChanged={refreshDesk}
              onSelectTrade={focusTrade}
              onNavigateWorkspaceTarget={navigateWorkspaceTarget}
              reviewSummary={resources.reviewSummary.data}
              reviewsError={resources.paperTradeReviews.error}
              reviewsLoading={resources.paperTradeReviews.loading}
              reviews={resources.paperTradeReviews.data}
            rows={resources.journal.data}
            selectedDisplaySymbol={focusInstrumentLabel}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
            trades={paperTradeRows}
            workspaceBaseState={currentRouteState}
          />
        );
        case "session":
          return (
            <SessionDashboardTab
              backlog={resolvedOperationalBacklog}
              dailyBriefing={resolvedDailyBriefing}
              executionGate={resolvedExecutionGate}
              loading={resources.reviewTasks.loading || resources.sessionOverview.loading}
              onChanged={refreshDesk}
              onNavigateWorkspaceTarget={navigateWorkspaceTarget}
              overview={resources.sessionOverview.data}
              reviewError={resources.reviewTasks.error ?? resources.sessionOverview.error ?? null}
            reviewCount={totalOpenReviewCount}
            reviewSummary={resources.reviewSummary.data}
            reviewQueueNote={resolvedReviewQueue.continuityNote}
            reviewQueueState={resolvedReviewQueue.continuityState}
            reviewTasks={resolvedReviewQueue.tasks}
            selectedReviewTaskId={selectedReviewTaskId}
            weeklyReview={resolvedWeeklyReview}
            workspaceBaseState={currentRouteState}
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
            alerts={resources.alerts.data}
            brokerSnapshot={resources.brokerSnapshot.data}
            commodityTruth={visibleCommodityTruth}
            detail={resources.tradeTicketDetail.data}
            hydrationError={resources.tradeTickets.error}
            hydrationLoading={resources.tradeTickets.loading}
            onChanged={refreshDesk}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            selectedRiskLabel={selectedRiskLabel}
            onSelectTicket={focusTicket}
            onSelectTrade={focusTrade}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalLabel={selectedSignalLabel}
            selectedSignalId={selectedSignalId}
            selectedAssetTruth={visibleSelectedAssetTruth}
            selectedSymbol={selectedSymbol}
            selectedDisplaySymbol={focusInstrumentLabel}
            selectedTicketId={selectedTicketId}
            shadowRows={resources.shadowModeTickets.data}
            summaryCount={totalOpenTicketCount}
            systemRefreshMinutes={resources.overview.data.system_refresh_minutes}
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
        backlog={shellBacklogSummary}
        executionGate={resolvedExecutionGate}
        error={friendlyShellError(resources.overview.error)}
        health={resources.health.data}
        loading={resources.overview.loading}
        selectedAssetTruth={visibleSelectedAssetTruth}
        shellBootstrapPending={shellBootstrapPending}
        ribbon={resources.overview.data}
      />

      <div className="workspace operator-workspace">
        <LeftRail
          activeTab={activeTab}
          backlog={shellBacklogSummary}
          executionGate={resolvedExecutionGate}
          hotkeyHints={hotkeyHints}
          navGroups={navGroups}
          onSelectSymbol={focusSymbolFromRail}
          onSelectTab={(key) => navigateTab(key as TabKey)}
          research={resources.research.data}
          selectedAssetTruth={visibleSelectedAssetTruth}
          selectedSymbol={selectedSymbol}
          watchlist={resources.watchlistSummary.data}
        />

        <main className="main-pane operator-main shell-scroll-region" data-testid="operator-main" ref={operatorMainRef}>
          <header className="workspace-header terminal-workspace-header">
            <div className="workspace-header-copy">
              <p className="eyebrow">Operator Workspace</p>
              <h1>{activeTabLabel(activeTab)}</h1>
              <small className="compact-copy">
                {showFocusSurface
                  ? "Chart first. Use surrounding panels only for context that changes the next step."
                  : "Asset, truth state, and operator thread stay pinned across surfaces."}
                {" "}Hotkeys: `Alt+1..9`, `Alt+O/G/S`, `/`.
              </small>
            </div>
            <div className="workspace-actions terminal-workspace-actions">
              <div className="workspace-badges">
                <span className="tag">asset {focusInstrumentLabel}</span>
                {focusUnderlyingLabel ? <span className="tag">context {focusUnderlyingLabel}</span> : null}
                <span className="tag">{selectedAssetTruthSource}</span>
                <span className="tag">{selectedAssetTruthState}</span>
                <span className="tag">{selectedAssetTruthFallback}</span>
                <span className="tag">{selectedAssetTruthFreshness}</span>
                <span className="tag">{selectedSignalLabel ? `setup ${selectedSignalLabel}` : "setup pending"}</span>
                {resolvedExecutionGate.status === "review_required" ? (
                  <button className="text-button workspace-inline-link" onClick={() => navigateWorkspaceTarget({ tab: "session" })} type="button">
                    Review required
                  </button>
                ) : null}
              </div>
              <div className="workspace-cta-group">
                <button className="action-button" onClick={() => void refreshFocusSurface()} type="button">
                  Refresh Surface
                </button>
                <button className="text-button" onClick={() => setCommandCenterOpen((current) => !current)} type="button">
                  {commandCenterOpen ? "Hide Global Wire" : "Open Global Wire"} (/)
                </button>
              </div>
            </div>
          </header>

          <StateBlock
            error={shellError || null}
            loading={showShellLoadingState}
          />

          {marketRouteStatus ? (
            <div
              className={`route-settle-strip route-settle-strip-${marketRouteStatus.tone}`}
              data-testid="route-settle-strip"
            >
              <div className="route-settle-strip-copy">
                <span className="route-settle-label">
                  {marketRouteStatus.tone === "syncing" ? "Background sync" : "Degraded but usable"}
                </span>
                <strong>{marketRouteStatus.title}</strong>
              </div>
              <small>{marketRouteStatus.detail}</small>
            </div>
          ) : null}

          <WorkspaceContinuityBar
            actions={continuityActions}
            assetLabel={focusInstrumentLabel}
            baseState={currentRouteState}
            currentTab={activeTab}
            onNavigate={navigateWorkspaceTarget}
            reviewLabel={selectedReviewTask?.title ?? selectedReviewTaskId}
            riskLabel={selectedRiskLabel ?? selectedRiskReportId}
            signalLabel={selectedSignalLabel ?? selectedSignalId}
            tradeLabel={selectedTradeId}
            underlyingLabel={focusUnderlyingLabel}
          />

            {commandCenterOpen ? (
              <ErrorBoundary label="Command Center" resetKey={`${resources.controlCenter.data.generated_at}-${resources.opsSummary.data.generated_at}`}>
                <CommandCenter
                  onNavigateWorkspaceTarget={navigateWorkspaceTarget}
                  onOpenWireItem={openWireItem}
                  onRefreshAll={refreshDesk}
                  selectedSymbol={selectedSymbol}
                  status={resources.controlCenter.data}
                  summary={resources.opsSummary.data}
                  workspaceBaseState={currentRouteState}
                />
              </ErrorBoundary>
            ) : null}

            {showResolvedFocusSurface ? (
              <div className="focus-layout operator-focus asset-workspace-layout" key={`focus-${activeTab}-${selectedSymbol}-${selectedSignalId ?? "none"}`}>
                <Panel
                  title={`${focusInstrumentLabel} Focus`}
                  eyebrow={focusUnderlyingLabel ? `${focusUnderlyingLabel} research context` : "Current Asset"}
                  className="terminal-subpanel terminal-focus-panel asset-hero-panel"
                >
                  <ErrorBoundary label="Chart Surface" resetKey={`${activeTab}-${selectedSymbol}-${selectedTimeframe}-${resources.marketChart.data.status}`}>
                    <Suspense fallback={<ChartSurfaceFallback />}>
                      <PriceChart
                        chart={visibleMarketChart}
                        error={resources.marketChart.error}
                        loading={chartSurfacePending}
                        onNavigateWorkspaceTarget={navigateWorkspaceTarget}
                        onProposePaperTrade={(signalId, riskReportId) => void proposePaperTradeFromSignal(signalId, riskReportId)}
                        proposalBusy={proposalBusy}
                        proposalError={proposalError}
                        proposalNote={selectedSignalWorkspace?.proposal_note ?? null}
                        proposalReady={selectedSignalWorkspace?.proposal_ready ?? null}
                        onRefresh={() => void refreshFocusSurface()}
                        onRetry={() => void refreshFocusSurface()}
                        recoveryTelemetry={resources.deskSummary.data.recovery_telemetry}
                        onTimeframeChange={(nextTimeframe) => {
                          routeSyncModeRef.current = "replace";
                          setSelectedTimeframe(nextTimeframe as typeof currentRouteState.timeframe);
                        }}
                        selectedAssetTruth={visibleSelectedAssetTruth}
                        selectedRisk={visibleRiskDetail}
                        selectedSignal={visibleSignalDetail}
                        selectedTicket={visibleTicketDetail}
                        selectedTrade={visibleTradeDetail}
                        awaitingLiveUpdate={resources.marketChart.awaitingLiveUpdate}
                        streamStatus={resources.marketChart.streamStatus}
                        transportDebug={resources.marketChart.transportDebug}
                        timeframe={selectedTimeframe}
                        workspaceBaseState={currentRouteState}
                      />
                    </Suspense>
                </ErrorBoundary>
              </Panel>
              <div className="asset-companion-lane">
                <ErrorBoundary label="Signal Detail" resetKey={`${activeTab}-${selectedSymbol}-${selectedSignalId ?? "none"}`}>
                    <SignalDetailsCard
                      chart={visibleMarketChart}
                      context={visibleAssetContext}
                      detail={visibleSignalDetail}
                      error={resources.signalDetail.error}
                      loading={resources.signalDetail.loading}
                      onRetry={() => void refreshFocusSurface()}
                      ribbon={resources.overview.data}
                      selectedTicket={visibleTicketDetail}
                      selectedTrade={visibleTradeDetail}
                    />
                </ErrorBoundary>
              </div>
            </div>
          ) : null}

          <div className="operator-workspace-anchor" data-testid="operator-workspace-anchor" ref={operatorWorkspaceRef}>
            <Panel key={activeTab} title={activeTabLabel(activeTab)} eyebrow="Operator Workspace" className="terminal-subpanel terminal-workspace-panel">
              <ErrorBoundary label={`${activeTabLabel(activeTab)} Workspace`} resetKey={`${activeTab}-${selectedSymbol}-${selectedTradeId ?? "none"}-${selectedTicketId ?? "none"}`}>
                <Suspense fallback={<LazyTabFallback label={activeTabLabel(activeTab)} />}>
                  {renderTabContent()}
                </Suspense>
              </ErrorBoundary>
            </Panel>
          </div>
        </main>

        <aside className="right-pane shell-scroll-region" data-testid="right-pane">
          <ErrorBoundary label="Context Sidebar" resetKey={`${selectedSymbol}-${selectedRiskReportId ?? "none"}`}>
            <ContextSidebar
              activeTab={activeTab}
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
              selectedAssetTruth={visibleSelectedAssetTruth}
              selectedRiskLoaded={Boolean(visibleRiskDetail)}
              selectedSignalLoaded={Boolean(visibleSignalDetail)}
            />
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
}
