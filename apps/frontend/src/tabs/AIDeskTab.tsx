import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { RunLifecycleCard } from "../components/RunLifecycleCard";
import {
  selectedAssetTruthFallbackLabel,
  selectedAssetTruthFreshnessLabel,
  selectedAssetTruthSourceFamilyLabel,
} from "../lib/selectedAssetTruth";
import { aiAnswerSourceLabel, aiAuthModeLabel, aiProviderLabel, aiProviderStatusLabel, aiRunModeLabel, aiRunStageLabel, chartStateLabel, commodityTruthIsReadyCurrent, commodityTruthStateLabel, commodityTruthSummaryLabel, durationLabel, marketFreshnessLabel, recentRunStageTrailLabel, researchConfidenceLabel, researchValidationLabel, scenarioSourceStatusLabel, titleCase } from "../lib/uiLabels";
import { formatDateTimeIST } from "../lib/time";
import { ResearchRunPanel } from "../components/ResearchRunPanel";
import { WorkspaceJumpRow } from "../components/WorkspaceJumpRow";
import { assetWorkspaceTarget, riskContextTarget, signalContextTarget, type WorkspaceRouteState, type WorkspaceTarget } from "../lib/workspaceNavigation";
import type {
  AIAdvisorResponseView,
  AIAdvisorRunStatusView,
  AIDeskContextSnapshotView,
  AIProviderStatusView,
  AssetContextView,
  MarketChartView,
  PaperTradeDetailView,
  RiskDetailView,
  SelectedAssetTruthView,
  ScenarioResearchView,
  SignalDetailView,
  SignalView,
  WatchlistSummaryView,
} from "../types/api";

interface AIDeskTabProps {
  activeTab: string;
  assetContext: AssetContextView;
  assetLabel: string;
  chart: MarketChartView;
  deskSectionNotes: Record<string, string>;
  focusedRiskReportId?: string | null;
  focusedSignalId?: string | null;
  onAIModelChange?: (model: string | null) => void;
  onAIProviderChange?: (provider: string) => void;
  onNavigate: (tab: string) => void;
  onNavigateWorkspaceTarget?: (target: WorkspaceTarget) => void;
  onProposePaperTrade?: () => void;
  riskDetail: RiskDetailView | null;
  scenario: ScenarioResearchView | null;
  selectedAIModel?: string | null;
  selectedAIProvider?: string;
  selectedAssetTruth?: SelectedAssetTruthView | null;
  selectedRiskReportId: string | null;
  selectedSignalId: string | null;
  selectedSymbol: string;
  selectedTradeId?: string | null;
  signalDetail: SignalDetailView | null;
  signals: SignalView[];
  timeframe: string;
  tradeDetail: PaperTradeDetailView | null;
  watchlist: WatchlistSummaryView[];
  workspaceBaseState?: WorkspaceRouteState;
}

const emptyStatus: AIProviderStatusView = {
  provider: "local",
  auth_mode: "none",
  status: "ready",
  connected: false,
  available_providers: ["local", "ollama", "openai"],
  oauth_enabled: false,
  oauth_connect_url: null,
  oauth_callback_url: null,
  connected_account: null,
  default_model: "deterministic_brief",
  selected_model: "deterministic_brief",
  available_models: ["deterministic_brief"],
  guidance: "Deterministic local advisory is ready.",
  warning: null,
  session_expires_at: null,
};

const workspaceLabels: Record<string, string> = {
  desk: "Desk",
  signals: "Signals",
  high_risk: "High Risk",
  watchlist: "Watchlist",
  trade_tickets: "Tickets",
  active_trades: "Trades",
  journal: "Journal",
  session: "Review Queue",
  strategy_lab: "Strategy",
  backtests: "Backtests",
  replay: "Replay",
  pilot_ops: "Pilot Ops",
  risk: "Risk",
  research: "Research",
  news: "News",
  polymarket: "Polymarket",
  ai_desk: "AI Desk",
  wallet_balance: "Wallet",
};

interface StoredAIDeskThread {
  question: string;
  response: AIAdvisorResponseView | null;
}

const ADVISOR_BASE_POLL_MS = 700;
const ADVISOR_RUNNING_POLL_MS = 350;
const ADVISOR_VALIDATING_POLL_MS = 180;
const ADVISOR_COMPLETION_VISIBILITY_MS = 4500;

function advisorPollDelayMs(runStage: string | null | undefined): number {
  switch (runStage) {
    case "running_model":
    case "model_inference":
      return ADVISOR_RUNNING_POLL_MS;
    case "validating_output":
    case "finalizing":
      return ADVISOR_VALIDATING_POLL_MS;
    default:
      return ADVISOR_BASE_POLL_MS;
  }
}

function advisorRunClockAnchorMs(status: AIAdvisorRunStatusView): number {
  const anchor = status.started_at ?? status.created_at;
  const parsed = Date.parse(anchor);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function aiDeskThreadKey(symbol: string, signalId: string | null, riskReportId: string | null, tradeId: string | null): string {
  return `ai-trader:ai-desk:${symbol}:${signalId ?? "none"}:${riskReportId ?? "none"}:${tradeId ?? "none"}`;
}

interface AIViewState {
  status: AIProviderStatusView;
  response: AIAdvisorResponseView | null;
  loading: boolean;
  error: string | null;
}

function friendlyAiError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("Failed to fetch")) {
    return "AI Desk cannot reach the local backend right now. Refresh the local stack and try again.";
  }
  if (message.includes("/ai/status returned 404")) {
    return "AI settings are unavailable on the current backend. Refresh the local stack and try again.";
  }
  if (message.includes("/ai/status returned 503")) {
    return "OpenAI OAuth is not configured on this backend yet. Add the OAuth env vars, then reload this page.";
  }
  if (message.includes("/ai/advisor returned 404")) {
    return "The advisory service is unavailable on this backend right now. Refresh the local stack and retry.";
  }
  if (message.includes("/ai/advisor returned 422")) {
    return "The advisory request was rejected. Check the current desk context and retry after the backend finishes loading.";
  }
  if (message.includes("/ai/advisor returned 401") || message.includes("/ai/advisor returned 403")) {
    return "OpenAI auth is missing or expired for this advisory run. Reconnect and try again.";
  }
  if (message.includes("/ai/advisor returned 503")) {
    return "OpenAI OAuth is not configured on this backend yet. Add the OAuth env vars, then retry.";
  }
  if (message.includes("timed out")) {
    return "The AI request timed out while the local stack was busy. Retry after the desk finishes loading.";
  }
  return message;
}

function contextLeadSignal(selectedSymbol: string, rows: SignalView[]): SignalView | null {
  return rows.find((row) => row.symbol === selectedSymbol) ?? null;
}

function dataModeLabel(mode: string): string {
  return {
    fixture: "Fixture data",
    public_live: "Public live data",
    broker_live: "Broker live data",
  }[mode] ?? mode.replace(/_/g, " ");
}

function feedSourceLabel(sourceMode: string): string {
  return {
    live: "Live-capable source family",
    sample: "Sample source family",
    fixture: "Fixture source family",
  }[sourceMode] ?? sourceMode.replace(/_/g, " ");
}

function workspaceLabel(tab: string): string {
  return workspaceLabels[tab] ?? tab.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function localSnapshot(
  activeTab: string,
  assetContext: AssetContextView,
  assetLabel: string,
  chart: MarketChartView,
  selectedAssetTruth: SelectedAssetTruthView | null,
  leadSignal: SignalView | null,
  riskDetail: RiskDetailView | null,
  signalDetail: SignalDetailView | null,
  tradeDetail: PaperTradeDetailView | null,
  watchlist: WatchlistSummaryView[],
): AIDeskContextSnapshotView {
  const freshnessMinutes = chart.freshness_minutes;
  const freshnessState = chart.freshness_state ?? "unknown";
  const chartState = chartStateLabel(chart.status ?? assetContext.data_reality?.execution_suitability ?? "unknown");
  const signalFocus = signalDetail
    ? `${displayAssetSymbol(signalDetail)} ${signalDetail.signal_type} · score ${signalDetail.score.toFixed(1)} · ${Math.round(signalDetail.confidence * 100)}% confidence`
    : leadSignal
      ? `${displayAssetSymbol(leadSignal)} ${leadSignal.signal_type} · score ${leadSignal.score.toFixed(1)} · ${Math.round(leadSignal.confidence * 100)}% confidence`
      : null;
  const riskFocus = riskDetail
    ? `${displayAssetSymbol(riskDetail)} stop ${riskDetail.stop_price.toFixed(2)} · size ${riskDetail.size_band} · max risk ${riskDetail.max_portfolio_risk_pct.toFixed(3)}%`
    : assetContext.latest_risk
      ? `${displayAssetSymbol(assetContext.latest_risk)} stop ${assetContext.latest_risk.stop_price.toFixed(2)} · size ${assetContext.latest_risk.size_band}`
      : null;
  const tradeFocus = tradeDetail
    ? `${displayAssetSymbol(tradeDetail)} ${tradeDetail.status.replace(/_/g, " ")} · ${tradeDetail.linked_signal?.signal_type ?? "manual"} · ${tradeDetail.linked_risk ? `stop ${tradeDetail.linked_risk.stop_price.toFixed(2)}` : "risk frame not linked"}`
    : null;
  return {
    selected_instrument: assetLabel,
    active_workspace: workspaceLabel(activeTab),
    timeframe: chart.timeframe,
    market_freshness: `${selectedAssetTruthFreshnessLabel(selectedAssetTruth)} / chart ${chartState} / ${marketFreshnessLabel(freshnessMinutes, freshnessState)}`,
    data_mode_label: dataModeLabel(chart.market_data_mode),
    feed_source_label: `${selectedAssetTruthSourceFamilyLabel(selectedAssetTruth)} / ${selectedAssetTruthFallbackLabel(selectedAssetTruth)}`,
    truth_note:
      selectedAssetTruth?.degraded_reason
      ?? chart.status_note
      ?? assetContext.data_reality?.ui_warning
      ?? assetContext.data_reality?.tradable_alignment_note
      ?? "Current desk truth is still bounded by local feed availability and freshness.",
    selected_asset_truth: selectedAssetTruth,
    signal_focus: signalFocus,
    risk_focus: riskFocus,
    trade_focus: tradeFocus,
    watchlist_board: watchlist.slice(0, 5).map((row) => row.instrument_mapping.trader_symbol),
    catalyst_headlines: assetContext.related_news?.slice(0, 3).map((row) => row.title) ?? [],
    crowd_markets: assetContext.related_polymarket_markets?.slice(0, 3).map((row) => row.question) ?? [],
  };
}

function providerStatusMessage(status: AIProviderStatusView): string | null {
  if (status.provider === "local") {
    return status.warning ?? null;
  }
  if (status.provider === "ollama") {
    return status.warning ?? status.guidance;
  }
  if (status.connected) {
    return status.warning ?? null;
  }
  switch (status.status) {
    case "oauth_not_configured":
      return "OpenAI connection is not configured on this backend. AI Desk will keep using the local structured brief until OAuth credentials are added.";
    case "session_expired":
      return "Your OpenAI session expired or was revoked. Reconnect to continue authenticated advisory runs.";
    case "auth_unavailable":
      return "OpenAI could not refresh the saved session right now. Reconnect or keep using the local structured brief.";
    case "auth_required":
      return "Connect with OpenAI if you want an authenticated advisory run. The local terminal brief stays available without it.";
    default:
      return status.warning ?? null;
  }
}

function connectionLabel(status: AIProviderStatusView): string {
  if (status.connected) {
    return status.provider === "openai" ? "Connected" : aiProviderStatusLabel(status.status, status.provider);
  }
  return aiProviderStatusLabel(status.status, status.provider);
}

interface LocalBriefPreview {
  marketRead: string;
  whyNow: string;
  keyLevels: string[];
  catalysts: string[];
  invalidation: string;
  riskFrame: string[];
  relatedAssets: string[];
  nextActions: string[];
}

type SymbolBackedRow = {
  symbol: string;
  display_symbol?: string | null;
  data_reality?: { provenance?: { tradable_symbol?: string | null } | null } | null;
};

function displayAssetSymbol(row: SymbolBackedRow | null | undefined): string {
  return row?.display_symbol ?? row?.data_reality?.provenance?.tradable_symbol ?? row?.symbol ?? "n/a";
}

function localBriefPreview(
  snapshot: AIDeskContextSnapshotView,
  chart: MarketChartView,
  signalDetail: SignalDetailView | null,
  leadSignal: SignalView | null,
  riskDetail: RiskDetailView | null,
  assetContext: AssetContextView,
  tradeDetail: PaperTradeDetailView | null,
): LocalBriefPreview {
  const signal = signalDetail ?? leadSignal;
  const latestBar = chart.bars[chart.bars.length - 1] ?? null;
  const latestPrice = latestBar?.close ?? null;
  const currentPriceLabel = latestPrice !== null ? latestPrice.toFixed(2) : "n/a";
  const signalDirection = signal?.direction ? titleCase(signal.direction) : "Neutral";
  const signalFamily = signal?.signal_type ? titleCase(signal.signal_type) : "desk context";
  const keyLevels: string[] = [];
  if (latestPrice !== null) {
    keyLevels.push(`Latest visible ${chart.timeframe} price is ${currentPriceLabel} on ${snapshot.selected_instrument}.`);
  }
  if (signal?.invalidation !== null && signal?.invalidation !== undefined) {
    keyLevels.push(`Signal invalidation sits near ${signal.invalidation.toFixed(2)} and should stay intact before treating the move as actionable.`);
  }
  if (signal?.targets?.base !== undefined) {
    keyLevels.push(`Base target sits near ${signal.targets.base.toFixed(2)}${signal.targets.stretch !== undefined ? ` with stretch near ${signal.targets.stretch.toFixed(2)}` : ""}.`);
  }
  if (!keyLevels.length) {
    keyLevels.push(`Latest visible ${chart.timeframe} price is ${currentPriceLabel} with chart state carried as ${snapshot.market_freshness}.`);
  }

  const catalystLead = snapshot.catalyst_headlines[0];
  const catalysts = snapshot.catalyst_headlines.length
    ? snapshot.catalyst_headlines.map((item) => item)
    : assetContext.crowd_implied_narrative
      ? [`Crowd narrative in scope: ${assetContext.crowd_implied_narrative}`]
      : ["No fresh catalyst row is attached to this desk state. Lean more on chart truth, signal age, and explicit freshness limits."];

  const riskFrame = riskDetail
    ? [
        `Risk frame points to ${displayAssetSymbol(riskDetail)} stop ${riskDetail.stop_price.toFixed(2)} with ${riskDetail.size_band} size and max portfolio risk ${riskDetail.max_portfolio_risk_pct.toFixed(3)}%.`,
        `Cluster ${riskDetail.exposure_cluster} is marked ${riskDetail.freshness_status}; keep leverage aligned with the loaded risk row, not the raw signal score.`,
      ]
    : [
        snapshot.risk_focus ?? "No linked risk row is loaded. Use the manual ticket path only after opening Risk and confirming a stop framework.",
        "Without a loaded risk frame, the setup stays reviewable but not fully proposal-ready.",
      ];
  if (tradeDetail) {
    riskFrame.unshift(
      `${displayAssetSymbol(tradeDetail)} already has a ${tradeDetail.status.replace(/_/g, " ")} paper trade in scope. Keep the next action focused on review continuity, not a duplicate proposal.`,
    );
  }

  const relatedAssets = snapshot.crowd_markets.length
    ? snapshot.crowd_markets
    : snapshot.watchlist_board.filter((item) => item !== snapshot.selected_instrument).slice(0, 3);

  const nextActions = [
    signal ? "Review the selected setup and confirm the trigger still matches the chart." : "Open Signals or Watchlist to load a live setup before taking the next workflow step.",
    riskDetail ? "Open Risk and verify the stop distance, size band, and event lockout before proposing the trade." : "Open Risk to attach a stop and size band before proposing a paper trade.",
    catalystLead ? "Check the catalyst row and Polymarket context to confirm the narrative is still supportive." : "Refresh News or Polymarket if you need a catalyst check beyond the loaded chart context.",
    tradeDetail
      ? "Continue the existing paper-trade thread in Tickets or Trades before creating any new proposal."
      : signal
        ? "If the setup still holds, use Propose Paper Trade and move into Tickets/Trades for paper-only review."
        : "If no setup is loaded, use the manual ticket path and keep the workflow advisory-only.",
  ];

  return {
    marketRead: signal
      ? `${snapshot.selected_instrument} is carrying a ${signalDirection.toLowerCase()} ${signalFamily.toLowerCase()} bias on ${chart.timeframe}. Current market freshness reads ${snapshot.market_freshness}, and the latest visible price is ${currentPriceLabel}.`
      : `${snapshot.selected_instrument} is loaded on ${chart.timeframe} with ${snapshot.market_freshness}. No active setup is pinned yet, so treat this as chart/research context rather than an execution-ready signal.`,
    whyNow: catalystLead
      ? `${catalystLead} is the current lead catalyst while ${snapshot.truth_note}`
      : `${snapshot.truth_note} That makes current chart state and signal age more important than broad narrative assumptions.`,
    keyLevels,
    catalysts,
    invalidation: riskDetail
      ? `The current view breaks if price invalidates the attached risk frame near ${riskDetail.stop_price.toFixed(2)} or if freshness degrades enough that the chart no longer supports the loaded setup.`
      : signal?.invalidation !== undefined
        ? `The current setup loses value if price breaks the loaded signal invalidation near ${signal.invalidation.toFixed(2)} or if the chart truth slips into a degraded state.`
        : "The current view becomes weak if the chart drops into degraded or unusable truth before a clean setup is loaded.",
    riskFrame,
    relatedAssets,
    nextActions,
  };
}

export function AIDeskTab({
  activeTab,
  assetContext,
  assetLabel,
  chart,
  deskSectionNotes,
  focusedRiskReportId = null,
  focusedSignalId = null,
  onAIModelChange = () => {},
  onAIProviderChange = () => {},
  onNavigate,
  onNavigateWorkspaceTarget,
  onProposePaperTrade,
  riskDetail,
  scenario,
  selectedAIModel = null,
  selectedAIProvider = "local",
  selectedAssetTruth = null,
  selectedRiskReportId,
  selectedSignalId,
  selectedSymbol,
  selectedTradeId = null,
  signalDetail,
  signals,
  timeframe,
  tradeDetail,
  watchlist,
  workspaceBaseState,
}: AIDeskTabProps) {
  const defaultQuestion = `What matters most right now for ${assetLabel}, and what would invalidate the next commodity trade?`;
  const threadKey = useMemo(
    () => aiDeskThreadKey(selectedSymbol || assetLabel, selectedSignalId, selectedRiskReportId, selectedTradeId),
    [assetLabel, selectedRiskReportId, selectedSignalId, selectedSymbol, selectedTradeId],
  );
  const [question, setQuestion] = useState(defaultQuestion);
  const [state, setState] = useState<AIViewState>({
    status: emptyStatus,
    response: null,
    loading: false,
    error: null,
  });
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runElapsedMs, setRunElapsedMs] = useState(0);
  const [activeRun, setActiveRun] = useState<AIAdvisorRunStatusView | null>(null);
  const [recentCompletion, setRecentCompletion] = useState<AIAdvisorResponseView | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  const leadSignal = useMemo(() => contextLeadSignal(selectedSymbol, signals), [selectedSymbol, signals]);
  const snapshot = useMemo(
    () => state.response?.context_snapshot ?? localSnapshot(activeTab, assetContext, assetLabel, chart, selectedAssetTruth, leadSignal, riskDetail, signalDetail, tradeDetail, watchlist),
    [activeTab, assetContext, assetLabel, chart, leadSignal, riskDetail, selectedAssetTruth, signalDetail, state.response, tradeDetail, watchlist],
  );
  const degradedNotes = useMemo(() => Object.values(deskSectionNotes).filter((item) => item.trim().length > 0), [deskSectionNotes]);
  const localPreview = useMemo(
    () => localBriefPreview(snapshot, chart, signalDetail, leadSignal, riskDetail, assetContext, tradeDetail),
    [assetContext, chart, leadSignal, riskDetail, signalDetail, snapshot, tradeDetail],
  );
  useEffect(() => {
    if (!state.loading || runStartedAt === null) {
      setRunElapsedMs(0);
      return;
    }
    setRunElapsedMs(Math.max(Date.now() - runStartedAt, 0));
    const timer = window.setInterval(() => {
      setRunElapsedMs(Math.max(Date.now() - runStartedAt, 0));
    }, 500);
    return () => window.clearInterval(timer);
  }, [runStartedAt, state.loading]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    };
  }, []);
  const commodityTruth = chart.commodity_truth ?? assetContext.commodity_truth ?? null;
  const commodityTruthReady = commodityTruthIsReadyCurrent(commodityTruth);

  useEffect(() => {
    void loadStatus();
  }, [selectedAIModel, selectedAIProvider]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(threadKey);
      if (!stored) {
        setQuestion(defaultQuestion);
        setState((current) => ({ ...current, response: null, error: null }));
        return;
      }
      const parsed = JSON.parse(stored) as StoredAIDeskThread;
      const restoredResponse =
        parsed.response && "research_run" in parsed.response && "validation" in parsed.response
          ? parsed.response
          : null;
      setQuestion(parsed.question || defaultQuestion);
      setState((current) => ({ ...current, response: restoredResponse, error: null }));
    } catch {
      setQuestion(defaultQuestion);
      setState((current) => ({ ...current, response: null, error: null }));
    }
  }, [defaultQuestion, threadKey]);

  useEffect(() => {
    try {
      const payload: StoredAIDeskThread = {
        question,
        response: state.response,
      };
      window.sessionStorage.setItem(threadKey, JSON.stringify(payload));
    } catch {
      // Ignore session storage failures in private/locked environments.
    }
  }, [question, state.response, threadKey]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const payload = event.data as { type?: string; status?: string; message?: string } | null;
      if (!payload || payload.type !== "ai-oauth") {
        return;
      }
      if (payload.status === "error") {
        setState((current) => ({ ...current, error: payload.message ?? "OpenAI connection failed." }));
      }
      void loadStatus();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function loadStatus() {
    setState((current) => ({ ...current, error: null }));
    try {
      const status = await apiClient.aiStatus(selectedAIProvider, selectedAIModel);
      onAIProviderChange(status.provider);
      if (status.selected_model !== selectedAIModel) {
        onAIModelChange(status.selected_model);
      }
      setState((current) => ({ ...current, status }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: emptyStatus,
        error: friendlyAiError(error, "Unable to load AI provider status."),
      }));
    }
  }

  async function disconnectOpenAI() {
    setState((current) => ({ ...current, error: null }));
    try {
      await apiClient.aiLogout();
      await loadStatus();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: friendlyAiError(error, "Unable to disconnect OpenAI."),
      }));
    }
  }

  function connectOpenAI() {
    const popup = window.open(apiClient.aiOauthStartUrl(window.location.origin), "ai-trader-openai-oauth", "popup=yes,width=640,height=780");
    if (!popup) {
      setState((current) => ({
        ...current,
        error: "Browser blocked the OpenAI login popup. Allow popups for this local site and try again.",
      }));
    }
  }

  async function pollAdvisorRun(runId: string) {
    for (;;) {
      const status = await apiClient.advisorRunStatus(runId);
      setActiveRun(status);
      if (status.run_stage === "complete") {
        if (!status.response) {
          throw new Error("Advisor run completed without a final response.");
        }
        const completedResponse = status.response;
        setState((current) => ({
          ...current,
          response: completedResponse,
          status: completedResponse.provider_status,
          loading: false,
          error: null,
        }));
        if (completionTimerRef.current !== null) {
          window.clearTimeout(completionTimerRef.current);
        }
        setRecentCompletion(completedResponse);
        completionTimerRef.current = window.setTimeout(() => {
          setRecentCompletion((current) => (current?.research_run.run_id === completedResponse.research_run.run_id ? null : current));
          completionTimerRef.current = null;
        }, ADVISOR_COMPLETION_VISIBILITY_MS);
        setActiveRun(null);
        return;
      }
      if (status.run_stage === "failed") {
        setState((current) => ({
          ...current,
          loading: false,
          error: status.error_message ?? status.status_note ?? "AI advisory request failed.",
        }));
        return;
      }
      if (status.recovery_state === "stale_nonterminal") {
        setState((current) => ({
          ...current,
          loading: false,
          error: null,
        }));
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, advisorPollDelayMs(status.run_stage)));
    }
  }

  async function beginAdvisorRun(status: AIAdvisorRunStatusView, anchorMs = Date.now()) {
    setState((current) => ({ ...current, loading: true, error: null }));
    setActiveRun(status);
    setRunStartedAt(anchorMs);
    try {
      await pollAdvisorRun(status.run_id);
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: friendlyAiError(error, "AI advisory request failed."),
      }));
    } finally {
      setRunStartedAt(null);
    }
  }

  async function refreshActiveAdvisorRun() {
    if (!activeRun?.run_id) {
      return;
    }
    try {
      const status = await apiClient.advisorRunStatus(activeRun.run_id);
      setActiveRun(status);
    } catch (refreshError) {
      setState((current) => ({
        ...current,
        error: friendlyAiError(refreshError, "Advisor status refresh failed."),
      }));
    }
  }

  async function runAdvisor() {
    setState((current) => ({ ...current, loading: true, error: null }));
    setActiveRun(null);
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setRecentCompletion(null);
    try {
      const status = await apiClient.startAdvisorRun(
        {
          query: question,
          symbol: selectedSymbol,
          timeframe,
          provider: selectedAIProvider,
          model: state.status.selected_model,
          active_tab: activeTab,
          selected_signal_id: selectedSignalId ?? focusedSignalId,
          selected_risk_report_id: selectedRiskReportId ?? focusedRiskReportId,
          selected_trade_id: selectedTradeId,
        },
      );
      await beginAdvisorRun(status);
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: friendlyAiError(error, "AI advisory request failed."),
      }));
    }
  }

  async function resumeAdvisorRun() {
    if (!activeRun || ["complete", "failed"].includes(activeRun.run_stage)) {
      return;
    }
    await beginAdvisorRun(activeRun, advisorRunClockAnchorMs(activeRun));
  }

  async function retryAdvisorQuestion() {
    const runId = activeRun?.run_id ?? state.response?.research_run.run_id;
    if (!runId) {
      return;
    }
    const status = await apiClient.retryAdvisorRun(runId);
    await beginAdvisorRun(status);
  }

  const statusCardMessage = state.error ?? providerStatusMessage(state.status);
  const activeRunStage = activeRun?.run_stage ?? state.response?.run_stage ?? null;
  const completedRunStageTrail = recentRunStageTrailLabel(state.response?.stage_history, 5);
  const recentCompletionStageTrail = recentRunStageTrailLabel(recentCompletion?.stage_history, 5);
  const providerStripSourceLabel = aiAnswerSourceLabel(state.response?.answer_source, state.status.provider, state.status.connected);
  const providerConsoleStatus = connectionLabel(state.status);

  return (
    <div className="stack analyst-console-tab">
      {statusCardMessage ? (
        <article className="panel compact-panel terminal-console-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">AI Status</p>
              <h3>Connection Guidance</h3>
            </div>
            <span className="tag">{aiProviderStatusLabel(state.status.status, state.status.provider)}</span>
          </div>
          <div className="stack">
            <small>{statusCardMessage}</small>
            <small>AI Desk stays advisory-only and uses the current desk state for research, review, and paper workflow only.</small>
          </div>
        </article>
      ) : null}

      <article className="panel compact-panel hero-panel terminal-console-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Desk Brain</p>
            <h3>Analyst Console</h3>
          </div>
          <div className="inline-tags">
            <span className="tag">{snapshot.selected_instrument}</span>
            <span className="tag">{snapshot.timeframe}</span>
            <span className="tag">{snapshot.data_mode_label}</span>
            <span className="tag">{aiProviderStatusLabel(state.status.status, state.status.provider)}</span>
            <span className="tag">{providerStripSourceLabel}</span>
            <span className="tag">{chart.data_reality?.execution_grade_allowed ? "Execution-capable" : "Not execution-grade"}</span>
          </div>
        </div>
        <div className="console-strip analyst-console-strip">
          <div>
            <span className="metric-label">Provider</span>
            <strong>{aiProviderLabel(state.status.provider)}</strong>
            <small>{providerConsoleStatus}</small>
          </div>
          <div>
            <span className="metric-label">Model</span>
            <strong>{state.status.selected_model}</strong>
            <small>{aiAuthModeLabel(state.status.auth_mode)}</small>
          </div>
          <div>
            <span className="metric-label">Visible result</span>
            <strong>{providerStripSourceLabel}</strong>
            <small>{state.response ? "Current advisory response is loaded." : "Pre-run local advisory is loaded."}</small>
          </div>
          <div>
            <span className="metric-label">Truth gate</span>
            <strong>{commodityTruth ? commodityTruthStateLabel(commodityTruth) : snapshot.data_mode_label}</strong>
            <small>{chart.data_reality?.execution_grade_allowed ? "Execution-capable context available." : "Research-only or proxy-backed context."}</small>
          </div>
        </div>
        <div className="stack analyst-console-notes">
          <small>Structured Commodity Advisory keeps one console path for active run, current result, last good result, and retry lineage.</small>
          {commodityTruth && !commodityTruthReady ? <small>{commodityTruthSummaryLabel(commodityTruth)}</small> : null}
          {!commodityTruth && !chart.data_reality?.execution_grade_allowed ? <small>Current commodity truth is degraded or proxy-backed. AI Desk must stay research-only and non-execution-grade.</small> : null}
        </div>
      </article>

      <article className="panel compact-panel terminal-console-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Context In Scope</p>
            <h3>Current Desk Snapshot</h3>
          </div>
          <span className="tag">{snapshot.market_freshness}</span>
        </div>
        {commodityTruth && !commodityTruthReady ? (
          <div className="state-block">
            <strong>{commodityTruthStateLabel(commodityTruth)}</strong>
            <div>{commodityTruthSummaryLabel(commodityTruth)}</div>
          </div>
        ) : null}
        <div className="metric-grid">
          <div>
            <span className="metric-label">Selected instrument</span>
            <strong>{snapshot.selected_instrument}</strong>
            <small>{snapshot.active_workspace}</small>
          </div>
          <div>
            <span className="metric-label">Board in scope</span>
            <strong>{snapshot.watchlist_board.join(" / ") || "board context hydrating"}</strong>
            <small>Commodity-first board context is carried into every advisory run.</small>
          </div>
          <div>
            <span className="metric-label">Signal focus</span>
            <strong>{snapshot.signal_focus ?? "No signal loaded"}</strong>
            <small>AI Desk uses the selected signal when one is already in scope.</small>
          </div>
          <div>
            <span className="metric-label">Risk focus</span>
            <strong>{snapshot.risk_focus ?? "No risk frame loaded"}</strong>
            <small>Risk stays part of the brief even when the market view is partial.</small>
          </div>
          <div>
            <span className="metric-label">Trade focus</span>
            <strong>{snapshot.trade_focus ?? "No trade thread loaded"}</strong>
            <small>When a proposal or paper trade is selected, AI Desk keeps that thread in scope.</small>
          </div>
          <div>
            <span className="metric-label">Catalyst lead</span>
            <strong>{snapshot.catalyst_headlines[0] ?? "No catalyst headline loaded"}</strong>
            <small>{snapshot.feed_source_label}</small>
          </div>
          <div>
            <span className="metric-label">Truth note</span>
            <strong>{snapshot.data_mode_label}</strong>
            <small>{snapshot.truth_note}</small>
          </div>
        </div>
          <div className="metric-row">
            <WorkspaceJumpRow
              actions={[
                {
                  key: "ai-desk-asset",
                  label: "Open selected asset workspace",
                  target: assetWorkspaceTarget({
                    symbol: selectedSymbol,
                    signalId: selectedSignalId,
                    riskReportId: selectedRiskReportId,
                    tradeId: selectedTradeId,
                    timeframe,
                  }),
                },
                {
                  key: "ai-desk-signal",
                  label: "Review signal",
                  target: signalContextTarget({
                    symbol: selectedSymbol,
                    signalId: focusedSignalId ?? selectedSignalId,
                    riskReportId: focusedRiskReportId ?? selectedRiskReportId,
                  }),
                  disabled: !(focusedSignalId ?? selectedSignalId),
                },
                {
                  key: "ai-desk-risk",
                  label: "Open risk",
                  target: riskContextTarget({
                    symbol: selectedSymbol,
                    signalId: focusedSignalId ?? selectedSignalId,
                    riskReportId: focusedRiskReportId ?? selectedRiskReportId,
                  }),
                  disabled: !(focusedRiskReportId ?? selectedRiskReportId),
                },
              ]}
              baseState={workspaceBaseState}
              onNavigate={onNavigateWorkspaceTarget}
            />
            <button className="action-button" disabled={!snapshot.signal_focus} onClick={() => onProposePaperTrade?.()} type="button">
              {commodityTruthReady ? "Propose paper trade" : "Propose paper review trade"}
            </button>
        </div>
      </article>

      {scenario ? (
        <article className="panel compact-panel terminal-console-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scenario Sidecar</p>
              <h3>MiroFish Research</h3>
            </div>
            <span className="tag">{scenarioSourceStatusLabel(scenario.source_status)}</span>
          </div>
          {(scenario.base_case || scenario.bull_case || scenario.bear_case) ? (
            <div className="split-stack">
              {scenario.base_case ? (
                <article className="panel compact-panel">
                  <p className="eyebrow">{scenario.base_case.title}</p>
                  <p className="compact-copy">{scenario.base_case.summary}</p>
                </article>
              ) : null}
              {scenario.bull_case ? (
                <article className="panel compact-panel">
                  <p className="eyebrow">{scenario.bull_case.title}</p>
                  <p className="compact-copy">{scenario.bull_case.summary}</p>
                </article>
              ) : null}
              {scenario.bear_case ? (
                <article className="panel compact-panel">
                  <p className="eyebrow">{scenario.bear_case.title}</p>
                  <p className="compact-copy">{scenario.bear_case.summary}</p>
                </article>
              ) : null}
            </div>
          ) : null}
          <div className="stack">
            {scenario.generated_at ? <small>Generated {formatDateTimeIST(scenario.generated_at)}</small> : null}
            {scenario.availability_note ? <small>{scenario.availability_note}</small> : null}
            {scenario.catalyst_chain.length > 0 ? (
              <small>Catalyst chain: {scenario.catalyst_chain.slice(0, 3).join(" -> ")}</small>
            ) : null}
            {scenario.invalidation_triggers.length > 0 ? (
              <small>Invalidation triggers: {scenario.invalidation_triggers.slice(0, 2).join(" / ")}</small>
            ) : null}
            {scenario.confidence_notes.length > 0 ? <small>{scenario.confidence_notes[0]}</small> : null}
            <small>Scenario sidecar is research support only. Chart, signal, risk, and paper-trade truth still come from AI Trader.</small>
          </div>
        </article>
      ) : null}

      {degradedNotes.length > 0 ? (
        <article className="panel compact-panel terminal-console-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Desk Notes</p>
              <h3>Degraded But Usable</h3>
            </div>
            <span className="tag">partial</span>
          </div>
          <div className="stack">
            {degradedNotes.slice(0, 4).map((note) => (
              <small key={note}>{note}</small>
            ))}
          </div>
        </article>
      ) : null}

      <article className="panel compact-panel terminal-console-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">AI Provider</p>
            <h3>Run Configuration</h3>
          </div>
          <span className="tag">{aiAuthModeLabel(state.status.auth_mode)}</span>
        </div>
        <div className="console-strip analyst-console-strip">
          <div>
            <span className="metric-label">Provider status</span>
            <strong>{providerConsoleStatus}</strong>
            <small>{aiProviderLabel(state.status.provider)}</small>
          </div>
          <div>
            <span className="metric-label">Selected model</span>
            <strong>{state.status.selected_model}</strong>
            <small>{providerStripSourceLabel}</small>
          </div>
          <div>
            <span className="metric-label">Default posture</span>
            <strong>{state.status.provider === "local" ? "Local default" : "Provider override"}</strong>
            <small>{state.status.guidance}</small>
          </div>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>Provider</span>
            <select
              value={selectedAIProvider}
              onChange={(event) => {
                onAIProviderChange(event.target.value);
                onAIModelChange(null);
                setState((current) => ({
                  ...current,
                  response: null,
                  status: { ...current.status, provider: event.target.value, selected_model: current.status.default_model },
                }));
              }}
            >
              {(state.status.available_providers.length > 0 ? state.status.available_providers : ["local", "ollama", "openai"]).map((provider) => (
                <option key={provider} value={provider}>
                  {aiProviderLabel(provider)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{aiProviderLabel(state.status.provider)} status</span>
            <div className="stack">
              <strong>{connectionLabel(state.status)}</strong>
                <small>
                  {state.status.provider === "openai"
                    ? state.status.connected_account ?? "No OpenAI API key or OAuth connection is attached to this desk yet."
                    : state.status.provider === "ollama"
                      ? "Ollama runs locally through your machine and stays advisory-only."
                      : "Deterministic local advisory uses AI Trader’s own bounded research synthesis."}
              </small>
              {state.status.provider === "openai" && state.status.session_expires_at ? <small>Session expires {formatDateTimeIST(state.status.session_expires_at)}</small> : null}
            </div>
          </label>
          <label className="field">
            <span>Model</span>
            <select
              value={state.status.selected_model}
              onChange={(event) => {
                onAIModelChange(event.target.value);
                setState((current) => ({
                  ...current,
                  status: { ...current.status, selected_model: event.target.value },
                }));
              }}
            >
              {state.status.available_models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
        {state.status.provider === "openai" ? (
          <div className="metric-row">
            <button className="action-button" disabled={!state.status.oauth_enabled} onClick={() => connectOpenAI()} type="button">
              {state.status.connected ? "Reconnect OpenAI" : "Connect with OpenAI"}
            </button>
            {state.status.connected ? (
              <button className="text-button" onClick={() => void disconnectOpenAI()} type="button">
                Disconnect
              </button>
            ) : null}
          </div>
        ) : null}
        <small>{state.status.guidance}</small>
        {state.status.provider === "openai" ? (
          <>
            <small>Current callback URL: {state.status.oauth_callback_url ?? "unavailable"}</small>
            <small>To unlock live GPT runs later, set `AI_TRADER_OPENAI_OAUTH_CLIENT_ID` and `AI_TRADER_OPENAI_OAUTH_CLIENT_SECRET`, register the callback above, then return here to connect.</small>
          </>
        ) : null}
        {state.status.warning ? <small>{state.status.warning}</small> : null}
      </article>

      <article className="panel compact-panel terminal-console-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operator Prompt</p>
            <h3>Ask The Desk Brain</h3>
          </div>
          <span className="tag">{providerStripSourceLabel}</span>
        </div>
        <div className="stack analyst-console-notes">
          <small>Run this from the current desk context. The console keeps active run, current result, and persisted result visible in one lane.</small>
        </div>
        <label className="field">
          <span>Question</span>
          <textarea
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="metric-row">
          <button className="action-button" disabled={state.loading || question.trim().length === 0} onClick={() => void runAdvisor()} type="button">
            {state.loading ? "Running local advisory…" : state.status.provider === "local" ? "Run Local Terminal Brief" : "Run Terminal Brain"}
          </button>
        </div>
        <div className="stack analyst-console-notes">
          <small>Active Run</small>
        </div>
        {state.loading ? (
          <RunLifecycleCard
            answerSource={activeRun?.answer_source}
            canRetry={activeRun?.can_retry}
            connected={state.status.connected}
            elapsedMs={runElapsedMs}
            eyebrow="Active Advisory Run"
            model={activeRun?.selected_model ?? state.status.selected_model}
            onResumePolling={
              activeRun?.recovery_state === "active" && !["complete", "failed"].includes(activeRun.run_stage)
                ? () => void resumeAdvisorRun()
                : undefined
            }
            onRetry={activeRun?.can_retry ? () => void retryAdvisorQuestion() : undefined}
            onStartFresh={() => setQuestion(defaultQuestion)}
            onPrepareNext={() => setQuestion(defaultQuestion)}
            onRefreshStatus={() => void refreshActiveAdvisorRun()}
            prepareNextLabel="Prepare next question"
            provider={activeRun?.provider ?? state.status.provider}
            recoveryNote={activeRun?.recovery_note}
            recoveryState={activeRun?.recovery_state}
            runStage={activeRunStage}
            stageHistory={activeRun?.stage_history ?? null}
            startFreshLabel="Start fresh run"
            statusNote={activeRun?.status_note}
            updatedAt={activeRun?.updated_at}
          />
        ) : null}
        {!state.loading && activeRun && (activeRun.can_retry || activeRun.recovery_state === "stale_nonterminal" || activeRun.run_stage === "failed") ? (
          <RunLifecycleCard
            answerSource={activeRun.answer_source}
            canRetry={activeRun.can_retry}
            connected={state.status.connected}
            elapsedMs={activeRun.latency_ms ?? Math.max(Date.now() - advisorRunClockAnchorMs(activeRun), 0)}
            eyebrow="Latest Advisory Run"
            model={activeRun.selected_model}
            onRefreshStatus={() => void refreshActiveAdvisorRun()}
            onRetry={() => void retryAdvisorQuestion()}
            onStartFresh={() => setQuestion(defaultQuestion)}
            provider={activeRun.provider}
            recoveryNote={activeRun.recovery_note}
            recoveryState={activeRun.recovery_state}
            runStage={activeRun.run_stage}
            stageHistory={activeRun.stage_history ?? null}
            startFreshLabel="Start fresh run"
            statusNote={activeRun.status_note}
            updatedAt={activeRun.updated_at}
          />
        ) : null}
        {!state.loading && recentCompletion ? (
          <article className="panel compact-panel terminal-console-panel hero-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Recent Completion</p>
                <h3>Last Good Result</h3>
              </div>
              <div className="inline-tags">
                <span className="tag">{aiProviderLabel(recentCompletion.provider_status.provider)}</span>
                <span className="tag">{recentCompletion.provider_status.selected_model}</span>
                <span className="tag">{aiAnswerSourceLabel(recentCompletion.answer_source, recentCompletion.provider_status.provider, recentCompletion.provider_status.connected)}</span>
                {recentCompletion.latency_ms !== null && recentCompletion.latency_ms !== undefined ? (
                  <span className="tag">{durationLabel(recentCompletion.latency_ms)}</span>
                ) : null}
              </div>
            </div>
            <div className="stack">
              <small>{recentCompletion.validation_summary_note ?? recentCompletion.status_note ?? "Validated before display against delayed/public desk truth."}</small>
              {recentCompletionStageTrail ? <small>Recent stages: {recentCompletionStageTrail}</small> : null}
            </div>
          </article>
        ) : null}
      </article>

      {state.response ? (
        <>
          <article className="panel compact-panel terminal-console-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Validation Gate</p>
                <h3>Confidence + Limits</h3>
              </div>
              <div className="inline-tags">
                <span className="tag">{researchValidationLabel(state.response.validation.validation_status)}</span>
                <span className="tag">{researchConfidenceLabel(state.response.validation.confidence_label)}</span>
              </div>
            </div>
            <div className="stack">
              {state.response.validation.notes.length > 0 ? (
                state.response.validation.notes.map((note) => <small key={note}>{note}</small>)
              ) : (
                <small>Signal, risk, chart, and freshness evidence were strong enough for an operator-ready view.</small>
              )}
            </div>
          </article>

          <article className="panel compact-panel hero-panel terminal-console-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Current Result</p>
                <h3>Brain Summary</h3>
              </div>
              <div className="inline-tags">
                <span className="tag">{providerStripSourceLabel}</span>
                <span className="tag">{state.response.live_data_available ? "timing usable" : "research only"}</span>
              </div>
            </div>
            <div className="stack">
              <small>{state.response.context_summary}</small>
              {state.response.status_note ? <small>{state.response.status_note}</small> : null}
              {state.response.validation_summary_note ? <small>{state.response.validation_summary_note}</small> : null}
              <small>{state.response.data_truth_note}</small>
              <div className="inline-tags">
                {state.response.run_mode ? <span className="tag">{aiRunModeLabel(state.response.run_mode)}</span> : null}
                {state.response.run_stage ? <span className="tag">{aiRunStageLabel(state.response.run_stage)}</span> : null}
                {state.response.latency_ms !== null && state.response.latency_ms !== undefined ? <span className="tag">{durationLabel(state.response.latency_ms)}</span> : null}
              </div>
              {completedRunStageTrail ? <small>Recent stages: {completedRunStageTrail}</small> : null}
              {state.response.warnings.map((warning) => (
                <small key={warning}>{warning}</small>
              ))}
              <p className="compact-copy">{state.response.final_answer}</p>
            </div>
          </article>

          <div className="split-stack">
            <article className="panel compact-panel">
              <p className="eyebrow">Current Market Read</p>
              <p className="compact-copy">{state.response.market_view}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Why It Matters Now</p>
              <p className="compact-copy">{state.response.why_it_matters_now}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Key Levels / Scenarios</p>
              <div className="stack">
                {state.response.key_levels.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Catalyst Watch</p>
              <div className="stack">
                {state.response.catalysts.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Invalidation / What Changes The View</p>
              <p className="compact-copy">{state.response.invalidation}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Risk Frame</p>
              <div className="stack">
                {state.response.risk_frame.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Related Assets To Monitor</p>
              <div className="stack">
                {state.response.related_markets.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Next Actions In Platform</p>
              <div className="stack">
                {state.response.next_actions.map((action) => (
                  <button className="news-item" key={`${action.workspace}-${action.label}`} onClick={() => onNavigate(action.workspace)} type="button">
                    <strong>{action.label}</strong>
                    <small>{action.workspace.replace(/_/g, " ")}</small>
                    <small>{action.note}</small>
                  </button>
                ))}
              </div>
            </article>
          </div>

          <ResearchRunPanel run={state.response.research_run} title="Evidence + Provenance" />

          <article className="panel compact-panel terminal-console-panel">
            <h3>Contributing Agents</h3>
            <div className="split-stack">
              {state.response.agent_results.map((agent) => (
                <article className="panel compact-panel" key={agent.agent}>
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Agent</p>
                      <h3>{agent.agent}</h3>
                    </div>
                    <span className="tag">{Math.round(agent.confidence * 100)}%</span>
                  </div>
                  <strong>{agent.headline}</strong>
                  <p className="compact-copy">{agent.summary}</p>
                  {agent.warnings.length > 0 ? (
                    <div className="stack">
                      {agent.warnings.map((warning) => (
                        <small key={warning}>{warning}</small>
                      ))}
                    </div>
                  ) : null}
                  {agent.citations.length > 0 ? (
                    <div className="inline-tags">
                      {agent.citations.slice(0, 3).map((citation) => (
                        <span className="tag" key={citation}>
                          {citation}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </article>
        </>
      ) : (
        <article className="panel compact-panel terminal-console-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Local Desk Brief</p>
              <h3>Pre-Run Advisory</h3>
            </div>
            <span className="tag">{state.status.connected ? "OpenAI-ready" : "Local analysis"}</span>
          </div>
          <div className="split-stack">
            <article className="panel compact-panel">
              <p className="eyebrow">Current Market Read</p>
              <p className="compact-copy">{localPreview.marketRead}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Why It Matters Now</p>
              <p className="compact-copy">{localPreview.whyNow}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Key Levels / Scenarios</p>
              <div className="stack">
                {localPreview.keyLevels.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Catalyst Watch</p>
              <div className="stack">
                {localPreview.catalysts.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Invalidation / What Changes The View</p>
              <p className="compact-copy">{localPreview.invalidation}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Risk Frame</p>
              <div className="stack">
                {localPreview.riskFrame.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Related Assets To Monitor</p>
              <div className="stack">
                {localPreview.relatedAssets.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Next Actions In Platform</p>
              <div className="stack">
                {localPreview.nextActions.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
          </div>
        </article>
      )}
    </div>
  );
}
