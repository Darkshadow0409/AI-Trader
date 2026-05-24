import { useEffect, useMemo, useState } from "react";
import { instrumentMappingExplainer } from "../lib/assetReadiness";
import { buildCanonicalChartContext } from "../lib/canonicalChartContext";
import { workspaceTabTarget, type WorkspaceRouteState, type WorkspaceTarget } from "../lib/workspaceNavigation";
import type { MarketChartView, PaperTradeDetailView, RecoveryTelemetryView, RiskDetailView, SelectedAssetTruthView, SignalDetailView, TradeTicketDetailView } from "../types/api";
import { formatDateTimeIST } from "../lib/time";
import { chartStateLabel, commodityTruthIsReadyCurrent, commodityTruthStateLabel, commodityTruthSummaryLabel, plainStatusLabel, recoveryReasonLabel, signalAgeLabel } from "../lib/uiLabels";
import { RealityStrip } from "./RealityStrip";
import { StateBlock } from "./StateBlock";
import { WorkspaceJumpRow } from "./WorkspaceJumpRow";
import { LightweightChartAdapter, buildLightweightChartModel } from "./LightweightChartAdapter";
import type { ChartTransportDebugState } from "../api/hooks";

interface PriceChartProps {
  chart: MarketChartView;
  timeframe: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  onTimeframeChange: (timeframe: string) => void;
  selectedAssetTruth?: SelectedAssetTruthView | null;
  selectedSignal?: SignalDetailView | null;
  selectedRisk?: RiskDetailView | null;
  selectedTicket?: TradeTicketDetailView | null;
  selectedTrade?: PaperTradeDetailView | null;
  proposalReady?: boolean | null;
  proposalNote?: string | null;
  proposalBusy?: boolean;
  proposalError?: string | null;
  onProposePaperTrade?: (signalId?: string | null, riskReportId?: string | null) => void;
  recoveryTelemetry?: RecoveryTelemetryView | null;
  onNavigateWorkspaceTarget?: (target: WorkspaceTarget) => void;
  workspaceBaseState?: WorkspaceRouteState;
  streamStatus?: "connecting" | "live" | "reconnecting" | "fallback_polling" | null;
  awaitingLiveUpdate?: boolean;
  transportDebug?: ChartTransportDebugState | null;
}

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const CHART_DISPLAY_STORAGE_KEY = "ai-trader:chart-display-prefs:v1";

interface ChartDisplayPreferences {
  showVolume: boolean;
  showRsi: boolean;
  showAtr: boolean;
  showEma20: boolean;
  showEma50: boolean;
  showEma200: boolean;
  showMarkers: boolean;
  showLevels: boolean;
  showZones: boolean;
}

const DEFAULT_CHART_DISPLAY_PREFERENCES: ChartDisplayPreferences = {
  showVolume: true,
  showRsi: true,
  showAtr: true,
  showEma20: true,
  showEma50: true,
  showEma200: true,
  showMarkers: true,
  showLevels: true,
  showZones: true,
};

function loadChartDisplayPreferences(): ChartDisplayPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_CHART_DISPLAY_PREFERENCES;
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return DEFAULT_CHART_DISPLAY_PREFERENCES;
    }
    const raw = storage.getItem(CHART_DISPLAY_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_DISPLAY_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<ChartDisplayPreferences>;
    return {
      ...DEFAULT_CHART_DISPLAY_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_CHART_DISPLAY_PREFERENCES;
  }
}

function assetWorkspaceSummary({
  traderSymbol,
  researchSymbol,
  chartStatus,
  executionGradeAllowed,
  selectedSignal,
  commodityTruthReady,
}: {
  traderSymbol: string;
  researchSymbol: string;
  chartStatus: string;
  executionGradeAllowed?: boolean;
  selectedSignal?: SignalDetailView | null;
  commodityTruthReady: boolean;
}): string {
  if (!commodityTruthReady) {
    return `${traderSymbol} is still running on delayed or recovering commodity truth. Keep the workspace research-first until current desk truth returns.`;
  }
  if (!executionGradeAllowed) {
    return `${traderSymbol} remains useful for structure and catalyst review, but timing is still proxy/public context rather than direct execution-grade truth.`;
  }
  if (chartStatus === "degraded" || chartStatus === "stale" || chartStatus === "unusable") {
    return `${traderSymbol} has a loaded chart, but the current market context is ${chartStatus.replace(/_/g, " ")}. Review levels and catalysts before promoting any next step.`;
  }
  if (selectedSignal) {
    return `${traderSymbol} is carrying the active ${selectedSignal.signal_type.replace(/_/g, " ")} setup. Use ${researchSymbol} only as underlying context, not the trader-facing instrument label.`;
  }
  return `${traderSymbol} is the current flagship board. Start with chart structure, then confirm freshness, catalysts, and risk before moving into tickets or review.`;
}

export function PriceChart({
  chart,
  timeframe,
  loading,
  error,
  onRetry,
  onRefresh,
  onTimeframeChange,
  selectedAssetTruth = null,
  selectedSignal,
  selectedRisk,
  selectedTicket,
  selectedTrade,
  proposalReady = null,
  proposalNote = null,
  proposalBusy = false,
  proposalError = null,
  onProposePaperTrade,
  recoveryTelemetry = null,
  onNavigateWorkspaceTarget,
  workspaceBaseState,
  streamStatus = null,
  awaitingLiveUpdate = false,
  transportDebug = null,
}: PriceChartProps) {
  const [displayPreferences, setDisplayPreferences] = useState<ChartDisplayPreferences>(() => loadChartDisplayPreferences());
  const chartContext = useMemo(() => buildCanonicalChartContext(chart, selectedAssetTruth), [chart, selectedAssetTruth]);
  const chartModel = useMemo(
    () =>
      buildLightweightChartModel({
        chart,
        selectedSignal,
        selectedRisk,
        selectedTicket,
        selectedTrade,
      }),
    [chart, selectedRisk, selectedSignal, selectedTicket, selectedTrade],
  );
  const [hoverBar, setHoverBar] = useState<MarketChartView["bars"][number] | null>(chartModel.latestBar);

  useEffect(() => {
    setHoverBar(chartModel.latestBar);
  }, [chartModel.latestBar]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storage = window.localStorage;
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    storage.setItem(CHART_DISPLAY_STORAGE_KEY, JSON.stringify(displayPreferences));
  }, [displayPreferences]);

  const showVolume = displayPreferences.showVolume;
  const showRsi = displayPreferences.showRsi;
  const showAtr = displayPreferences.showAtr;
  const showEma20 = displayPreferences.showEma20;
  const showEma50 = displayPreferences.showEma50;
  const showEma200 = displayPreferences.showEma200;
  const showMarkers = displayPreferences.showMarkers;
  const showLevels = displayPreferences.showLevels;
  const showZones = displayPreferences.showZones;
  const toggleDisplayPreference = (key: keyof ChartDisplayPreferences) => {
    setDisplayPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const latestBar = chartModel.latestBar;
  const malformedBarCount = chartModel.malformedBarCount;
  const malformed = chart.bars.length > 0 && chartModel.validBars.length === 0;
  const unavailable = chart.status === "no_data" || malformed;
  const hasRenderableChart = !unavailable && chartModel.validBars.length > 0;
  const canRenderChart = hasRenderableChart;
  const commodityTruth = chart.commodity_truth ?? null;
  const chartRuntimeSnapshot = chart.runtime_snapshot ?? null;
  const commodityTruthReady = commodityTruthIsReadyCurrent(commodityTruth);
  const displayedTimeframe = chart.timeframe || timeframe;
  const timeframeSwitching = Boolean(loading) && hasRenderableChart && displayedTimeframe !== timeframe;
  const timeframeStatusLabel = timeframeSwitching
    ? `Requested ${timeframe} / showing ${displayedTimeframe} until backend confirmation`
    : loading && !hasRenderableChart
      ? `Preparing ${timeframe} chart`
      : `Showing ${displayedTimeframe}`;
  const fallbackTimeframe = chart.available_timeframes.includes("1d") ? "1d" : chart.available_timeframes[0] ?? null;
  const shouldOfferFallbackTimeframe = unavailable && fallbackTimeframe !== null && fallbackTimeframe !== timeframe;
  const chartRecoveryReason =
    recoveryTelemetry?.blocking_reason
    ?? recoveryTelemetry?.recovery_reason
    ?? commodityTruth?.blocking_reason
    ?? "";
  const chartRecoveryNote = recoveryTelemetry?.recovery_active
    ? chartRecoveryReason
      ? `Recovery active because ${recoveryReasonLabel(chartRecoveryReason)}.`
      : "Recovery active while commodity truth reconciles."
    : null;
  const chartStartupLabel = loading
    ? chartModel.validBars.length === 0 && chartRuntimeSnapshot === null
      ? "Preparing first chart snapshot"
      : timeframeSwitching
        ? "Switching timeframe context"
      : "Freshness check pending"
    : null;
  const chartStartupBody = chartStartupLabel === "Preparing first chart snapshot"
    ? `The ${timeframe} chart is warming from backend truth. This board stays advisory until usable bars and freshness state arrive.`
    : chartStartupLabel === "Switching timeframe context"
      ? awaitingLiveUpdate
        ? `Showing the last verified ${displayedTimeframe} chart while the backend confirms ${timeframe}.`
        : `Showing the last verified ${displayedTimeframe} chart while the ${timeframe} snapshot loads.`
      : chartStartupLabel === "Freshness check pending"
      ? `${chartRecoveryNote ? `${chartRecoveryNote} ` : ""}Cached chart context is loaded while the next freshness check completes.`.trim()
      : null;
  const liveChartStatusNote = streamStatus === "reconnecting"
    ? "Live chart refresh reconnecting. Keeping the last verified backend chart visible."
    : streamStatus === "fallback_polling"
      ? "Live chart push is unavailable. Falling back to slower backend refresh."
      : streamStatus === "connecting" && hasRenderableChart
        ? "Waiting for the next backend chart push."
        : null;
  const overlayTone = error || chart.status === "unusable" || chart.status === "degraded" || chart.status === "stale" ? "warning" : "default";
  const overlayLabel = error
    ? "Disconnected"
    : commodityTruth?.truth_state === "ready_last_verified"
      ? "Using last verified chart context"
    : commodityTruth && !commodityTruthReady
      ? commodityTruthStateLabel(commodityTruth)
    : chart.status === "unusable"
      ? "Unusable"
      : chart.status === "degraded"
        ? "Degraded"
      : chart.status === "no_data"
        ? "No data"
        : chart.status === "stale"
          ? "Stale"
          : chart.is_fixture_mode
            ? "Fixture"
            : null;
  const overlayBody = error
    ? "Backend disconnected. Last valid bars remain visible until refresh succeeds."
    : commodityTruth?.truth_state === "ready_last_verified"
      ? `${commodityTruthSummaryLabel(commodityTruth)}${chartRecoveryNote ? ` ${chartRecoveryNote}` : ""}`.trim()
    : commodityTruth && !commodityTruthReady
      ? `${chartRecoveryNote ? `${chartRecoveryNote} ` : ""}${commodityTruthSummaryLabel(commodityTruth)}`.trim()
    : chart.status === "unusable"
      ? chart.status_note || "Current market context is unusable in this mode."
      : chart.status === "degraded"
        ? chart.status_note || "Visible bars are available for research, but the current market context is degraded."
      : chart.status === "no_data"
        ? chart.status_note || "No usable chart data available."
        : chart.status === "stale"
          ? chart.status_note || "Visible bars are stale for the current mode."
          : chart.is_fixture_mode
            ? "Fixture data only. Suitable for research, review, and paper workflow, not live market claims."
            : "";
  const executionGradeNote = chart.data_reality?.execution_grade_allowed
    ? "Execution-capable timing"
    : "Not execution-grade";
  const stateLabel = error
    ? "Backend disconnected or chart data request failed."
    : malformed
      ? "Chart data loaded with malformed timestamps or invalid OHLC values. The panel is keeping the rest of the workspace alive."
      : unavailable
      ? chart.status === "no_data" && chart.bars.length === 0
        ? "No usable chart data available."
        : chart.status_note
      : null;
  const timeframeReason = chart.available_timeframes.length === 0
    ? canRenderChart
      ? "Timeframe metadata is unavailable in the current mode. The loaded chart remains visible for research only."
      : "Chart data is unavailable in the current mode, so timeframe controls are disabled."
    : chart.is_fixture_mode && !chart.available_timeframes.includes("15m")
      ? "Intraday timeframes are not available in fixture mode."
      : unavailable
        ? chart.status_note || "Selected timeframe is unavailable in the current mode."
        : null;
  const availableTimeframeLabel = chart.available_timeframes.length > 0
    ? chart.available_timeframes.join(", ")
    : canRenderChart
      ? "loaded chart only"
      : "none";
  const mappingExplainer = instrumentMappingExplainer(chart.instrument_mapping);
  const selectedDisplaySymbol = selectedSignal?.display_symbol ?? chartContext.traderFacingSymbol;
  const selectedSignalStatus = String(selectedSignal?.features.setup_status ?? "candidate").replace(/_/g, " ");
  const selectedSignalTrigger = String(selectedSignal?.features.trigger_timeframe ?? "n/a");
  const selectedSignalAge = selectedSignal ? signalAgeLabel(selectedSignal.freshness_minutes) : "no live signal";
  const proposalRiskId = selectedSignal?.related_risk?.risk_report_id ?? selectedRisk?.risk_report_id ?? null;
  const whyNow = Array.isArray(selectedSignal?.features.why_now) && selectedSignal.features.why_now.length > 0
    ? String(selectedSignal.features.why_now[0])
    : null;
  const latestCatalystHeadline = selectedSignal?.catalyst_news?.[0]?.title ?? null;
  const latestCatalystFreshness = selectedSignal?.catalyst_news?.[0]?.freshness_minutes ?? null;
  const selectedAssetSummary = assetWorkspaceSummary({
    traderSymbol: chartContext.traderFacingSymbol,
    researchSymbol: chartContext.researchSymbol ?? chart.instrument_mapping.research_symbol,
    chartStatus: chart.status,
    executionGradeAllowed: chart.data_reality?.execution_grade_allowed,
    selectedSignal,
    commodityTruthReady,
  });
  const assetHeaderLabel = chartContext.assetHeaderLabel;
  const selectedAssetAction = selectedSignal
    ? `${selectedSignal.direction} setup is still the active lane. Validate freshness, catalyst pressure, and the loaded risk frame before promoting the next step.`
    : "Confirm chart freshness and catalyst context before loading a setup.";
  const proposalGuidance = proposalNote ?? (!selectedSignal
    ? "No setup is pinned yet. Use the chart to confirm structure before opening a paper-only workflow."
    : !commodityTruthReady
      ? "Commodity truth is still delayed or recovering. Keep the next step research-first or review-first until current desk truth returns."
      : chart.status === "degraded" || chart.status === "stale" || chart.status === "unusable"
        ? "Chart timing is not fully current-ready. Keep any next step inside review or paper-only workflow."
        : chart.data_reality && !chart.data_reality.execution_grade_allowed
          ? "Current context is still non-execution-grade. Keep the setup in advisory and paper-trading review lanes."
          : "Current signal and risk context are loaded. Use the next step to carry the setup into the paper-trading review lane.");
  const nextStepLabel = proposalBusy
    ? "Proposal in progress"
    : proposalReady === false
      ? "Review-first paper lane"
      : selectedTrade
        ? `Trade ${selectedTrade.status.replace(/_/g, " ")}`
        : selectedTicket
          ? `Ticket ${selectedTicket.status.replace(/_/g, " ")}`
          : selectedSignal
            ? "Paper proposal ready"
            : "Awaiting setup";
  const nextStepCarry = selectedTrade
    ? `Trade thread ${selectedTrade.trade_id} is already carrying this setup${selectedTrade.review_due ? " and review is due." : "."}`
    : selectedTicket
      ? `Ticket ${selectedTicket.ticket_id} is already tracking this setup in ${selectedTicket.status.replace(/_/g, " ")} state.`
      : selectedAssetAction;
  const hasChartCompanionContext =
    Boolean(selectedSignal)
    || Boolean(selectedRisk)
    || Boolean(selectedTicket)
    || Boolean(selectedTrade)
    || Boolean(commodityTruth)
    || Boolean(chart.data_reality);
  const hasDedicatedChartMessaging =
    hasChartCompanionContext
    || Boolean(chartStartupLabel)
    || Boolean(timeframeReason)
    || Boolean(stateLabel)
    || Boolean(overlayLabel)
    || chart.status === "loading";
  const showGenericChartLoading = Boolean(loading) && !hasDedicatedChartMessaging;

  return (
    <div className="chart-workspace terminal-chart-workspace" data-testid="price-chart-workspace">
      <div className="panel-header asset-workspace-header">
        <div className="asset-hero-copy">
          <p className="eyebrow">Selected Asset Workspace</p>
          <h3>{assetHeaderLabel}</h3>
          <div className="asset-hero-identity">
            <strong>{selectedDisplaySymbol}</strong>
            <span>{chart.instrument_mapping.display_name}</span>
            <span>{chartContext.researchSymbol ?? chart.instrument_mapping.research_symbol} research context</span>
            <span>{timeframeSwitching ? `${timeframe} requested / ${displayedTimeframe} shown` : `${displayedTimeframe} board`}</span>
          </div>
          <p className="asset-hero-summary">{selectedAssetSummary}</p>
          <RealityStrip
            chart={chart}
            commodityTruth={commodityTruth}
            mapping={chart.instrument_mapping}
            reality={chart.data_reality}
            recovery={recoveryTelemetry}
            className="asset-reality-strip"
          />
          <WorkspaceJumpRow
            actions={[
              {
                key: "asset-ai-desk",
                label: "Open AI Desk",
                target: workspaceTabTarget("ai_desk", { symbol: chartContext.traderFacingSymbol }),
              },
              {
                key: "asset-research",
                label: "Open Research",
                target: workspaceTabTarget("research", { symbol: chartContext.traderFacingSymbol }),
              },
            ]}
            baseState={workspaceBaseState}
            onNavigate={onNavigateWorkspaceTarget}
          />
          <div className="asset-hero-meta">
            <small className="compact-copy">Visible bar (IST) {latestBar ? formatDateTimeIST(latestBar.timestamp) : "n/a"}</small>
            {mappingExplainer ? <small className="compact-copy">{mappingExplainer}</small> : null}
          </div>
        </div>
        <div className="asset-hero-aside">
          <div className="signal-companion-section asset-hero-state-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Board State</p>
                <h4>Current market posture</h4>
              </div>
            </div>
            <div className="metric-strip compact-metrics chart-truth-strip">
              <div>
                <span className="metric-label">Data State</span>
                <strong>{chartContext.stateLabel}</strong>
              </div>
              <div>
                <span className="metric-label">Last Update</span>
                <strong>{chartContext.freshnessLabel}</strong>
              </div>
              <div>
                <span className="metric-label">Source Family</span>
                <strong>{chartContext.sourceFamilyLabel}</strong>
              </div>
              <div>
                <span className="metric-label">Fallback Mode</span>
                <strong>{chartContext.fallbackLabel}</strong>
              </div>
            </div>
            <small>{chartContext.marketDataLabel} / chart {chartStateLabel(chart.status)}</small>
            <small>{chart.instrument_mapping.broker_truth ? "Trader-facing board is broker-aligned." : executionGradeNote}</small>
          </div>
          <div className="chart-focus-strip chart-support-rail" data-testid="chart-focus-context">
            <article className="chart-focus-card">
              <span className="metric-label">Setup</span>
              <strong>{selectedSignal ? `${selectedSignal.signal_type.replace(/_/g, " ")} / ${selectedSignal.direction}` : "No setup pinned"}</strong>
              <small>
                {selectedSignal
                  ? `${selectedSignalStatus} / trigger ${selectedSignalTrigger} / ${selectedSignalAge}`
                  : "Load a setup in the chart lane before moving into tickets or review."}
              </small>
            </article>
            <article className="chart-focus-card">
              <span className="metric-label">Risk</span>
              <strong>
                {selectedRisk
                  ? `stop ${selectedRisk.stop_price.toFixed(2)} / ${plainStatusLabel(selectedRisk.size_band)}`
                  : selectedSignal
                    ? `invalidation ${selectedSignal.invalidation.toFixed(2)}`
                    : "No risk frame pinned"}
              </strong>
              <small>
                {selectedSignal
                  ? `target ${selectedSignal.targets.base?.toFixed(2)} / stretch ${selectedSignal.targets.stretch?.toFixed(2) ?? "n/a"}`
                  : "Pin invalidation and target framing from signal or risk context."}
                {selectedRisk
                  ? ` / budget ${selectedRisk.max_portfolio_risk_pct.toFixed(3)}% / cluster ${plainStatusLabel(selectedRisk.exposure_cluster)}`
                  : ""}
              </small>
            </article>
            <article className="chart-focus-card">
              <span className="metric-label">Catalyst</span>
              <strong>{whyNow ?? latestCatalystHeadline ?? "No catalyst summary pinned"}</strong>
              <small>
                {latestCatalystHeadline
                  ? `${latestCatalystHeadline}${latestCatalystFreshness !== null ? ` / ${latestCatalystFreshness}m old` : ""}`
                  : "Use the companion lane for fuller evidence and crowd context."}
              </small>
            </article>
            <article className="chart-focus-card chart-next-step-card">
              <span className="metric-label">Next step</span>
              <strong>{nextStepLabel}</strong>
              <small>{nextStepCarry}</small>
              <small>{proposalGuidance}</small>
              {proposalError ? <small>{proposalError}</small> : null}
              {onProposePaperTrade ? (
                <button
                  className="action-button"
                  disabled={proposalBusy || !selectedSignal || proposalReady === false}
                  onClick={() => onProposePaperTrade(selectedSignal?.signal_id, proposalRiskId)}
                  type="button"
                >
                  {proposalBusy ? "Proposing…" : proposalReady === false ? "Review Before Proposal" : "Propose Paper Trade"}
                </button>
              ) : null}
              <small>Advisory-only. Paper workflow only.</small>
            </article>
          </div>
        </div>
      </div>

      <div className="chart-toolbar terminal-chart-toolbar">
        <div className="inline-tags chart-timeframe-controls" data-testid="chart-timeframe-controls">
          {TIMEFRAMES.map((value) => {
            const available = chart.available_timeframes.includes(value);
            const requested = timeframe === value;
            const displayed = displayedTimeframe === value;
            const pending = timeframeSwitching && requested;
            const className = [
              "pill",
              "timeframe-pill",
              requested ? "active" : "",
              displayed && !requested ? "displayed" : "",
              pending ? "pending" : "",
            ].filter(Boolean).join(" ");
            const title = !available
              ? "Not available in current mode"
              : pending
                ? `${value} requested. Showing ${displayedTimeframe} until backend confirmation.`
                : displayed
                  ? `${value} currently shown`
                  : `${value} timeframe`;
            return (
              <button
                aria-busy={pending ? true : undefined}
                aria-current={displayed ? "true" : undefined}
                aria-pressed={requested}
                className={className}
                data-displayed={displayed ? "true" : "false"}
                data-pending={pending ? "true" : "false"}
                data-requested={requested ? "true" : "false"}
                data-testid={`timeframe-button-${value}`}
                disabled={!available}
                key={value}
                onClick={() => available && !requested && onTimeframeChange(value)}
                title={title}
                type="button"
              >
                <span>{value}</span>
                {pending ? <small aria-hidden="true">Pending</small> : displayed && timeframeSwitching ? <small aria-hidden="true">Shown</small> : null}
              </button>
            );
          })}
          <span className={timeframeSwitching ? "chart-timeframe-status pending" : "chart-timeframe-status"} data-testid="chart-timeframe-status">
            {timeframeStatusLabel}
          </span>
        </div>
          <div className="inline-tags">
            {onRefresh ? (
              <button className="action-button" onClick={onRefresh} type="button">
                Refresh Current Mode
              </button>
            ) : null}
            <div className="chart-toggle-groups">
              <div className="chart-toggle-group" data-testid="chart-studies-group">
                <span className="metric-label">Studies</span>
                <div className="chart-toggle-row">
                  <button className={showEma20 ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showEma20")} type="button">EMA 20</button>
                  <button className={showEma50 ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showEma50")} type="button">EMA 50</button>
                  <button className={showEma200 ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showEma200")} type="button">EMA 200</button>
                  <button className={showRsi ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showRsi")} type="button">RSI</button>
                  <button className={showAtr ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showAtr")} type="button">ATR</button>
                  <button className={showVolume ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showVolume")} type="button">Volume</button>
                </div>
              </div>
              <div className="chart-toggle-group" data-testid="chart-overlays-group">
                <span className="metric-label">Overlays</span>
                <div className="chart-toggle-row">
                  <button className={showMarkers ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showMarkers")} type="button">Markers</button>
                  <button className={showLevels ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showLevels")} type="button">Levels</button>
                  <button className={showZones ? "pill active" : "pill"} onClick={() => toggleDisplayPreference("showZones")} type="button">Zones</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      {timeframeReason ? <div className="state-block">{timeframeReason}</div> : null}
      {chartStartupLabel ? (
        <div className="state-block" data-testid="chart-startup-state">
          <div>{chartStartupLabel}</div>
          {chartStartupBody ? <div>{chartStartupBody}</div> : null}
        </div>
      ) : null}
      {liveChartStatusNote ? (
        <div className="state-block" data-testid="chart-live-status-note">
          <div>{liveChartStatusNote}</div>
        </div>
      ) : null}
      {transportDebug ? (
        <div
          aria-hidden="true"
          className="chart-transport-debug"
          data-baseline-count={transportDebug.baselineReceivedCount}
          data-delta-applied-count={transportDebug.deltaAppliedCount}
          data-delta-count={transportDebug.deltaReceivedCount}
          data-delta-rejected-count={transportDebug.deltaRejectedCount}
          data-last-event-kind={transportDebug.lastEventKind ?? ""}
          data-last-probe-nonce={transportDebug.lastProbeNonce ?? ""}
          data-last-reject-reason={transportDebug.lastRejectReason ?? ""}
          data-last-version={transportDebug.lastVersion ?? ""}
          data-resync-count={transportDebug.restResyncRequestedCount}
          data-resync-completed-count={transportDebug.restResyncCompletedCount}
          data-testid="chart-transport-debug"
        />
      ) : null}

      <div className="metric-strip compact-metrics chart-data-strip">
        <div>
          <span className="metric-label">Cursor</span>
          <strong>{hoverBar ? formatDateTimeIST(hoverBar.timestamp) : "n/a"}</strong>
        </div>
        <div>
          <span className="metric-label">OHLC</span>
          <strong>
            {hoverBar ? `${hoverBar.open.toFixed(2)} / ${hoverBar.high.toFixed(2)} / ${hoverBar.low.toFixed(2)} / ${hoverBar.close.toFixed(2)}` : "n/a"}
          </strong>
        </div>
        <div>
          <span className="metric-label">Volume</span>
          <strong>{hoverBar ? hoverBar.volume.toFixed(0) : "n/a"}</strong>
        </div>
        <div>
          <span className="metric-label">Chart State</span>
          <strong>{chartStateLabel(chart.status)}</strong>
        </div>
        <div>
          <span className="metric-label">Available TF</span>
          <strong>{availableTimeframeLabel}</strong>
        </div>
        <div>
          <span className="metric-label">Malformed Bars</span>
          <strong>{malformedBarCount}</strong>
        </div>
      </div>
      <StateBlock
        actionLabel={!canRenderChart && error ? "Retry chart" : shouldOfferFallbackTimeframe ? `Switch to ${fallbackTimeframe}` : undefined}
        empty={!canRenderChart && unavailable}
        emptyLabel={stateLabel ?? "No chart data."}
        error={!canRenderChart && error ? stateLabel : null}
        loading={showGenericChartLoading}
        onAction={
          !canRenderChart && error
            ? onRetry
            : shouldOfferFallbackTimeframe && fallbackTimeframe
              ? () => onTimeframeChange(fallbackTimeframe)
              : undefined
        }
      />

      <div className="chart-banners">
        {!chart.instrument_mapping.broker_truth ? <div className="state-block">{chart.instrument_mapping.mapping_notes}</div> : null}
        {error ? (
          <div className="state-block state-error">
            <div>{stateLabel}</div>
            {onRetry ? (
              <button className="text-button state-action" onClick={onRetry} type="button">
                Retry chart
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <LightweightChartAdapter
        canRenderChart={canRenderChart}
        model={chartModel}
        onHoverBarChange={setHoverBar}
        overlay={overlayLabel ? (
          <div className={`chart-state-overlay ${overlayTone}`} data-testid="chart-state-overlay">
            <strong>{overlayLabel}</strong>
            <span>{overlayBody}</span>
            <span>Do not treat this chart as current live market truth unless the mode and freshness state explicitly support it.</span>
            {!chart.instrument_mapping.broker_truth ? <span>Current mapping uses proxy/public fallback rather than direct broker-truth pricing.</span> : null}
            {onRefresh ? (
              <button className="text-button" onClick={onRefresh} type="button">
                Refresh Data
              </button>
            ) : null}
          </div>
        ) : null}
        showAtr={showAtr}
        showEma20={showEma20}
        showEma50={showEma50}
        showEma200={showEma200}
        showLevels={showLevels}
        showMarkers={showMarkers}
        showRsi={showRsi}
        showVolume={showVolume}
        showZones={showZones}
      />
    </div>
  );
}
