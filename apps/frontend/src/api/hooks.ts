import { useEffect, useRef, useState } from "react";
import { apiClient } from "./client";
import { applyMarketChartDelta } from "../lib/marketChartDelta";
import { sameTerminalFocusSymbol } from "../lib/terminalFocus";
import type {
  ActiveTradeView,
  AlertEnvelope,
  AssetContextView,
  BacktestListView,
  BarView,
  MarketChartView,
  MarketChartDeltaMessage,
  MarketChartStreamMessage,
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
  ResearchRunView,
  ReviewSummaryView,
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
  TradeTimelineView,
  TradeTicketDetailView,
  TicketSummaryView,
  TradeTicketView,
  WalletBalanceView,
  WatchlistView,
  SelectedAssetTruthView,
  WatchlistSummaryView,
} from "../types/api";

export interface ResourceState<T> {
  data: T;
  loading: boolean;
  hydrated: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export interface LiveMarketChartState extends ResourceState<MarketChartView> {
  streamStatus: "connecting" | "live" | "reconnecting" | "fallback_polling" | null;
  awaitingLiveUpdate: boolean;
  transportDebug: ChartTransportDebugState;
}

interface LoadChartFromRestOptions {
  markLoading: boolean;
  source: "initial" | "fallback" | "manual" | "resync";
}

type ChartTransportEventKind = "baseline" | "delta" | "probe_delta" | "probe_invalid_delta" | "resync_full" | null;
type ChartTransportRejectReason = ReturnType<typeof applyMarketChartDelta>["reason"] | null;

export interface ChartTransportDebugState {
  baselineReceivedCount: number;
  deltaReceivedCount: number;
  deltaAppliedCount: number;
  deltaRejectedCount: number;
  restResyncRequestedCount: number;
  restResyncCompletedCount: number;
  lastEventKind: ChartTransportEventKind;
  lastVersion: number | null;
  lastProbeNonce: string | null;
  lastRejectReason: ChartTransportRejectReason;
}

interface ChartTransportDebugApi extends ChartTransportDebugState {
  requestDeltaProbe: () => boolean;
  requestRejectedDeltaProbe: () => boolean;
}

const EMPTY_CHART_TRANSPORT_DEBUG_STATE: ChartTransportDebugState = {
  baselineReceivedCount: 0,
  deltaReceivedCount: 0,
  deltaAppliedCount: 0,
  deltaRejectedCount: 0,
  restResyncRequestedCount: 0,
  restResyncCompletedCount: 0,
  lastEventKind: null,
  lastVersion: null,
  lastProbeNonce: null,
  lastRejectReason: null,
};

declare global {
  interface Window {
    __AI_TRADER_CHART_DEBUG__?: ChartTransportDebugApi;
  }
}

interface PollingOptions {
  deps?: unknown[];
  intervalMs?: number;
  enabled?: boolean;
  preserveData?: boolean;
}

export function usePollingResource<T>(loader: () => Promise<T>, initialData: T, options: PollingOptions = {}): ResourceState<T> {
  const { deps = [], intervalMs = 30000, enabled = true, preserveData = false } = options;
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(enabled);
  const [hydrated, setHydrated] = useState(false);
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
          setHydrated(true);
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

    if (!enabled) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!preserveData) {
      setData(initialData);
      setHydrated(false);
    }
    setError(null);
    setLoading(true);
    void runLoad();
    const timer = window.setInterval(() => {
      void runLoad();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, preserveData, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    loading,
    hydrated,
    refreshing: loading && hydrated,
    error,
    refresh: async () => {
      setLoading(true);
      try {
        const nextData = await loader();
        setData(nextData);
        setHydrated(true);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Request failed");
      } finally {
        setLoading(false);
      }
    },
  };
}

export function useSelectedAssetTruth(
  symbol: string,
  enabled = true,
): ResourceState<SelectedAssetTruthView | null> {
  const [data, setData] = useState<SelectedAssetTruthView | null>(null);
  const [loading, setLoading] = useState(enabled && Boolean(symbol));
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    async function loadInitial() {
      if (!enabled || !symbol) {
        setLoading(false);
        setHydrated(false);
        setData(null);
        return;
      }
      setLoading(true);
      try {
        const nextData = await apiClient.selectedAssetTruth(symbol);
        if (!cancelled) {
          setData(nextData);
          setHydrated(true);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Selected asset truth request failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    function connectSocket() {
      if (!enabled || !symbol || cancelled) {
        return;
      }
      try {
        socket = new WebSocket(apiClient.selectedAssetTruthSocketUrl());
      } catch (socketError) {
        if (!cancelled) {
          setError(socketError instanceof Error ? socketError.message : "Selected asset truth stream unavailable");
        }
        return;
      }

      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            type: "subscribe_selected_asset_truth",
            symbol,
          }),
        );
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }
        try {
          const message = JSON.parse(event.data) as {
            type?: string;
            payload?: SelectedAssetTruthView;
          };
          if (message.type === "selected_asset_truth" && message.payload) {
            setData(message.payload);
            setHydrated(true);
            setLoading(false);
            setError(null);
          }
        } catch {
          // Ignore malformed stream messages and keep the last truthful snapshot.
        }
      };

      socket.onclose = () => {
        if (cancelled || !enabled) {
          return;
        }
        reconnectTimer = window.setTimeout(() => {
          connectSocket();
        }, 2000);
      };
    }

    void loadInitial();
    connectSocket();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [enabled, symbol]);

  return {
    data,
    loading,
    hydrated,
    refreshing: loading && hydrated,
    error,
    refresh: async () => {
      if (!enabled || !symbol) {
        setData(null);
        setHydrated(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const nextData = await apiClient.selectedAssetTruth(symbol);
        setData(nextData);
        setHydrated(true);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Selected asset truth request failed");
      } finally {
        setLoading(false);
      }
    },
  };
}

function emptyMarketChart(symbol: string, timeframe: string): MarketChartView {
  return {
    symbol,
    timeframe,
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
    overlays: { markers: [], price_lines: [], zones: [] },
    instrument_mapping: {
      requested_symbol: symbol,
      canonical_symbol: symbol,
      trader_symbol: symbol,
      display_symbol: symbol,
      display_name: symbol,
      underlying_asset: symbol,
      research_symbol: symbol,
      public_symbol: symbol,
      broker_symbol: symbol,
      broker_truth: true,
      mapping_notes: "Loading symbol mapping…",
    },
    data_reality: null,
  };
}

function chartTransportDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const { hostname, protocol } = window.location;
  const localHost = hostname === "127.0.0.1" || hostname === "localhost";
  return localHost && (protocol === "http:" || protocol === "https:");
}

function chartTransportDebugSnapshot(
  state: ChartTransportDebugState,
  requestDeltaProbe: () => boolean,
  requestRejectedDeltaProbe: () => boolean,
): ChartTransportDebugApi {
  return {
    ...state,
    requestDeltaProbe,
    requestRejectedDeltaProbe,
  };
}

export function useLiveMarketChart(
  symbol: string,
  timeframe: string,
  enabled = true,
): LiveMarketChartState {
  const [data, setData] = useState<MarketChartView>(() => emptyMarketChart(symbol, timeframe));
  const [loading, setLoading] = useState(enabled && Boolean(symbol));
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "live" | "reconnecting" | "fallback_polling" | null>(
    enabled && Boolean(symbol) ? "connecting" : null,
  );
  const [awaitingLiveUpdate, setAwaitingLiveUpdate] = useState(false);
  const [transportDebug, setTransportDebug] = useState<ChartTransportDebugState>(EMPTY_CHART_TRANSPORT_DEBUG_STATE);
  const dataRef = useRef(data);
  const hydratedRef = useRef(hydrated);
  const transportDebugRef = useRef(transportDebug);
  const chartVersionRef = useRef<number | null>(null);
  const resyncScheduledRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const chartSubscriptionRef = useRef<{ symbol: string; timeframe: string } | null>(null);
  const debugEnabled = chartTransportDebugEnabled();

  const updateTransportDebug = (updater: (current: ChartTransportDebugState) => ChartTransportDebugState) => {
    setTransportDebug((current) => {
      const next = updater(current);
      transportDebugRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    dataRef.current = data;
    hydratedRef.current = hydrated;
    transportDebugRef.current = transportDebug;
  }, [data, hydrated, transportDebug]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!debugEnabled) {
      delete window.__AI_TRADER_CHART_DEBUG__;
      return;
    }
    const requestProbe = (probeKind: "accepted" | "rejected_stale_version") => {
      const socket = socketRef.current;
      const subscription = chartSubscriptionRef.current;
      if (!socket || !subscription) {
        return false;
      }
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify({
        type: "verify_market_chart_delta",
        symbol: subscription.symbol,
        timeframe: subscription.timeframe,
        probe_kind: probeKind,
      }));
      return true;
    };
    const requestDeltaProbe = () => requestProbe("accepted");
    const requestRejectedDeltaProbe = () => requestProbe("rejected_stale_version");
    window.__AI_TRADER_CHART_DEBUG__ = chartTransportDebugSnapshot(
      transportDebug,
      requestDeltaProbe,
      requestRejectedDeltaProbe,
    );
    return () => {
      if (
        window.__AI_TRADER_CHART_DEBUG__?.requestDeltaProbe === requestDeltaProbe
        && window.__AI_TRADER_CHART_DEBUG__?.requestRejectedDeltaProbe === requestRejectedDeltaProbe
      ) {
        delete window.__AI_TRADER_CHART_DEBUG__;
      }
    };
  }, [debugEnabled, transportDebug]);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let fallbackTimer: number | null = null;
    let livePayloadSeen = false;
    const requestedSymbol = symbol.toUpperCase();
    const requestedTimeframe = timeframe.toLowerCase();

    function scheduleRestResync(reason: ChartTransportRejectReason) {
      if (cancelled || resyncScheduledRef.current) {
        return;
      }
      resyncScheduledRef.current = true;
      updateTransportDebug((current) => ({
        ...current,
        restResyncRequestedCount: current.restResyncRequestedCount + 1,
        lastRejectReason: reason,
      }));
      window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        void loadChartFromRest({ markLoading: false, source: "resync" });
      }, 0);
    }

    async function loadChartFromRest({ markLoading, source }: LoadChartFromRestOptions) {
      if (!enabled || !requestedSymbol || cancelled) {
        return;
      }
      if (markLoading) {
        setLoading(true);
      }
      try {
        const nextData = await apiClient.marketChart(
          requestedSymbol,
          requestedTimeframe,
          source === "resync"
            ? {
                resyncNonce: `${Date.now()}`,
              }
            : undefined,
        );
        if (cancelled) {
          return;
        }
        if (source === "initial" && livePayloadSeen) {
          setLoading(false);
          return;
        }
        if (!sameTerminalFocusSymbol(nextData.instrument_mapping.trader_symbol ?? nextData.symbol, requestedSymbol)) {
          return;
        }
        if (nextData.timeframe.toLowerCase() !== requestedTimeframe) {
          return;
        }
        setData(nextData);
        setHydrated(true);
        chartVersionRef.current = null;
        if (source === "resync" && resyncScheduledRef.current) {
          updateTransportDebug((current) => ({
            ...current,
            restResyncCompletedCount: current.restResyncCompletedCount + 1,
          }));
          resyncScheduledRef.current = false;
        }
        setError(null);
        setLoading(false);
        if (source !== "fallback") {
          setStreamStatus((current) => (current === "live" ? current : "connecting"));
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Chart request failed");
        setLoading(false);
      }
    }

    function stopFallbackPolling() {
      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    }

    function startFallbackPolling() {
      if (fallbackTimer !== null || cancelled || !enabled || !requestedSymbol) {
        return;
      }
      setStreamStatus("fallback_polling");
      fallbackTimer = window.setInterval(() => {
        void loadChartFromRest({ markLoading: false, source: "fallback" });
      }, 60000);
    }

    function connectSocket() {
      if (!enabled || !requestedSymbol || cancelled) {
        return;
      }
      setStreamStatus((current) => (hydratedRef.current || current === "live" ? "reconnecting" : "connecting"));
      try {
        socket = new WebSocket(apiClient.marketChartSocketUrl());
      } catch (socketError) {
        if (!cancelled) {
          setError(socketError instanceof Error ? socketError.message : "Chart stream unavailable");
          startFallbackPolling();
        }
        return;
      }

      socket.onopen = () => {
        if (cancelled) {
          return;
        }
        socketRef.current = socket;
        chartSubscriptionRef.current = { symbol: requestedSymbol, timeframe: requestedTimeframe };
        stopFallbackPolling();
        setError(null);
        setStreamStatus("live");
        socket?.send(
          JSON.stringify({
            type: "subscribe_market_chart",
            symbol: requestedSymbol,
            timeframe: requestedTimeframe,
          }),
        );
      };

        socket.onmessage = (event) => {
          if (cancelled) {
            return;
          }
          try {
            const message = JSON.parse(event.data) as MarketChartStreamMessage | MarketChartDeltaMessage;
            if (message.type === "market_chart" && message.payload) {
              const payloadSymbol = String(message.symbol ?? message.payload.instrument_mapping?.trader_symbol ?? message.payload.symbol ?? "").toUpperCase();
              const payloadTimeframe = String(message.timeframe ?? message.payload.timeframe ?? "").toLowerCase();
              if (!sameTerminalFocusSymbol(payloadSymbol, requestedSymbol) || payloadTimeframe !== requestedTimeframe) {
                return;
              }
              livePayloadSeen = true;
              chartVersionRef.current = message.version;
              updateTransportDebug((current) => ({
                ...current,
                baselineReceivedCount: current.baselineReceivedCount + 1,
                restResyncCompletedCount: resyncScheduledRef.current
                  ? current.restResyncCompletedCount + 1
                  : current.restResyncCompletedCount,
                lastEventKind: message.transport?.event_kind ?? "baseline",
                lastVersion: message.version,
                lastProbeNonce: message.transport?.proof_nonce ?? null,
                lastRejectReason: null,
              }));
              resyncScheduledRef.current = false;
              setData(message.payload);
              setHydrated(true);
              setLoading(false);
              setError(null);
              setStreamStatus("live");
              setAwaitingLiveUpdate(false);
              return;
            }
            if (message.type !== "market_chart_delta") {
              return;
            }
            updateTransportDebug((current) => ({
              ...current,
              deltaReceivedCount: current.deltaReceivedCount + 1,
              lastEventKind: message.transport?.event_kind ?? "delta",
              lastVersion: message.version,
              lastProbeNonce: message.transport?.proof_nonce ?? null,
            }));
            const applyResult = applyMarketChartDelta({
              currentChart: dataRef.current,
              currentVersion: chartVersionRef.current,
              message,
              requestedSymbol,
              requestedTimeframe,
            });
            if (!applyResult.accepted) {
              updateTransportDebug((current) => ({
                ...current,
                deltaRejectedCount: current.deltaRejectedCount + 1,
                lastRejectReason: applyResult.reason ?? null,
              }));
              if (applyResult.shouldResync) {
                scheduleRestResync(applyResult.reason ?? null);
              }
              return;
            }
            livePayloadSeen = true;
            chartVersionRef.current = applyResult.version ?? chartVersionRef.current;
            resyncScheduledRef.current = false;
            updateTransportDebug((current) => ({
              ...current,
              deltaAppliedCount: current.deltaAppliedCount + 1,
              lastVersion: applyResult.version ?? current.lastVersion,
              lastRejectReason: null,
            }));
            setData(applyResult.chart ?? dataRef.current);
            setHydrated(true);
            setLoading(false);
            setError(null);
            setStreamStatus("live");
            setAwaitingLiveUpdate(false);
          } catch {
            // Keep the last truthful chart payload if a stream message is malformed.
          }
        };

      const handleSocketUnavailable = () => {
        if (cancelled || !enabled) {
          return;
        }
        socketRef.current = null;
        startFallbackPolling();
        setStreamStatus("reconnecting");
        reconnectTimer = window.setTimeout(() => {
          connectSocket();
        }, 2000);
      };

      socket.onerror = () => {
        handleSocketUnavailable();
      };

      socket.onclose = () => {
        handleSocketUnavailable();
      };
    }

    if (!requestedSymbol) {
      socketRef.current = null;
      chartSubscriptionRef.current = null;
      setData(emptyMarketChart(symbol, timeframe));
      setLoading(false);
      setHydrated(false);
      chartVersionRef.current = null;
      resyncScheduledRef.current = false;
      setError(null);
      setStreamStatus(null);
      setAwaitingLiveUpdate(false);
      setTransportDebug(EMPTY_CHART_TRANSPORT_DEBUG_STATE);
      return () => {
        cancelled = true;
      };
    }
    if (!enabled) {
      socketRef.current = null;
      chartSubscriptionRef.current = null;
      setLoading(false);
      chartVersionRef.current = null;
      resyncScheduledRef.current = false;
      setStreamStatus(null);
      setAwaitingLiveUpdate(false);
      setTransportDebug(EMPTY_CHART_TRANSPORT_DEBUG_STATE);
      return () => {
        cancelled = true;
      };
    }

    const currentData = dataRef.current;
    const preservingRenderableChart =
      sameTerminalFocusSymbol(currentData.instrument_mapping.trader_symbol ?? currentData.symbol, requestedSymbol)
      && currentData.bars.length > 0
      && currentData.timeframe.toLowerCase() !== requestedTimeframe;
    setError(null);
    setLoading(true);
    chartVersionRef.current = null;
    resyncScheduledRef.current = false;
    setStreamStatus("connecting");
    setAwaitingLiveUpdate(preservingRenderableChart);
    setTransportDebug(EMPTY_CHART_TRANSPORT_DEBUG_STATE);
    void loadChartFromRest({ markLoading: true, source: "initial" });
    connectSocket();

    return () => {
      cancelled = true;
      socketRef.current = null;
      chartSubscriptionRef.current = null;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      stopFallbackPolling();
      socket?.close();
    };
  }, [enabled, symbol, timeframe]);

  return {
    data,
    loading,
    hydrated,
    refreshing: loading && hydrated,
    error,
    streamStatus,
    awaitingLiveUpdate,
    transportDebug,
    refresh: async () => {
      if (!enabled || !symbol) {
        setData(emptyMarketChart(symbol, timeframe));
        setHydrated(false);
        setLoading(false);
        chartVersionRef.current = null;
        resyncScheduledRef.current = false;
        setStreamStatus(null);
        setAwaitingLiveUpdate(false);
        setTransportDebug(EMPTY_CHART_TRANSPORT_DEBUG_STATE);
        return;
      }
      setLoading(true);
      try {
        const nextData = await apiClient.marketChart(symbol.toUpperCase(), timeframe.toLowerCase());
        setData(nextData);
        setHydrated(true);
        chartVersionRef.current = null;
        resyncScheduledRef.current = false;
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Chart request failed");
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

export function canHydrateSelection(
  selectedId: string | null,
  knownIds: Array<string | null | undefined>,
): boolean {
  if (!selectedId) {
    return false;
  }
  const resolvedIds = knownIds.filter((value): value is string => Boolean(value));
  return resolvedIds.length === 0 || resolvedIds.includes(selectedId);
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
  const restoringResearch = activeTab === "research";
  const showDesk = activeTab === "desk";
  const showSignals = activeTab === "signals";
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
  const showFocusSurface = ["desk", "signals", "watchlist", "risk", "trade_tickets", "active_trades", "ai_desk"].includes(activeTab);
  const showAIDesk = activeTab === "ai_desk";
  const needsSignalHydration = showFocusSurface || showJournal || showSession;
  const needsRiskHydration = showFocusSurface || showJournal || showSession;
  const needsTradeHydration = showTrades || showReplay || showTickets;
  const needsTicketHydration = showTickets;
  const needsContextHydration = showFocusSurface || showAIDesk || showJournal || showSession || showPolymarket;
  const selectedAssetTruthSymbol = selectedSymbol || "USOUSD";

  const health = usePollingResource<HealthView>(() => apiClient.health(), {
    status: "syncing",
    sqlite_path: "",
    duckdb_path: "",
    parquet_dir: "",
  }, { preserveData: true });
  const selectedAssetTruth = useSelectedAssetTruth(
    selectedAssetTruthSymbol,
    needsContextHydration,
  );
  const overview = usePollingResource<RibbonView>(() => apiClient.overview(selectedSymbol), {
    macro_regime: "syncing",
    data_freshness_minutes: 0,
    freshness_status: "unknown",
    market_data_as_of: null,
    system_refresh_minutes: null,
    system_refresh_status: "unknown",
    risk_budget_used_pct: 0,
    risk_budget_total_pct: 0,
    pipeline_status: "syncing",
    source_mode: "syncing",
    market_data_mode: "fixture",
    data_mode_label: "Syncing market-data truth",
    feed_source_label: "Syncing active feed path",
    mode_explainer: "Syncing market-data truth from the active backend.",
    last_refresh: null,
    next_event: null,
  }, { deps: [selectedSymbol], preserveData: true, });
  const deskSummary = usePollingResource<DeskSummaryView>(
    () => apiClient.deskSummary(),
    {
      generated_at: "",
      runtime_snapshot: null,
      operator_state_summary: null,
      session_states: [],
      execution_gate: { status: "not_ready", blockers: [], thresholds: {}, metrics: {}, rationale: [], blocker_details: [] },
      operational_backlog: { generated_at: "", overdue_count: 0, high_priority_count: 0, items: [] },
      section_readiness: {},
      section_notes: {},
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
    { enabled: showDesk, intervalMs: 60000, preserveData: true },
  );
  const homeSummary = usePollingResource<HomeOperatorSummaryView>(
    () => apiClient.homeSummary(),
    {
      generated_at: "",
      runtime_snapshot: null,
      operator_state_summary: null,
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
    { enabled: showDesk || showSignals || showWatchlist || activeTab === "ai_desk", intervalMs: 60000, preserveData: true },
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
    { enabled: commandCenterOpen, intervalMs: 60000, preserveData: true },
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
    { enabled: commandCenterOpen, intervalMs: 60000, preserveData: true },
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
    { enabled: showSession, preserveData: true },
  );
  const reviewTasks = usePollingResource<ReviewTaskView[]>(
    () => apiClient.reviewTasks(true),
    [],
    { enabled: showSession && sessionOverview.hydrated, intervalMs: 60000, preserveData: true },
  );
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
    { enabled: false, preserveData: true },
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
    { enabled: false, preserveData: true },
  );
  const operationalBacklog = usePollingResource<OperationalBacklogView>(
    () => apiClient.operationalBacklog(),
    {
      generated_at: "",
      overdue_count: 0,
      high_priority_count: 0,
      items: [],
    },
    { enabled: showPilot || commandCenterOpen, intervalMs: 60000, preserveData: true },
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
      task_counts: { rendered_open: 0, overdue: 0, high_priority: 0, in_progress: 0, done: 0, archived: 0, resolved_hidden: 0 },
      accountability_metrics: {
        overdue_count: 0,
        oldest_overdue_hours: null,
        gate_blocking_count: 0,
        in_progress_count: 0,
        archived_count: 0,
        completed_recent_count: 0,
        completion_rate_7d: 0,
        clearance_velocity_7d: 0,
        stale_open_count: 0,
        clearance_status: "clear",
      },
      gate_impact: {
        gate_blocking_task_ids: [],
        gate_blocking_count: 0,
        blocker_counts: {},
        clear_these_first: [],
      },
      review_family_counts: [],
      history_buckets: [],
      discipline_loop_proof: {
        latest_completed_loop_at: null,
        latest_reviewed_trade_symbol: null,
        latest_review_chain_summary: "",
        loop_completion_state: "not_yet_established",
        selection_policy: "best_available",
        trade_id: null,
        ticket_id: null,
        display_symbol: null,
        signal_family: null,
        side: null,
        trade_status: null,
        review_status: null,
        journal_id: null,
        journal_attached: false,
      },
      review_chain_analytics: {
        review_due_closed_trade_count: 0,
        reviewed_trade_count: 0,
        reviewed_without_ticket_count: 0,
        reviewed_without_journal_count: 0,
        fully_linked_completed_loop_count: 0,
        partially_linked_reviewed_loop_count: 0,
        reopened_after_review_count: 0,
        archived_without_completion_count: 0,
        quality_state: "not_established",
        quality_note: "",
        latest_loop_linkage_state: "not_yet_established",
        debt_examples: [],
      },
    },
    { enabled: showDesk || showSession || showJournal, preserveData: true },
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
    { enabled: showPilot, preserveData: true },
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
    { enabled: showPilot, preserveData: true },
  );
  const executionGate = usePollingResource<ExecutionGateView>(
    () => apiClient.executionGate(),
    { status: "not_ready", blockers: [], thresholds: {}, metrics: {}, rationale: [], blocker_details: [] },
    { enabled: showDesk || showSession || showPilot || commandCenterOpen, intervalMs: 60000, preserveData: true },
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
      execution_gate: { status: "not_ready", blockers: [], thresholds: {}, metrics: {}, rationale: [], blocker_details: [] },
      adapter_health: [],
      recent_audit_logs: [],
    },
    { enabled: showPilot, preserveData: true },
  );
  const adapterHealth = usePollingResource<AdapterHealthView[]>(() => apiClient.adapterHealth(), [], { enabled: showPilot, intervalMs: 60000, preserveData: true });
  const auditLogs = usePollingResource<AuditLogView[]>(() => apiClient.auditLogs(), [], { enabled: showPilot, intervalMs: 60000, preserveData: true });
  const signals = usePollingResource<SignalView[]>(() => apiClient.signals(), [], { enabled: showSignals, preserveData: true });
  const signalsSummary = usePollingResource<SignalsSummaryView>(
    () => apiClient.signalsSummary(),
    { generated_at: "", filter_metadata: {}, grouped_counts: {}, top_ranked_signals: [], warning_counts: {} },
    { enabled: showSignals || showDesk || showWatchlist || activeTab === "ai_desk", intervalMs: 60000, preserveData: true },
  );
  const highRiskSignals = usePollingResource<SignalView[]>(() => apiClient.highRiskSignals(), [], {
    enabled: showSignals || showRisk,
    preserveData: true,
  });
  const news = usePollingResource<NewsView[]>(() => apiClient.news(), [], { enabled: showNews || showAIDesk, preserveData: true });
  const polymarketHunter = usePollingResource<PolymarketHunterView>(
    () => apiClient.polymarketHunter(),
    { generated_at: "", source_status: "syncing", source_note: "", query: "", tag: "", sort: "relevance", available_tags: [], events: [], markets: [] },
    { enabled: showPolymarket || showNews || showResearch, intervalMs: 120000, preserveData: true },
  );
  const watchlist = usePollingResource<WatchlistView[]>(() => apiClient.watchlist(), [], { enabled: showWatchlist });
  const watchlistSummary = usePollingResource<WatchlistSummaryView[]>(() => apiClient.watchlistSummary(), [], {
    enabled: showWatchlist || showDesk || showResearch || Boolean(selectedSymbol),
    intervalMs: 60000,
    preserveData: true,
  });
  const opportunities = usePollingResource<OpportunityHunterView>(
    () => apiClient.opportunities(),
    { generated_at: "", focus_queue: [], scout_queue: [] },
    { enabled: showWatchlist, preserveData: true },
  );
  const research = usePollingResource<ResearchView[]>(() => apiClient.research(), [], { enabled: showResearch, preserveData: true });
  const researchRuns = usePollingResource<ResearchRunView[]>(() => apiClient.researchRuns(), [], { enabled: showResearch || showAIDesk, preserveData: true });
  const risk = usePollingResource<RiskView[]>(() => apiClient.risk(), [], { enabled: showRisk, preserveData: true });
  const riskExposure = usePollingResource<RiskExposureView[]>(() => apiClient.riskExposure(), [], { enabled: showRisk, preserveData: true });
  const activeTrades = usePollingResource<ActiveTradeView[]>(() => apiClient.activeTrades(), [], { enabled: showTrades, preserveData: true });
  const proposedPaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.proposedPaperTrades(), [], { enabled: (needsTradeHydration || Boolean(selectedTradeId)) && !restoringResearch, preserveData: true });
  const activePaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.activePaperTrades(), [], { enabled: (needsTradeHydration || Boolean(selectedTradeId)) && !restoringResearch, preserveData: true });
  const closedPaperTrades = usePollingResource<PaperTradeView[]>(() => apiClient.closedPaperTrades(), [], { enabled: (needsTradeHydration || Boolean(selectedTradeId)) && !restoringResearch, preserveData: true });
  const walletBalance = usePollingResource<WalletBalanceView[]>(() => apiClient.walletBalance(), [], { enabled: showWallet });
  const journal = usePollingResource<JournalReviewView[]>(() => apiClient.journal(), [], { enabled: showJournal, preserveData: true });
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
    { enabled: showJournal && (journal.hydrated || reviewSummary.hydrated), preserveData: true },
  );
  const paperTradeReviews = usePollingResource<PaperTradeReviewView[]>(
    () => apiClient.paperTradeReviews(),
    [],
    { enabled: showJournal && (journal.hydrated || reviewSummary.hydrated), preserveData: true },
  );
  const scenario = usePollingResource<ScenarioResearchView | null>(
    () => (selectedSymbol ? apiClient.scenario(selectedSymbol, selectedTimeframe) : Promise.resolve(null)),
    null,
    { deps: [selectedSymbol, selectedTimeframe], enabled: (showAIDesk || showResearch) && Boolean(selectedSymbol), intervalMs: 120000, preserveData: true },
  );
  const alerts = usePollingResource<AlertEnvelope[]>(() => apiClient.alerts(), [], { intervalMs: 60000 });
  const backtests = usePollingResource<BacktestListView[]>(() => apiClient.backtests(), [], { enabled: showBacktests });
  const bars = usePollingResource<BarView[]>(() => apiClient.bars(selectedSymbol), [], {
    deps: [selectedSymbol],
    enabled: false,
  });
  const marketChart = useLiveMarketChart(selectedSymbol, selectedTimeframe, needsContextHydration && Boolean(selectedSymbol));
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
    { deps: [selectedSymbol], enabled: needsContextHydration && Boolean(selectedSymbol), intervalMs: 60000, preserveData: true },
  );
  const knownSignalHydrationIds = [
    ...signals.data.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)).map((row) => row.signal_id),
    ...signalsSummary.data.top_ranked_signals.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)).map((row) => row.signal_id),
    assetContext.data.latest_signal?.signal_id,
  ];
  const knownSignalHydrationKey = knownSignalHydrationIds.filter((value): value is string => Boolean(value)).join("|");
  const canHydrateSelectedSignal = canHydrateSelection(selectedSignalId, knownSignalHydrationIds);
  const signalDetail = usePollingResource<SignalDetailView | null>(
    () => (selectedSignalId ? apiClient.signalDetail(selectedSignalId) : Promise.resolve(null)),
    selectedSignalId ? emptySignalDetail(selectedSignalId) : null,
    { deps: [selectedSignalId, selectedSymbol, knownSignalHydrationKey], enabled: canHydrateSelectedSignal && needsSignalHydration, preserveData: true },
  );
  const selectedSignalWorkspace = usePollingResource<SelectedSignalWorkspaceView | null>(
    () => (selectedSignalId ? apiClient.selectedSignalWorkspace(selectedSignalId, selectedTimeframe) : Promise.resolve(null)),
    null,
    {
      deps: [selectedSignalId, selectedSymbol, selectedTimeframe, knownSignalHydrationKey],
      enabled: canHydrateSelectedSignal && needsContextHydration,
      preserveData: true,
    },
  );
  const knownRiskHydrationIds = [
    ...risk.data.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)).map((row) => row.risk_report_id),
    assetContext.data.latest_risk?.risk_report_id,
    selectedSignalWorkspace.data?.risk?.risk_report_id,
  ];
  const knownRiskHydrationKey = knownRiskHydrationIds.filter((value): value is string => Boolean(value)).join("|");
  const canHydrateSelectedRisk = canHydrateSelection(selectedRiskReportId, knownRiskHydrationIds);
  const riskDetail = usePollingResource<RiskDetailView | null>(
    () => (selectedRiskReportId ? apiClient.riskDetail(selectedRiskReportId) : Promise.resolve(null)),
    selectedRiskReportId ? emptyRiskDetail(selectedRiskReportId) : null,
    {
      deps: [selectedRiskReportId, selectedSymbol, knownRiskHydrationKey],
      enabled: canHydrateSelectedRisk && needsRiskHydration,
      preserveData: true,
    },
  );
  const paperTradeDetail = usePollingResource<PaperTradeDetailView | null>(
    () => (selectedTradeId ? apiClient.paperTradeDetail(selectedTradeId) : Promise.resolve(null)),
    selectedTradeId ? emptyPaperTradeDetail(selectedTradeId) : null,
    { deps: [selectedTradeId], enabled: Boolean(selectedTradeId) && needsTradeHydration, preserveData: true },
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
  const tradeTickets = usePollingResource<TradeTicketView[]>(() => apiClient.tradeTickets(), [], { enabled: (showTickets || Boolean(selectedTicketId)) && !restoringResearch, preserveData: true });
  const tradeTicketSummary = usePollingResource<TicketSummaryView>(
    () => apiClient.tradeTicketSummary(),
    { generated_at: "", counts_by_state: {}, checklist_blockers: {}, shadow_active_count: 0, reconciliation_needed_count: 0, ready_for_review_count: 0 },
    { enabled: showTickets && !restoringResearch, preserveData: true },
  );
  const tradeTicketDetail = usePollingResource<TradeTicketDetailView | null>(
    () => (selectedTicketId ? apiClient.tradeTicketDetail(selectedTicketId) : Promise.resolve(null)),
    null,
    { deps: [selectedTicketId], enabled: Boolean(selectedTicketId) && needsTicketHydration, preserveData: true },
  );
  const shadowModeTickets = usePollingResource<TradeTicketDetailView[]>(() => apiClient.shadowModeTickets(), [], { enabled: showTickets, preserveData: true });
  const brokerSnapshot = usePollingResource<BrokerAdapterSnapshotView>(
    () => apiClient.brokerSnapshot(),
    { generated_at: "", balances: [], positions: [], fill_imports: [] },
    { enabled: showTickets, preserveData: true },
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
    selectedAssetTruth,
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
    selectedSignalWorkspace,
    highRiskSignals,
    news,
    polymarketHunter,
    watchlist,
    watchlistSummary,
    opportunities,
    research,
    researchRuns,
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
    scenario,
    alerts,
    backtests,
    bars,
    marketChart,
    assetContext,
  };
}
