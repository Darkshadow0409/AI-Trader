import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMarketCharts, mockRiskDetail, mockSignalDetail } from "../api/mockData";
import { PriceChart } from "./PriceChart";

vi.mock("lightweight-charts", () => {
  const series = () => ({
    setData: vi.fn(),
    createPriceLine: vi.fn(),
    setMarkers: vi.fn(),
  });
  return {
    CandlestickSeries: {},
    ColorType: { Solid: "solid" },
    HistogramSeries: {},
    LineSeries: {},
    createChart: vi.fn(() => ({
      addSeries: vi.fn(series),
      subscribeCrosshairMove: vi.fn(),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      remove: vi.fn(),
    })),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    }),
  });
});

describe("PriceChart", () => {
  it("restores persisted overlay and indicator preferences from local storage", () => {
    window.localStorage.setItem(
      "ai-trader:chart-display-prefs:v1",
      JSON.stringify({
        showMarkers: false,
        showLevels: false,
        showZones: true,
        showVolume: false,
      }),
    );

    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["WTI:1d"],
          available_timeframes: ["15m", "1h", "4h", "1d"],
        }}
        loading={false}
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-studies-group")).toHaveTextContent("Studies");
    expect(screen.getByTestId("chart-overlays-group")).toHaveTextContent("Overlays");
    expect(screen.getByRole("button", { name: "Markers" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "Levels" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "Zones" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Volume" })).not.toHaveClass("active");
  });

  it("renders real chart controls, fixture warning, and timeframe switching", async () => {
    const onTimeframeChange = vi.fn();
    const onRefresh = vi.fn();
    const user = userEvent.setup();

    render(
      <PriceChart
        chart={mockMarketCharts["BTC:1d"]}
        loading={false}
        onRefresh={onRefresh}
        onTimeframeChange={onTimeframeChange}
        selectedRisk={mockRiskDetail}
        selectedSignal={mockSignalDetail}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("price-chart-workspace")).toBeInTheDocument();
    expect(screen.getByText(/Fixture data only/i)).toBeInTheDocument();
    expect(screen.getByText(/Intraday timeframes are not available in fixture mode/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EMA 20" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Levels" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1d" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "15m" })).toBeDisabled();
    expect(screen.getByTestId("rsi-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh Current Mode" }));
    expect(onRefresh).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "RSI" }));
    expect(screen.queryByTestId("rsi-panel")).not.toBeInTheDocument();
  });

  it("shows explicit no-data state for unavailable timeframes", () => {
    render(<PriceChart chart={mockMarketCharts["BTC:15m"]} loading={false} onTimeframeChange={vi.fn()} timeframe="15m" />);

    expect(screen.getAllByText(/No 15m bars are available for BTC/i).length).toBeGreaterThan(0);
  });

  it("suppresses the generic syncing block when companion context already explains the chart state", () => {
    render(
      <PriceChart
        chart={mockMarketCharts["BTC:15m"]}
        loading
        onTimeframeChange={vi.fn()}
        selectedRisk={mockRiskDetail}
        selectedSignal={mockSignalDetail}
        timeframe="15m"
      />,
    );

    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
    expect(screen.getByText(/trend breakout \/ long/i)).toBeInTheDocument();
    expect(screen.getByText(/stop 68450.00 \/ medium/i)).toBeInTheDocument();
  });

  it("suppresses the generic syncing block when the chart already has explicit loading-state messaging", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["BTC:1d"],
          status: "loading",
          status_note: "Syncing chart data from the active backend.",
          available_timeframes: [],
          bars: [],
          indicators: { ema_20: [], ema_50: [], ema_200: [], rsi_14: [], atr_14: [] },
          overlays: { markers: [], price_lines: [], zones: [] },
        }}
        loading
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
    expect(screen.getByText(/Chart data is unavailable in the current mode, so timeframe controls are disabled\./i)).toBeInTheDocument();
    expect(screen.getByText(/No setup pinned/i)).toBeInTheDocument();
  });

  it("shows honest first chart snapshot preparation when no bars are available yet", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["WTI:1d"],
          status: "loading",
          status_note: "Startup warmup is still assembling the first truthful payload.",
          bars: [],
          indicators: { ema_20: [], ema_50: [], ema_200: [], rsi_14: [], atr_14: [] },
          overlays: { markers: [], price_lines: [], zones: [] },
          runtime_snapshot: null,
        }}
        loading
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-startup-state")).toHaveTextContent(/Preparing first chart snapshot/i);
    expect(screen.getByText(/stays advisory until usable bars and freshness state arrive/i)).toBeInTheDocument();
    expect(screen.getByTestId("chart-timeframe-status")).toHaveTextContent(/Preparing 1d chart/i);
    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
  });

  it("shows freshness check pending when cached chart context exists during refresh", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["WTI:1d"],
          runtime_snapshot: {
            source_status: "fresh",
            generated_at: "2026-04-01T06:15:00Z",
            age_minutes: 0,
            using_last_good_snapshot: false,
          },
        }}
        loading
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-startup-state")).toHaveTextContent(/Freshness check pending/i);
    expect(screen.getByText(/Cached chart context is loaded while the next freshness check completes/i)).toBeInTheDocument();
    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
  });

  it("keeps the last valid chart visible while making requested and displayed timeframes explicit", () => {
    const { container } = render(
      <PriceChart
        chart={mockMarketCharts["WTI:1d"]}
        awaitingLiveUpdate
        loading
        onTimeframeChange={vi.fn()}
        timeframe="4h"
      />,
    );

    expect(screen.getByTestId("chart-startup-state")).toHaveTextContent(/Switching timeframe context/i);
    expect(screen.getByText(/Showing the last verified 1d chart while the backend confirms 4h/i)).toBeInTheDocument();
    expect(screen.getByTestId("chart-timeframe-status")).toHaveTextContent(/Requested 4h \/ showing 1d until backend confirmation/i);
    expect(screen.getByTestId("timeframe-button-4h")).toHaveClass("active");
    expect(screen.getByTestId("timeframe-button-4h")).toHaveClass("pending");
    expect(screen.getByTestId("timeframe-button-4h")).toHaveAttribute("data-pending", "true");
    expect(screen.getByTestId("timeframe-button-1d")).toHaveClass("displayed");
    expect(screen.getByTestId("timeframe-button-1d")).toHaveAttribute("data-displayed", "true");
    expect(container.querySelector(".chart-canvas-empty")).toBeNull();
    expect(container.querySelector(".chart-canvas")).not.toBeNull();
  });

  it("keeps a previous 4h chart visible while a requested 1d chart is pending", () => {
    const { container } = render(
      <PriceChart
        chart={{
          ...mockMarketCharts["WTI:1d"],
          timeframe: "4h",
          available_timeframes: ["15m", "1h", "4h", "1d"],
        }}
        awaitingLiveUpdate
        loading
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-startup-state")).toHaveTextContent(/Switching timeframe context/i);
    expect(screen.getByText(/Showing the last verified 4h chart while the backend confirms 1d/i)).toBeInTheDocument();
    expect(screen.getByTestId("chart-timeframe-status")).toHaveTextContent(/Requested 1d \/ showing 4h until backend confirmation/i);
    expect(screen.getByTestId("timeframe-button-1d")).toHaveClass("pending");
    expect(screen.getByTestId("timeframe-button-4h")).toHaveClass("displayed");
    expect(container.querySelector(".chart-canvas-empty")).toBeNull();
    expect(container.querySelector(".chart-canvas")).not.toBeNull();
  });

  it("shows a compact live chart reconnecting note without changing the truth strip", () => {
    render(
      <PriceChart
        chart={mockMarketCharts["WTI:1d"]}
        loading={false}
        onTimeframeChange={vi.fn()}
        streamStatus="reconnecting"
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-live-status-note")).toHaveTextContent(/Live chart refresh reconnecting/i);
    expect(screen.getByText("Fallback Mode")).toBeInTheDocument();
    expect(screen.queryByText(/live now/i)).not.toBeInTheDocument();
  });

  it("renders a hidden transport debug node without changing trader-facing chart copy", () => {
    render(
      <PriceChart
        chart={mockMarketCharts["WTI:1d"]}
        loading={false}
        onTimeframeChange={vi.fn()}
        timeframe="1d"
        transportDebug={{
          baselineReceivedCount: 1,
          deltaReceivedCount: 2,
          deltaAppliedCount: 2,
          deltaRejectedCount: 0,
          restResyncRequestedCount: 0,
          restResyncCompletedCount: 0,
          lastEventKind: "probe_delta",
          lastVersion: 7,
          lastProbeNonce: "probe-123",
          lastRejectReason: null,
        }}
      />,
    );

    const debugNode = screen.getByTestId("chart-transport-debug");
    expect(debugNode).toHaveAttribute("data-baseline-count", "1");
    expect(debugNode).toHaveAttribute("data-delta-count", "2");
    expect(debugNode).toHaveAttribute("data-delta-applied-count", "2");
    expect(debugNode).toHaveAttribute("data-last-event-kind", "probe_delta");
    expect(debugNode).toHaveAttribute("data-last-version", "7");
    expect(debugNode).toHaveAttribute("data-resync-completed-count", "0");
    expect(screen.getByText("Fallback Mode")).toBeInTheDocument();
    expect(screen.queryByText(/probe delta/i)).not.toBeInTheDocument();
  });

  it("keeps the last valid chart visible and shows a disconnected warning on refresh failure", () => {
    const onRetry = vi.fn();
    render(<PriceChart chart={mockMarketCharts["BTC:1d"]} error="offline" loading={false} onRetry={onRetry} onTimeframeChange={vi.fn()} timeframe="1d" />);

    expect(screen.getByText(/Backend disconnected or chart data request failed/i)).toBeInTheDocument();
    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Disconnected/i);
    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Do not treat this chart as current live market truth/i);
    expect(screen.getByRole("button", { name: "Retry chart" })).toBeInTheDocument();
    expect(screen.queryByText(/No chart data/i)).not.toBeInTheDocument();
  });

  it("shows a no-data overlay and disabled unavailable timeframe controls", async () => {
    const user = userEvent.setup();
    const onTimeframeChange = vi.fn();
    render(<PriceChart chart={mockMarketCharts["BTC:15m"]} loading={false} onTimeframeChange={onTimeframeChange} timeframe="15m" />);

    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/No data/i);
    expect(screen.getByRole("button", { name: "15m" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "15m" })).toHaveAttribute("title", "Not available in current mode");

    await user.click(screen.getByRole("button", { name: "15m" }));
    expect(onTimeframeChange).not.toHaveBeenCalled();
  });

  it("shows a degraded overlay when chart freshness is degraded but bars remain visible", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["BTC:1d"],
          status: "degraded",
          freshness_state: "degraded",
          status_note: "Data freshness is degraded. Review the latest refresh before acting.",
        }}
        loading={false}
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Degraded/i);
    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Data freshness is degraded/i);
  });

  it("shows last verified chart context explicitly when commodity truth falls back", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["WTI:1d"],
          source_mode: "live",
          market_data_mode: "public_live",
          is_fixture_mode: false,
          commodity_truth: {
            truth_state: "ready_last_verified",
            truth_label: "Commodity truth recovering",
            truth_note: "Last verified delayed futures context is active while current truth recovery runs.",
            last_verified_at: "2026-04-01T06:00:00Z",
            last_verified_age_minutes: 18,
            recovery_in_progress: true,
            blocking_reason: "current_truth_stale_for_operator_use",
          },
        }}
        loading={false}
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Using last verified chart context/i);
  });

  it("shows a recovery-active chart note with the blocking reason when telemetry is active", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["WTI:1d"],
          source_mode: "live",
          market_data_mode: "public_live",
          is_fixture_mode: false,
          commodity_truth: {
            truth_state: "ready_last_verified",
            truth_label: "Commodity truth recovering",
            truth_note: "Last verified delayed futures context is active while current truth recovery runs.",
            last_verified_at: "2026-04-01T06:00:00Z",
            last_verified_age_minutes: 18,
            recovery_in_progress: true,
            blocking_reason: "current_truth_stale_for_operator_use",
          },
        }}
        loading={false}
        onTimeframeChange={vi.fn()}
        recoveryTelemetry={{
          truth_state: "ready_last_verified",
          truth_label: "Commodity truth recovering",
          recovery_active: true,
          recovery_reason: "current_truth_stale_for_operator_use",
          blocking_reason: "current_truth_stale_for_operator_use",
        }}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Recovery active because Current commodity truth is too stale for operator use/i);
  });

  it("renders a flagship USOUSD workspace header while keeping WTI as research context", () => {
    const onNavigateWorkspaceTarget = vi.fn();
    const onProposePaperTrade = vi.fn();

    render(
      <PriceChart
        chart={mockMarketCharts["WTI:1d"]}
        loading={false}
        onNavigateWorkspaceTarget={onNavigateWorkspaceTarget}
        onProposePaperTrade={onProposePaperTrade}
        onTimeframeChange={vi.fn()}
        proposalReady
        selectedRisk={mockRiskDetail}
        selectedSignal={mockSignalDetail}
        timeframe="1d"
      />,
    );

    expect(screen.getByText(/USOUSD \/\/ Crude Oil/i)).toBeInTheDocument();
    expect(screen.getByText(/WTI_CTX research context/i)).toBeInTheDocument();
    expect(screen.getByTestId("reality-strip")).toBeInTheDocument();
    expect(screen.getByTestId("chart-focus-context")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propose Paper Trade" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open AI Desk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Research" })).toBeInTheDocument();
  });

  it("prefers chart-selected truth over a conflicting shell fallback truth", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["WTI:1d"],
          selected_asset_truth: {
            symbol: "USOUSD",
            trader_facing_symbol: "USOUSD",
            research_symbol_if_any: "WTI_CTX",
            as_of: "2026-04-01T06:15:00Z",
            freshness_minutes: 10,
            source_mode: "last_verified",
            route_readiness: "ready_fallback",
            degraded_reason: "commodity_truth_recovering",
            is_proxy: true,
            confidence: 0.51,
          },
        }}
        loading={false}
        onTimeframeChange={vi.fn()}
        selectedAssetTruth={{
          symbol: "XAGUSD",
          trader_facing_symbol: "XAGUSD",
          research_symbol_if_any: "XAG_CTX",
          as_of: "2026-04-01T06:30:00Z",
          freshness_minutes: 1,
          source_mode: "primary_live",
          route_readiness: "ready_current",
          degraded_reason: null,
          is_proxy: false,
          confidence: 0.95,
        }}
        timeframe="1d"
      />,
    );

    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.getByText("Last verified")).toBeInTheDocument();
    expect(screen.getByText("Fallback active")).toBeInTheDocument();
    expect(screen.queryByText("Primary live")).not.toBeInTheDocument();
    expect(screen.getByText(/USOUSD \/\/ Crude Oil/i)).toBeInTheDocument();
    expect(screen.getByText(/WTI_CTX research context/i)).toBeInTheDocument();
  });

  it("shows a malformed-data state instead of crashing on invalid timestamps", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["BTC:1d"],
          bars: [{ ...mockMarketCharts["BTC:1d"].bars[0], timestamp: "not-a-timestamp" }],
        }}
        loading={false}
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByText(/malformed timestamps or invalid OHLC values/i)).toBeInTheDocument();
  });
});
