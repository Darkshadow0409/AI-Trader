import {
  mockActiveTrades,
  mockAlerts,
  mockAssetContexts,
  mockBacktestDetail,
  mockBacktests,
  mockBars,
  mockDailyBriefing,
  mockHealth,
  mockHighRiskSignals,
  mockJournal,
  mockNews,
  mockOperationalBacklog,
  mockPilotDashboard,
  mockPilotMetrics,
  mockOpportunities,
  mockResearch,
  mockReviewTasks,
  mockRibbon,
  mockRisk,
  mockRiskDetail,
  mockRiskExposure,
  mockSessionOverview,
  mockExecutionGate,
  mockAdapterHealth,
  mockAuditLogs,
  mockSignalDetail,
  mockSignals,
  mockStrategyDetail,
  mockStrategies,
  mockPaperTradeAnalytics,
  mockPaperTradeDetail,
  mockPaperTradeReviews,
  mockPaperTradesActive,
  mockPaperTradesClosed,
  mockPaperTradesProposed,
  mockBrokerSnapshot,
  mockReplay,
  mockScenarioStressSummary,
  mockShadowTickets,
  mockTicketDetail,
  mockTicketList,
  mockWalletBalances,
  mockWatchlist,
} from "./mockData";
import type {
  ActiveTradeCreateRequest,
  ActiveTradeUpdateRequest,
  ActiveTradeView,
  AlertEnvelope,
  AssetContextView,
  BacktestDetailView,
  BacktestListView,
  BacktestRunRequest,
  BarView,
  DailyBriefingView,
  HealthView,
  JournalEntryCreateRequest,
  JournalEntryUpdateRequest,
  JournalReviewView,
  ManualFillCreateRequest,
  ManualFillImportRequest,
  ManualFillView,
  NewsView,
  BrokerAdapterSnapshotView,
  OperationalBacklogView,
  PilotDashboardView,
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
  ResearchView,
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
  SignalView,
  StrategyDetailView,
  StrategyListView,
  TradeTimelineView,
  TradeTicketApprovalRequest,
  TradeTicketCreateRequest,
  TradeTicketDetailView,
  TradeTicketUpdateRequest,
  TradeTicketView,
  WalletBalanceView,
  WeeklyReviewView,
  WatchlistView,
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

async function requestJson<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    });
    if (!response.ok) {
      return fallback;
    }
    if (response.status === 204) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export const apiClient = {
  health: () => requestJson<HealthView>("/health", mockHealth),
  overview: () => requestJson<RibbonView>("/dashboard/overview", mockRibbon),
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
  pilotMetrics: () => requestJson<PilotMetricSummaryView>("/session/pilot-metrics", mockPilotMetrics),
  executionGate: () => requestJson<ExecutionGateView>("/session/execution-gate", mockExecutionGate),
  pilotDashboard: () => requestJson<PilotDashboardView>("/session/pilot-dashboard", mockPilotDashboard),
  adapterHealth: () => requestJson<AdapterHealthView[]>("/session/adapter-health", mockAdapterHealth),
  auditLogs: () => requestJson<AuditLogView[]>("/session/audit-logs", mockAuditLogs),
  signals: () => requestJson<SignalView[]>("/signals", mockSignals),
  signalDetail: (signalId: string) => requestJson<SignalDetailView>(`/signals/${signalId}`, mockSignalDetail),
  highRiskSignals: () => requestJson<SignalView[]>("/signals/high-risk", mockHighRiskSignals),
  news: () => requestJson<NewsView[]>("/news", mockNews),
  watchlist: () => requestJson<WatchlistView[]>("/watchlist", mockWatchlist),
  opportunities: () => requestJson<OpportunityHunterView>("/watchlist/opportunity-hunter", mockOpportunities),
  research: () => requestJson<ResearchView[]>("/research", mockResearch),
  risk: () => requestJson<RiskView[]>("/risk/latest", mockRisk),
  riskDetail: (riskReportId: string) => requestJson<RiskDetailView>(`/risk/${riskReportId}`, mockRiskDetail),
  riskExposure: () => requestJson<RiskExposureView[]>("/risk/exposure", mockRiskExposure),
  bars: (symbol: string) => requestJson<BarView[]>(`/market/bars/${symbol}`, mockBars[symbol] ?? mockBars.BTC),
  assetContext: (symbol: string) =>
    requestJson<AssetContextView>(`/dashboard/assets/${symbol}`, mockAssetContexts[symbol] ?? mockAssetContexts.BTC),
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
