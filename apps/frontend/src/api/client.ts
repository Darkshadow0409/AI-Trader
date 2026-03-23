import {
  mockActiveTrades,
  mockAlerts,
  mockAssetContexts,
  mockBacktestDetail,
  mockBacktests,
  mockBars,
  mockDailyBriefing,
  mockDeskSummary,
  mockHomeSummary,
  mockHealth,
  mockHighRiskSignals,
  mockJournal,
  mockMarketCharts,
  mockNews,
  mockOperationalBacklog,
  mockCommandCenter,
  mockOpsSummary,
  mockPilotDashboard,
  mockPilotExportResponse,
  mockPilotMetrics,
  mockPilotSummary,
  mockOpportunities,
  mockResearch,
  mockReviewSummary,
  mockReviewTasks,
  mockRibbon,
  mockRisk,
  mockRiskDetail,
  mockRiskExposure,
  mockSessionOverview,
  mockExecutionGate,
  mockAdapterHealth,
  mockAIAdvisor,
  mockAIStatus,
  mockAuditLogs,
  mockSignalDetail,
  mockSignals,
  mockSignalsSummary,
  mockStrategyDetail,
  mockStrategies,
  mockPaperTradeAnalytics,
  mockPaperTradeDetail,
  mockPaperTradeReviews,
  mockPaperTradesActive,
  mockPaperTradesClosed,
  mockPaperTradesProposed,
  mockPolymarketHunter,
  mockBrokerSnapshot,
  mockReplay,
  mockScenarioStressSummary,
  mockShadowTickets,
  mockTicketDetail,
  mockTicketList,
  mockTicketSummary,
  mockWalletBalances,
  mockWatchlist,
  mockWatchlistSummary,
} from "./mockData";
import type {
  ActiveTradeCreateRequest,
  ActiveTradeUpdateRequest,
  ActiveTradeView,
  AIAdvisorRequest,
  AIAdvisorResponseView,
  AIProviderStatusView,
  AlertEnvelope,
  AssetContextView,
  BacktestDetailView,
  BacktestListView,
  BacktestRunRequest,
  BarView,
  MarketChartView,
  DailyBriefingView,
  DeskSummaryView,
  HomeOperatorSummaryView,
  HealthView,
  JournalEntryCreateRequest,
  JournalEntryUpdateRequest,
  JournalReviewView,
  ManualFillCreateRequest,
  ManualFillImportRequest,
  ManualFillView,
  NewsView,
  BrokerAdapterSnapshotView,
  OpsActionRequest,
  OpsActionView,
  OpsSummaryView,
  OperationalBacklogView,
  CommandCenterStatusView,
  PilotDashboardView,
  PilotExportResponse,
  PilotMetricSummaryView,
  OpportunityHunterView,
  ReplayView,
  PaperTradeAnalyticsView,
  PaperTradeCloseRequest,
  PaperTradeDetailView,
  PaperTradeOpenRequest,
  PaperTradePartialExitRequest,
  PaperTradeProposalRequest,
  PaperTradeReviewRequest,
  PaperTradeReviewView,
  PaperTradeScaleRequest,
  PaperTradeView,
  PilotSummaryView,
  PolymarketHunterView,
  PolymarketMarketView,
  ResearchView,
  ReviewSummaryView,
  ReviewTaskUpdateRequest,
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
  StrategyDetailView,
  StrategyListView,
  TradeTimelineView,
  TradeTicketApprovalRequest,
  TradeTicketCreateRequest,
  TradeTicketDetailView,
  TicketSummaryView,
  TradeTicketUpdateRequest,
  TradeTicketView,
  WalletBalanceView,
  WeeklyReviewView,
  WatchlistView,
  WatchlistSummaryView,
} from "../types/api";

const runtimeApiBase =
  typeof window !== "undefined" && typeof window.__AI_TRADER_RUNTIME__?.apiBase === "string" && window.__AI_TRADER_RUNTIME__.apiBase.trim().length > 0
    ? window.__AI_TRADER_RUNTIME__.apiBase.trim()
    : undefined;
const API_BASE = runtimeApiBase ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 120000);
const USE_MOCK_FALLBACK = import.meta.env.MODE === "test" || import.meta.env.VITE_ENABLE_MOCK_FALLBACK === "true";
const API_ORIGIN = API_BASE.replace(/\/api$/, "");
const inflightGetRequests = new Map<string, Promise<unknown>>();
const TRADER_SYMBOL_REQUESTS: Record<string, string> = {
  WTI: "USOUSD",
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
};
const MOCK_CANONICAL_SYMBOLS: Record<string, string> = {
  USOUSD: "WTI",
  XAUUSD: "GOLD",
  XAGUSD: "SILVER",
};

function requestSymbol(symbol: string): string {
  const requested = symbol.toUpperCase();
  return TRADER_SYMBOL_REQUESTS[requested] ?? requested;
}

function mockSymbol(symbol: string): string {
  const requested = symbol.toUpperCase();
  return MOCK_CANONICAL_SYMBOLS[requested] ?? requested;
}

function requestHeadersKey(headers: RequestInit["headers"]): string {
  if (headers instanceof Headers) {
    return JSON.stringify([...headers.entries()].sort());
  }
  if (Array.isArray(headers)) {
    return JSON.stringify([...headers].sort());
  }
  return JSON.stringify(headers ?? null);
}

function inflightRequestKey(path: string, init?: RequestInit): string | null {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" || init?.body !== undefined) {
    return null;
  }
  return JSON.stringify({
    url: `${API_BASE}${path}`,
    method,
    credentials: init?.credentials ?? null,
    headers: requestHeadersKey(init?.headers),
  });
}

async function requestJson<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  const requestKey = inflightRequestKey(path, init);
  if (requestKey) {
    const existing = inflightGetRequests.get(requestKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const requestPromise = (async () => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const { headers: initHeaders, ...restInit } = init ?? {};
    const response = await fetch(`${API_BASE}${path}`, {
      ...restInit,
      headers: {
        "Content-Type": "application/json",
        ...(initHeaders ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (USE_MOCK_FALLBACK) {
        return fallback;
      }
      throw new Error(`${path} returned ${response.status}`);
    }
    if (response.status === 204) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (USE_MOCK_FALLBACK) {
      return fallback;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error instanceof Error ? error : new Error(`${path} request failed`);
  } finally {
    globalThis.clearTimeout(timeout);
  }
  })();

  if (requestKey) {
    inflightGetRequests.set(requestKey, requestPromise);
    requestPromise.finally(() => {
      if (inflightGetRequests.get(requestKey) === requestPromise) {
        inflightGetRequests.delete(requestKey);
      }
    });
  }

  return requestPromise;
}

function openAiHeaders(openAiApiKey?: string | null): HeadersInit | undefined {
  return openAiApiKey ? { "x-openai-api-key": openAiApiKey } : undefined;
}

function aiCredentials(openAiApiKey?: string | null): RequestCredentials | undefined {
  return openAiApiKey ? undefined : "include";
}

export const apiClient = {
  health: () => requestJson<HealthView>("/health", mockHealth),
  aiStatus: (openAiApiKey?: string | null) =>
    requestJson<AIProviderStatusView>("/ai/status", mockAIStatus, {
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
    }),
  runAdvisor: (payload: AIAdvisorRequest, openAiApiKey?: string | null) =>
    requestJson<AIAdvisorResponseView>("/ai/advisor", mockAIAdvisor, {
      method: "POST",
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
      body: JSON.stringify(payload),
    }),
  aiOauthStartUrl: (returnTo?: string | null) =>
    `${API_ORIGIN}/ai/oauth/start?${new URLSearchParams({ return_to: returnTo ?? window.location.origin }).toString()}`,
  aiLogout: () =>
    requestJson<Record<string, unknown>>("/ai/oauth/logout", {}, {
      method: "POST",
      credentials: "include",
    }),
  overview: () => requestJson<RibbonView>("/dashboard/overview", mockRibbon),
  deskSummary: () => requestJson<DeskSummaryView>("/dashboard/desk", mockDeskSummary),
  homeSummary: () => requestJson<HomeOperatorSummaryView>("/dashboard/home-summary", mockHomeSummary),
  sessionOverview: () => requestJson<SessionOverviewView>("/session/overview", mockSessionOverview),
  reviewTasks: () => requestJson<ReviewTaskView[]>("/session/review-tasks", mockReviewTasks),
  updateReviewTask: (taskId: string, payload: ReviewTaskUpdateRequest) =>
    requestJson<ReviewTaskView>(`/session/review-tasks/${taskId}`, mockReviewTasks[0], {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  dailyBriefing: () => requestJson<DailyBriefingView>("/session/daily-briefing", mockDailyBriefing),
  weeklyReview: () => requestJson<WeeklyReviewView>("/session/weekly-review", mockSessionOverview.weekly_review),
  operationalBacklog: () => requestJson<OperationalBacklogView>("/session/operational-backlog", mockOperationalBacklog),
  reviewSummary: () => requestJson<ReviewSummaryView>("/session/review-summary", mockReviewSummary),
  pilotMetrics: () => requestJson<PilotMetricSummaryView>("/session/pilot-metrics", mockPilotMetrics),
  pilotSummary: () => requestJson<PilotSummaryView>("/session/pilot-summary", mockPilotSummary),
  executionGate: () => requestJson<ExecutionGateView>("/session/execution-gate", mockExecutionGate),
  pilotDashboard: () => requestJson<PilotDashboardView>("/session/pilot-dashboard", mockPilotDashboard),
  adapterHealth: () => requestJson<AdapterHealthView[]>("/session/adapter-health", mockAdapterHealth),
  auditLogs: () => requestJson<AuditLogView[]>("/session/audit-logs", mockAuditLogs),
  controlCenter: () => requestJson<CommandCenterStatusView>("/system/control-center", mockCommandCenter),
  opsSummary: () => requestJson<OpsSummaryView>("/system/ops-summary", mockOpsSummary),
  actionHistory: () => requestJson<OpsActionView[]>("/system/action-history", mockOpsSummary.action_history),
  runSystemAction: (actionName: string, payload: OpsActionRequest = {}) =>
    requestJson<OpsActionView>(`/system/actions/${actionName}`, mockOpsSummary.action_history[0], {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  refreshSystem: () => requestJson<Record<string, unknown>>("/system/refresh", {}, { method: "POST" }),
  triggerPilotExport: () => requestJson<PilotExportResponse>("/system/pilot-export", mockPilotExportResponse, { method: "POST" }),
  signals: () => requestJson<SignalView[]>("/signals", mockSignals),
  signalsSummary: () => requestJson<SignalsSummaryView>("/signals/summary", mockSignalsSummary),
  signalDetail: (signalId: string) => requestJson<SignalDetailView>(`/signals/${signalId}`, mockSignalDetail),
  highRiskSignals: () => requestJson<SignalView[]>("/signals/high-risk", mockHighRiskSignals),
  news: () => requestJson<NewsView[]>("/news", mockNews),
  watchlist: () => requestJson<WatchlistView[]>("/watchlist", mockWatchlist),
  watchlistSummary: () => requestJson<WatchlistSummaryView[]>("/watchlist/summary", mockWatchlistSummary),
  opportunities: () => requestJson<OpportunityHunterView>("/watchlist/opportunity-hunter", mockOpportunities),
  research: () => requestJson<ResearchView[]>("/research", mockResearch),
  polymarketHunter: (query = "", tag = "", sort = "relevance") =>
    requestJson<PolymarketHunterView>(
      `/polymarket/hunter?q=${encodeURIComponent(query)}&tag=${encodeURIComponent(tag)}&sort=${encodeURIComponent(sort)}`,
      mockPolymarketHunter,
    ),
  polymarketMarketDetail: (marketId: string) =>
    requestJson<PolymarketMarketView>(`/polymarket/markets/${marketId}`, mockPolymarketHunter.markets[0]),
  risk: () => requestJson<RiskView[]>("/risk/latest", mockRisk),
  riskDetail: (riskReportId: string) => requestJson<RiskDetailView>(`/risk/${riskReportId}`, mockRiskDetail),
  riskExposure: () => requestJson<RiskExposureView[]>("/risk/exposure", mockRiskExposure),
  bars: (symbol: string) => requestJson<BarView[]>(`/market/bars/${symbol}`, mockBars[symbol] ?? mockBars.BTC),
  marketChart: (symbol: string, timeframe = "1d") =>
    requestJson<MarketChartView>(
      `/market/chart/${requestSymbol(symbol)}?timeframe=${encodeURIComponent(timeframe)}`,
      mockMarketCharts[`${mockSymbol(symbol)}:${timeframe}`] ?? mockMarketCharts[`${mockSymbol(symbol)}:1d`],
    ),
  assetContext: (symbol: string) =>
    requestJson<AssetContextView>(
      `/dashboard/assets/${requestSymbol(symbol)}`,
      mockAssetContexts[mockSymbol(symbol)] ?? mockAssetContexts.BTC,
    ),
  activeTrades: () => requestJson<ActiveTradeView[]>("/portfolio/active-trades", mockActiveTrades),
  createActiveTrade: (payload: ActiveTradeCreateRequest) =>
    requestJson<ActiveTradeView>("/portfolio/active-trades", mockActiveTrades[0], {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateActiveTrade: (tradeId: string, payload: ActiveTradeUpdateRequest) =>
    requestJson<ActiveTradeView>(`/portfolio/active-trades/${tradeId}`, mockActiveTrades[0], {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteActiveTrade: (tradeId: string) =>
    requestJson<Record<string, never>>(`/portfolio/active-trades/${tradeId}`, {}, { method: "DELETE" }),
  walletBalance: () => requestJson<WalletBalanceView[]>("/portfolio/wallet-balance", mockWalletBalances),
  proposedPaperTrades: () => requestJson<PaperTradeView[]>("/portfolio/paper-trades/proposed", mockPaperTradesProposed),
  activePaperTrades: () => requestJson<PaperTradeView[]>("/portfolio/paper-trades/active", mockPaperTradesActive),
  closedPaperTrades: () => requestJson<PaperTradeView[]>("/portfolio/paper-trades/closed", mockPaperTradesClosed),
  paperTradeDetail: (tradeId: string) => requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}`, mockPaperTradeDetail),
  paperTradeTimeline: (tradeId: string) => requestJson<TradeTimelineView>(`/portfolio/paper-trades/${tradeId}/timeline`, mockPaperTradeDetail.timeline!),
  paperTradeScenarioStress: (tradeId: string) =>
    requestJson<ScenarioStressItemView[]>(`/portfolio/paper-trades/${tradeId}/scenario-stress`, mockPaperTradeDetail.scenario_stress),
  createProposedPaperTrade: (payload: PaperTradeProposalRequest) =>
    requestJson<PaperTradeDetailView>("/portfolio/paper-trades/proposed", mockPaperTradeDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  openPaperTrade: (tradeId: string, payload: PaperTradeOpenRequest) =>
    requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}/open`, mockPaperTradeDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  scalePaperTrade: (tradeId: string, payload: PaperTradeScaleRequest) =>
    requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}/scale`, mockPaperTradeDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  partialExitPaperTrade: (tradeId: string, payload: PaperTradePartialExitRequest) =>
    requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}/partial-exit`, mockPaperTradeDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  closePaperTrade: (tradeId: string, payload: PaperTradeCloseRequest) =>
    requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}/close`, mockPaperTradeDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  invalidatePaperTrade: (tradeId: string, note = "") =>
    requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}/invalidate?note=${encodeURIComponent(note)}`, mockPaperTradeDetail, {
      method: "POST",
    }),
  timeoutPaperTrade: (tradeId: string, note = "") =>
    requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}/timeout?note=${encodeURIComponent(note)}`, mockPaperTradeDetail, {
      method: "POST",
    }),
  cancelPaperTrade: (tradeId: string, note = "") =>
    requestJson<PaperTradeDetailView>(`/portfolio/paper-trades/${tradeId}/cancel?note=${encodeURIComponent(note)}`, mockPaperTradeDetail, {
      method: "POST",
    }),
  paperTradeReviews: () => requestJson<PaperTradeReviewView[]>("/journal/paper-trade-reviews", mockPaperTradeReviews),
  upsertPaperTradeReview: (tradeId: string, payload: PaperTradeReviewRequest) =>
    requestJson<PaperTradeReviewView>(`/journal/paper-trades/${tradeId}/review`, mockPaperTradeReviews[0], {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  paperTradeAnalytics: () => requestJson<PaperTradeAnalyticsView>("/portfolio/paper-trades/analytics", mockPaperTradeAnalytics),
  journal: () => requestJson<JournalReviewView[]>("/journal", mockJournal),
  createJournalEntry: (payload: JournalEntryCreateRequest) =>
    requestJson<JournalReviewView>("/journal", mockJournal[0], {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateJournalEntry: (journalId: string, payload: JournalEntryUpdateRequest) =>
    requestJson<JournalReviewView>(`/journal/${journalId}`, mockJournal[0], {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  alerts: () => requestJson<AlertEnvelope[]>("/alerts", mockAlerts),
  replay: (symbol: string, signalId?: string | null, tradeId?: string | null, eventWindowMinutes = 180) =>
    requestJson<ReplayView>(
      `/replay?symbol=${encodeURIComponent(symbol)}&event_window_minutes=${eventWindowMinutes}${signalId ? `&signal_id=${encodeURIComponent(signalId)}` : ""}${tradeId ? `&trade_id=${encodeURIComponent(tradeId)}` : ""}`,
      mockReplay,
    ),
  scenarioStress: (symbol?: string | null, signalId?: string | null, tradeId?: string | null) =>
    requestJson<ScenarioStressSummaryView>(
      `/replay/scenario-stress${symbol || signalId || tradeId ? "?" : ""}${symbol ? `symbol=${encodeURIComponent(symbol)}&` : ""}${signalId ? `signal_id=${encodeURIComponent(signalId)}&` : ""}${tradeId ? `trade_id=${encodeURIComponent(tradeId)}&` : ""}`.replace(/[?&]$/, ""),
      mockScenarioStressSummary,
    ),
  tradeTickets: () => requestJson<TradeTicketView[]>("/tickets", mockTicketList),
  tradeTicketSummary: () => requestJson<TicketSummaryView>("/tickets/summary", mockTicketSummary),
  tradeTicketDetail: (ticketId: string) => requestJson<TradeTicketDetailView>(`/tickets/${ticketId}`, mockTicketDetail),
  shadowModeTickets: () => requestJson<TradeTicketDetailView[]>("/tickets/shadow-mode", mockShadowTickets),
  brokerSnapshot: () => requestJson<BrokerAdapterSnapshotView>("/tickets/broker-snapshot", mockBrokerSnapshot),
  createTradeTicket: (payload: TradeTicketCreateRequest) =>
    requestJson<TradeTicketDetailView>("/tickets", mockTicketDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTradeTicket: (ticketId: string, payload: TradeTicketUpdateRequest) =>
    requestJson<TradeTicketDetailView>(`/tickets/${ticketId}`, mockTicketDetail, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  approveTradeTicket: (ticketId: string, payload: TradeTicketApprovalRequest) =>
    requestJson<TradeTicketDetailView>(`/tickets/${ticketId}/approval`, mockTicketDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  invalidateTradeTicket: (ticketId: string, note = "") =>
    requestJson<TradeTicketDetailView>(`/tickets/${ticketId}/invalidate?note=${encodeURIComponent(note)}`, mockTicketDetail, {
      method: "POST",
    }),
  expireTradeTicket: (ticketId: string, note = "") =>
    requestJson<TradeTicketDetailView>(`/tickets/${ticketId}/expire?note=${encodeURIComponent(note)}`, mockTicketDetail, {
      method: "POST",
    }),
  shadowActivateTradeTicket: (ticketId: string, note = "") =>
    requestJson<TradeTicketDetailView>(`/tickets/${ticketId}/shadow-active?note=${encodeURIComponent(note)}`, mockTicketDetail, {
      method: "POST",
    }),
  manualExecuteTradeTicket: (ticketId: string, note = "", tradeId?: string | null) =>
    requestJson<TradeTicketDetailView>(`/tickets/${ticketId}/manually-executed?note=${encodeURIComponent(note)}${tradeId ? `&trade_id=${encodeURIComponent(tradeId)}` : ""}`, mockTicketDetail, {
      method: "POST",
    }),
  createManualFill: (ticketId: string, payload: ManualFillCreateRequest) =>
    requestJson<ManualFillView>(`/tickets/${ticketId}/fills`, mockTicketDetail.manual_fills[0], {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  importManualFills: (ticketId: string, payload: ManualFillImportRequest) =>
    requestJson<ManualFillView[]>(`/tickets/${ticketId}/fills/import`, mockTicketDetail.manual_fills, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  strategies: () => requestJson<StrategyListView[]>("/strategies", mockStrategies),
  strategyDetail: (strategyName: string) =>
    requestJson<StrategyDetailView>(`/strategies/${strategyName}`, mockStrategyDetail),
  backtests: () => requestJson<BacktestListView[]>("/backtests", mockBacktests),
  backtestDetail: (runId: number) => requestJson<BacktestDetailView>(`/backtests/${runId}`, mockBacktestDetail),
  runBacktest: (payload: BacktestRunRequest) =>
    requestJson<BacktestDetailView>("/backtests/run", mockBacktestDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
