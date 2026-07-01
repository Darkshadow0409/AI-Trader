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
  mockAIBrain,
  mockAIBrainHistory,
  mockAIBrainEvidenceReview,
  mockAIBrainNotes,
  mockAIAdvisor,
  mockAIStatus,
  mockAuditLogs,
  mockAvailabilityStatus,
  mockMarketEvidenceProviders,
  mockMarketEvidenceProviderReadiness,
  mockMarketEvidenceSnapshot,
  mockSignalDetail,
  mockSignals,
  mockSignalsSummary,
  mockStrategyDetail,
  mockStrategies,
  mockPaperTradeAnalytics,
  mockPaperLedger,
  mockPaperLoopControlEvents,
  mockPaperLoopControlStatus,
  mockPaperEquityCurve,
  mockPaperPerformance,
  mockPaperRejectionAnalysis,
  mockPaperRiskDecisions,
  mockPaperRiskPolicy,
  mockPaperReviewQueue,
  mockPaperTradeDetail,
  mockPaperTradeReviews,
  mockPaperTradesActive,
  mockPaperTradesClosed,
  mockPaperTradesProposed,
  mockPaperWallet,
  mockPolymarketHunter,
  mockBrokerSnapshot,
  mockReplay,
  mockResearchRun,
  mockScenarioStressSummary,
  mockShadowTickets,
  mockTicketDetail,
  mockTicketList,
  mockTicketSummary,
  mockSimulatedOrders,
  mockWalletBalances,
  mockWatchlist,
  mockWatchlistSummary,
} from "./mockData";
import type {
  ActiveTradeCreateRequest,
  ActiveTradeUpdateRequest,
  ActiveTradeView,
  AIBrainHistoryDetailView,
  AIBrainHistoryItemView,
  AIBrainEvidenceReviewUpsertRequest,
  AIBrainEvidenceReviewView,
  AIBrainOperatorNoteCreateRequest,
  AIBrainOperatorNoteView,
  AIBrainQueryRequest,
  AIBrainResponseView,
  AIAdvisorRequest,
  AIAdvisorResponseView,
  AIAdvisorRunStatusView,
  AIProviderStatusView,
  AlertEnvelope,
  AssetContextView,
  AvailabilityStatusView,
  BacktestDetailView,
  BacktestListView,
  BacktestRunRequest,
  BarView,
  MarketChartView,
  MarketEvidenceProviderDescriptor,
  MarketEvidenceProviderReadinessView,
  MarketEvidenceSnapshot,
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
  PaperEquityCurvePointView,
  PaperLedgerTransactionView,
  PaperLoopControlActionRequest,
  PaperLoopControlEventView,
  PaperLoopControlStatusView,
  PaperPerformanceSummaryView,
  PaperRejectionAnalysisItemView,
  PaperRiskDecisionView,
  PaperRiskPolicyView,
  PaperReviewQueueItemView,
  PaperTradeCloseRequest,
  PaperTradeDetailView,
  PaperTradeOpenRequest,
  PaperTradePartialExitRequest,
  PaperTradeProposalRequest,
  PaperTradeReviewRequest,
  PaperTradeReviewView,
  PaperTradeScaleRequest,
  PaperTradeView,
  PaperWalletView,
  PilotSummaryView,
  PolymarketHunterView,
  PolymarketMarketView,
  ResearchRunCreateRequest,
  ResearchRunStatusView,
  ResearchRunView,
  ResearchView,
  ReviewSummaryView,
  ReviewTaskUpdateRequest,
  ReviewTaskView,
  RibbonView,
  RiskDetailView,
  RiskExposureView,
  RiskView,
  ScenarioResearchView,
  ScenarioStressItemView,
  ScenarioStressSummaryView,
  SelectedSignalWorkspaceView,
  SessionOverviewView,
  ExecutionGateView,
  AdapterHealthView,
  AuditLogView,
  SignalDetailView,
  SignalsSummaryView,
  SignalView,
  SimulatedOrderView,
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
  SelectedAssetTruthView,
  WatchlistSummaryView,
} from "../types/api";

const runtimeApiBase =
  typeof window !== "undefined" && typeof window.__AI_TRADER_RUNTIME__?.apiBase === "string" && window.__AI_TRADER_RUNTIME__.apiBase.trim().length > 0
    ? window.__AI_TRADER_RUNTIME__.apiBase.trim()
    : undefined;
const API_BASE = runtimeApiBase ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 120000);
const AI_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_AI_API_TIMEOUT_MS ?? 180000);
const USE_MOCK_FALLBACK = import.meta.env.MODE === "test" || import.meta.env.VITE_ENABLE_MOCK_FALLBACK === "true";
const API_ORIGIN = API_BASE.replace(/\/api$/, "");
const inflightGetRequests = new Map<string, Promise<unknown>>();

export function resetApiClientInflightRequestsForTests(): void {
  inflightGetRequests.clear();
}

const TRADER_SYMBOL_REQUESTS: Record<string, string> = {
  WTI: "USOUSD",
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
};
const RESEARCH_CONTEXT_SYMBOLS: Record<string, string> = {
  USOUSD: "WTI_CTX",
  WTI: "WTI_CTX",
  XAUUSD: "XAU_CTX",
  GOLD: "XAU_CTX",
  XAGUSD: "XAG_CTX",
  SILVER: "XAG_CTX",
  BTC: "BTCUSD",
  ETH: "ETHUSD",
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

function degradedSelectedAssetTruth(symbol: string): SelectedAssetTruthView {
  const requested = requestSymbol(symbol);
  return {
    symbol: requested,
    trader_facing_symbol: requested,
    research_symbol_if_any: RESEARCH_CONTEXT_SYMBOLS[requested] ?? null,
    as_of: null,
    freshness_minutes: null,
    source_mode: "unknown",
    route_readiness: "warming_up",
    degraded_reason: "clean_backend_selected_asset_truth_unavailable",
    is_proxy: true,
    confidence: 0.2,
  };
}

function socketBaseUrl(): string {
  return API_ORIGIN.replace(/^http/i, "ws");
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

function selectedSignalPath(path: string): boolean {
  return /^\/signals\/[^/?]+(?:\/workspace-context(?:\?.*)?)?$/.test(path);
}

function selectedRiskPath(path: string): boolean {
  return /^\/risk\/[^/?]+(?:\?.*)?$/.test(path);
}

function friendlyRequestFailure(path: string, status: number): string {
  if (path.startsWith("/ai/")) {
    return `${path} returned ${status}`;
  }
  if (path.startsWith("/dashboard/desk")) {
    return "Desk summary is still refreshing on the backend.";
  }
  if (path.startsWith("/dashboard/home-summary")) {
    return "Home summary is still refreshing on the backend.";
  }
  if (path.startsWith("/watchlist/opportunity-hunter")) {
    return "Opportunity hunter is still refreshing on the backend.";
  }
  if (path.startsWith("/dashboard/assets/")) {
    return status === 404
      ? "Selected asset context is no longer available. Reload the current asset."
      : "Selected asset context is still refreshing on the backend.";
  }
  if (selectedSignalPath(path)) {
    return status === 404
      ? "Selected signal context is no longer available. Reload the latest setup."
      : "Selected signal context is still refreshing on the backend.";
  }
  if (selectedRiskPath(path)) {
    return status === 404
      ? "Selected risk context is no longer available. Reload the latest risk frame."
      : "Selected risk context is still refreshing on the backend.";
  }
  if (path.startsWith("/signals/summary")) {
    return "Signal summary is still refreshing on the backend.";
  }
  if (path === "/signals") {
    return "Signals are still refreshing on the backend.";
  }
  if (path === "/risk/latest") {
    return "Risk snapshot is still refreshing on the backend.";
  }
  if (path.startsWith("/scenario/")) {
    return "Scenario sidecar is unavailable right now.";
  }
  return `${path} returned ${status}`;
}

function requestTimeoutMs(path: string, init?: RequestInit): number {
  const method = (init?.method ?? "GET").toUpperCase();
  if (path.startsWith("/ai/")) {
    return AI_REQUEST_TIMEOUT_MS;
  }
  if (path === "/research/runs" && method === "POST") {
    return AI_REQUEST_TIMEOUT_MS;
  }
  if (path === "/research/runs/async" && method === "POST") {
    return AI_REQUEST_TIMEOUT_MS;
  }
  return REQUEST_TIMEOUT_MS;
}

function friendlyRequestTimeout(path: string, timeoutMs: number): string {
  if (path.startsWith("/ai/")) {
    return `${path} timed out after ${timeoutMs / 1000}s`;
  }
  if (path.startsWith("/dashboard/desk")) {
    return "Desk summary timed out while the backend was busy. Keeping the last usable desk snapshot.";
  }
  if (path.startsWith("/dashboard/home-summary")) {
    return "Home summary timed out while the backend was busy. Keeping the last usable summary.";
  }
  if (path.startsWith("/watchlist/opportunity-hunter")) {
    return "Opportunity hunter timed out while the backend was busy. Keeping the last usable queue.";
  }
  if (path.startsWith("/dashboard/assets/")) {
    return "Selected asset context timed out while the backend was busy. Keeping the last usable context.";
  }
  if (selectedSignalPath(path)) {
    return "Selected signal context timed out while the backend was busy. Keeping the last usable setup.";
  }
  if (selectedRiskPath(path)) {
    return "Selected risk context timed out while the backend was busy. Keeping the last usable risk frame.";
  }
  if (path.startsWith("/scenario/")) {
    return "Scenario sidecar timed out. Keeping deterministic desk context only.";
  }
  return `${path} timed out after ${timeoutMs / 1000}s`;
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
  const timeoutMs = requestTimeoutMs(path, init);
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
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
      throw new Error(friendlyRequestFailure(path, response.status));
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
      throw new Error(friendlyRequestTimeout(path, timeoutMs));
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
  availabilityStatus: () => requestJson<AvailabilityStatusView>("/availability/status", mockAvailabilityStatus),
  marketEvidenceProviders: () =>
    requestJson<MarketEvidenceProviderDescriptor[]>("/market-evidence/providers", mockMarketEvidenceProviders),
  marketEvidenceProviderReadiness: () =>
    requestJson<MarketEvidenceProviderReadinessView[]>("/market-evidence/provider-readiness", mockMarketEvidenceProviderReadiness),
  marketEvidenceSnapshot: (symbol: string, timeframe = "1d") =>
    requestJson<MarketEvidenceSnapshot>(
      `/market-evidence/snapshot?${new URLSearchParams({ symbol, timeframe }).toString()}`,
      mockMarketEvidenceSnapshot,
    ),
  aiBrainQuery: (payload: AIBrainQueryRequest) =>
    requestJson<AIBrainResponseView>("/ai-brain/query", mockAIBrain, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  aiBrainHistory: () => requestJson<AIBrainHistoryItemView[]>("/ai-brain/history", mockAIBrainHistory),
  aiBrainHistoryDetail: (auditId: string) =>
    requestJson<AIBrainHistoryDetailView>(`/ai-brain/history/${auditId}`, {
      ...mockAIBrainHistory[0],
      evidence_snapshot: { cards: mockAIBrain.evidence_cards },
      market_evidence_snapshot: {
        provider: mockAIBrain.market_evidence_provider,
        snapshot: mockAIBrain.market_evidence,
      },
      provider_readiness_snapshot: mockMarketEvidenceProviderReadiness as unknown as Record<string, unknown>[],
      evidence_review: mockAIBrainEvidenceReview,
      availability_snapshot: mockAvailabilityStatus as unknown as Record<string, unknown>,
      wallet_snapshot: {},
      risk_snapshot: {},
      performance_snapshot: {},
      review_snapshot: {},
      uncertainty_notes: mockAIBrain.uncertainty_notes,
      degraded_notes: [],
      source_route: "/api/ai-brain/query",
      operator_label: null,
    }),
  aiBrainHistoryNotes: (auditId: string) =>
    requestJson<AIBrainOperatorNoteView[]>(`/ai-brain/history/${auditId}/notes`, mockAIBrainNotes),
  aiBrainEvidenceReview: (auditId: string) =>
    requestJson<AIBrainEvidenceReviewView>(`/ai-brain/history/${auditId}/evidence-review`, mockAIBrainEvidenceReview),
  saveAIBrainEvidenceReview: (auditId: string, payload: AIBrainEvidenceReviewUpsertRequest) =>
    requestJson<AIBrainEvidenceReviewView>(`/ai-brain/history/${auditId}/evidence-review`, mockAIBrainEvidenceReview, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createAIBrainHistoryNote: (auditId: string, payload: AIBrainOperatorNoteCreateRequest) =>
    requestJson<AIBrainOperatorNoteView>(`/ai-brain/history/${auditId}/notes`, mockAIBrainNotes[0], {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  aiStatus: (provider?: string | null, model?: string | null, openAiApiKey?: string | null) =>
    requestJson<AIProviderStatusView>(
      `/ai/status${
        provider || model
          ? `?${new URLSearchParams(
              Object.entries({ provider: provider ?? "", model: model ?? "" }).filter(([, value]) => value),
            ).toString()}`
          : ""
      }`,
      mockAIStatus,
      {
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
      },
    ),
  runAdvisor: (payload: AIAdvisorRequest, openAiApiKey?: string | null) =>
    requestJson<AIAdvisorResponseView>("/ai/advisor", mockAIAdvisor, {
      method: "POST",
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
      body: JSON.stringify(payload),
    }),
  startAdvisorRun: (payload: AIAdvisorRequest, openAiApiKey?: string | null) =>
    requestJson<AIAdvisorRunStatusView>("/ai/advisor/runs", {
      run_id: "mock-advisor-run",
      provider: payload.provider ?? mockAIStatus.provider,
      selected_model: payload.model ?? mockAIStatus.selected_model,
      answer_source: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued local advisory run.",
      validation_summary_note: null,
      error_message: null,
      created_at: mockAIAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockAIAdvisor.generated_at,
      stage_history: [],
      response: null,
    }, {
      method: "POST",
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
      body: JSON.stringify(payload),
    }),
  retryAdvisorRun: (runId: string, openAiApiKey?: string | null) =>
    requestJson<AIAdvisorRunStatusView>(`/ai/advisor/runs/${runId}/retry`, {
      run_id: `retry-${runId}`,
      provider: mockAIAdvisor.provider_status.provider,
      selected_model: mockAIAdvisor.provider_status.selected_model,
      answer_source: null,
      retry_of_run_id: runId,
      restart_family_id: runId,
      run_mode: mockAIAdvisor.run_mode ?? "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued retry advisory run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: mockAIAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    }, {
      method: "POST",
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
    }),
  advisorRunStatus: (runId: string) =>
    requestJson<AIAdvisorRunStatusView>(`/ai/advisor/runs/${runId}`, {
      run_id: runId,
      provider: mockAIAdvisor.provider_status.provider,
      selected_model: mockAIAdvisor.provider_status.selected_model,
      answer_source: mockAIAdvisor.answer_source,
      run_mode: mockAIAdvisor.run_mode ?? "desk_fast",
      run_stage: mockAIAdvisor.run_stage ?? "complete",
      latency_ms: mockAIAdvisor.latency_ms ?? null,
      status_note: mockAIAdvisor.status_note ?? null,
      validation_summary_note: mockAIAdvisor.validation_summary_note ?? null,
      error_message: null,
      created_at: mockAIAdvisor.generated_at,
      started_at: mockAIAdvisor.research_run.started_at ?? null,
      completed_at: mockAIAdvisor.research_run.completed_at ?? null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: mockAIAdvisor.stage_history ?? [],
      response: mockAIAdvisor,
    }),
  aiOauthStartUrl: (returnTo?: string | null) =>
    `${API_ORIGIN}/ai/oauth/start?${new URLSearchParams({ return_to: returnTo ?? window.location.origin }).toString()}`,
  aiLogout: () =>
    requestJson<Record<string, unknown>>("/ai/oauth/logout", {}, {
      method: "POST",
      credentials: "include",
    }),
  overview: (symbol = "USOUSD") => requestJson<RibbonView>(`/dashboard/overview?symbol=${encodeURIComponent(requestSymbol(symbol))}`, mockRibbon),
  deskSummary: () => requestJson<DeskSummaryView>("/dashboard/desk", mockDeskSummary),
  homeSummary: () => requestJson<HomeOperatorSummaryView>("/dashboard/home-summary", mockHomeSummary),
  sessionOverview: () => requestJson<SessionOverviewView>("/session/overview", mockSessionOverview),
  reviewTasks: (includeResolved = false) =>
    requestJson<ReviewTaskView[]>(
      `/session/review-tasks${includeResolved ? "?include_resolved=true" : ""}`,
      mockReviewTasks,
    ),
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
  selectedSignalWorkspace: (_signalId: string, _timeframe = "1d") => Promise.resolve<SelectedSignalWorkspaceView | null>(null),
  scenario: (_symbol: string, _timeframe = "1d") => Promise.resolve<ScenarioResearchView | null>(null),
  highRiskSignals: () => requestJson<SignalView[]>("/signals/high-risk", mockHighRiskSignals),
  news: () => requestJson<NewsView[]>("/news", mockNews),
  watchlist: () => requestJson<WatchlistView[]>("/watchlist", mockWatchlist),
  watchlistSummary: () => requestJson<WatchlistSummaryView[]>("/watchlist/summary", mockWatchlistSummary),
  opportunities: () => requestJson<OpportunityHunterView>("/watchlist/opportunity-hunter", mockOpportunities),
  research: () => requestJson<ResearchView[]>("/research", mockResearch),
  researchRuns: (_limit = 12) => Promise.resolve<ResearchRunView[]>([]),
  researchRun: (runId: string) => requestJson<ResearchRunView>(`/research/runs/${runId}`, mockResearchRun),
  createResearchRun: (payload: ResearchRunCreateRequest, openAiApiKey?: string | null) =>
    requestJson<ResearchRunView>("/research/runs", mockResearchRun, {
      method: "POST",
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
      body: JSON.stringify(payload),
    }),
  startResearchRunAsync: (payload: ResearchRunCreateRequest, openAiApiKey?: string | null) =>
    requestJson<ResearchRunStatusView>("/research/runs/async", {
      run_id: mockResearchRun.run_id,
      mode: payload.mode ?? "research",
      provider: payload.provider ?? mockResearchRun.provider,
      selected_model: payload.model ?? mockResearchRun.selected_model,
      answer_source: null,
      run_mode: "research_full",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued research run.",
      validation_summary_note: null,
      error_message: null,
      created_at: mockResearchRun.created_at,
      started_at: null,
      completed_at: null,
      updated_at: mockResearchRun.updated_at,
      stage_history: [],
      research_run: null,
    }, {
      method: "POST",
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
      body: JSON.stringify(payload),
    }),
  retryResearchRun: (runId: string, openAiApiKey?: string | null) =>
    requestJson<ResearchRunStatusView>(`/research/runs/${runId}/retry`, {
      run_id: `retry-${runId}`,
      mode: mockResearchRun.mode,
      provider: mockResearchRun.provider,
      selected_model: mockResearchRun.selected_model,
      answer_source: null,
      retry_of_run_id: runId,
      restart_family_id: runId,
      run_mode: "research_full",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued retry research run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: mockResearchRun.created_at,
      started_at: null,
      completed_at: null,
      updated_at: mockResearchRun.updated_at,
      stage_history: [],
      research_run: null,
    }, {
      method: "POST",
      headers: openAiHeaders(openAiApiKey),
      credentials: aiCredentials(openAiApiKey),
    }),
  researchRunStatus: (runId: string) =>
    requestJson<ResearchRunStatusView>(`/research/runs/${runId}/status`, {
      run_id: runId,
      mode: mockResearchRun.mode,
      provider: mockResearchRun.provider,
      selected_model: mockResearchRun.selected_model,
      answer_source: mockResearchRun.answer_source,
      run_mode: mockResearchRun.run_mode ?? "research_full",
      run_stage: mockResearchRun.run_stage ?? "complete",
      latency_ms: mockResearchRun.latency_ms ?? null,
      status_note: mockResearchRun.status_note ?? null,
      validation_summary_note: mockResearchRun.validation_summary_note ?? null,
      error_message: mockResearchRun.error_message ?? null,
      created_at: mockResearchRun.created_at,
      started_at: mockResearchRun.started_at ?? null,
      completed_at: mockResearchRun.completed_at ?? null,
      updated_at: mockResearchRun.updated_at,
      stage_history: mockResearchRun.stage_history ?? [],
      research_run: mockResearchRun,
    }),
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
  marketChart: (
    symbol: string,
    timeframe = "1d",
    options?: {
      requestInit?: RequestInit;
      resyncNonce?: string;
    },
  ) =>
    requestJson<MarketChartView>(
      `/market/chart/${requestSymbol(symbol)}?timeframe=${encodeURIComponent(timeframe)}${options?.resyncNonce ? `&resync_nonce=${encodeURIComponent(options.resyncNonce)}` : ""}`,
      mockMarketCharts[`${mockSymbol(symbol)}:${timeframe}`] ?? mockMarketCharts[`${mockSymbol(symbol)}:1d`],
      options?.requestInit,
    ),
  assetContext: (symbol: string) =>
    requestJson<AssetContextView>(
      `/dashboard/assets/${requestSymbol(symbol)}`,
      mockAssetContexts[mockSymbol(symbol)] ?? mockAssetContexts.BTC,
    ),
  selectedAssetTruth: (symbol: string) => Promise.resolve<SelectedAssetTruthView>(degradedSelectedAssetTruth(symbol)),
  updatesSocketUrl: () => `${socketBaseUrl()}/ws/updates`,
  selectedAssetTruthSocketUrl: () => `${socketBaseUrl()}/ws/updates`,
  marketChartSocketUrl: () => `${socketBaseUrl()}/ws/updates`,
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
  paperWallet: () => requestJson<PaperWalletView>("/portfolio/paper-wallet", mockPaperWallet),
  paperLedger: () => requestJson<PaperLedgerTransactionView[]>("/portfolio/paper-ledger", mockPaperLedger),
  paperRiskPolicy: () => requestJson<PaperRiskPolicyView>("/portfolio/paper-risk-policy", mockPaperRiskPolicy),
  paperRiskDecisions: () =>
    requestJson<PaperRiskDecisionView[]>("/portfolio/paper-risk-decisions", mockPaperRiskDecisions),
  paperPerformance: () => requestJson<PaperPerformanceSummaryView>("/portfolio/paper-performance", mockPaperPerformance),
  paperEquityCurve: () => requestJson<PaperEquityCurvePointView[]>("/portfolio/paper-equity-curve", mockPaperEquityCurve),
  paperRejectionAnalysis: () =>
    requestJson<PaperRejectionAnalysisItemView[]>("/portfolio/paper-rejection-analysis", mockPaperRejectionAnalysis),
  paperReviewQueue: () => requestJson<PaperReviewQueueItemView[]>("/portfolio/paper-review-queue", mockPaperReviewQueue),
  paperLoopStatus: () => requestJson<PaperLoopControlStatusView>("/portfolio/paper-loop/status", mockPaperLoopControlStatus),
  paperLoopEvents: () => requestJson<PaperLoopControlEventView[]>("/portfolio/paper-loop/events", mockPaperLoopControlEvents),
  enablePaperLoopControl: (payload: PaperLoopControlActionRequest) =>
    requestJson<PaperLoopControlStatusView>("/portfolio/paper-loop/enable", mockPaperLoopControlStatus, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  disablePaperLoopControl: (payload: PaperLoopControlActionRequest) =>
    requestJson<PaperLoopControlStatusView>("/portfolio/paper-loop/disable", mockPaperLoopControlStatus, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  pausePaperLoopControl: (payload: PaperLoopControlActionRequest) =>
    requestJson<PaperLoopControlStatusView>("/portfolio/paper-loop/pause", { ...mockPaperLoopControlStatus, status: "paused" }, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  resumePaperLoopControl: (payload: PaperLoopControlActionRequest) =>
    requestJson<PaperLoopControlStatusView>("/portfolio/paper-loop/resume", { ...mockPaperLoopControlStatus, status: "enabled" }, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  killPaperLoopControl: (payload: PaperLoopControlActionRequest) =>
    requestJson<PaperLoopControlStatusView>("/portfolio/paper-loop/kill", { ...mockPaperLoopControlStatus, status: "killed" }, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  simulatedOrders: () => requestJson<SimulatedOrderView[]>("/portfolio/simulated-orders", mockSimulatedOrders),
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
