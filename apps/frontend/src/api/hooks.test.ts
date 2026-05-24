import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockMarketCharts } from "./mockData";
import { apiClient } from "./client";
import { canHydrateSelection, useLiveMarketChart } from "./hooks";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];
  url: string;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(message: string) {
    this.sentMessages.push(message);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

afterEach(() => {
  MockWebSocket.instances = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("canHydrateSelection", () => {
  it("allows hydration when the selected id is known for the current symbol", () => {
    expect(canHydrateSelection("sig_live", ["sig_live", "sig_other"])).toBe(true);
    expect(canHydrateSelection("risk_live", ["risk_live", null])).toBe(true);
  });

  it("blocks hydration when the selected id is stale and current-symbol ids are known", () => {
    expect(canHydrateSelection("sig_stale", ["sig_live", "sig_other"])).toBe(false);
    expect(canHydrateSelection("risk_stale", ["risk_live"])).toBe(false);
  });

  it("keeps hydration available while current-symbol ids are still unknown", () => {
    expect(canHydrateSelection("sig_pending", [])).toBe(true);
    expect(canHydrateSelection("risk_pending", [null, undefined])).toBe(true);
    expect(canHydrateSelection(null, ["sig_live"])).toBe(false);
  });
});

describe("useLiveMarketChart", () => {
  it("hydrates from REST and then accepts matching websocket chart payloads", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(apiClient, "marketChartSocketUrl").mockReturnValue("ws://127.0.0.1:8011/ws/updates");
    vi.spyOn(apiClient, "marketChart").mockResolvedValue(mockMarketCharts["WTI:1d"]);

    const { result } = renderHook(() => useLiveMarketChart("USOUSD", "1d", true));

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.data.instrument_mapping.trader_symbol).toBe("USOUSD");
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].sentMessages[0]).toContain("\"type\":\"subscribe_market_chart\"");

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart",
        symbol: "USOUSD",
        timeframe: "1d",
        version: 1,
        payload: {
          ...mockMarketCharts["WTI:1d"],
          status_note: "Streamed backend chart payload",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.data.status_note).toBe("Streamed backend chart payload");
      expect(result.current.streamStatus).toBe("live");
      expect(result.current.loading).toBe(false);
    });
  });

  it("ignores stale websocket messages for a different timeframe", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(apiClient, "marketChartSocketUrl").mockReturnValue("ws://127.0.0.1:8011/ws/updates");
    vi.spyOn(apiClient, "marketChart").mockResolvedValue(mockMarketCharts["WTI:1d"]);

    const { result } = renderHook(() => useLiveMarketChart("USOUSD", "1d", true));

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart",
        symbol: "USOUSD",
        timeframe: "4h",
        version: 1,
        payload: {
          ...mockMarketCharts["WTI:1d"],
          timeframe: "4h",
          status_note: "Wrong timeframe",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.data.timeframe).toBe("1d");
      expect(result.current.data.status_note).not.toBe("Wrong timeframe");
    });
  });

  it("applies matching chart deltas without re-entering loading", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(apiClient, "marketChartSocketUrl").mockReturnValue("ws://127.0.0.1:8011/ws/updates");
    vi.spyOn(apiClient, "marketChart").mockResolvedValue(mockMarketCharts["WTI:1d"]);

    const { result } = renderHook(() => useLiveMarketChart("USOUSD", "1d", true));

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart",
        symbol: "USOUSD",
        timeframe: "1d",
        version: 1,
        payload: mockMarketCharts["WTI:1d"],
      });
    });

    await waitFor(() => {
      expect(result.current.streamStatus).toBe("live");
    });

    const appendedBar = {
      symbol: "WTI",
      timestamp: "2026-03-16T11:30:00Z",
      open: 79.2,
      high: 79.8,
      low: 78.9,
      close: 79.5,
      volume: 182400,
    };

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart_delta",
        symbol: "USOUSD",
        timeframe: "1d",
        base_version: 1,
        version: 2,
        meta: {
          status: mockMarketCharts["WTI:1d"].status,
          status_note: "Delta applied",
          source_mode: mockMarketCharts["WTI:1d"].source_mode,
          market_data_mode: mockMarketCharts["WTI:1d"].market_data_mode,
          freshness_minutes: 9,
          freshness_state: "stale",
          data_quality: mockMarketCharts["WTI:1d"].data_quality,
          is_fixture_mode: mockMarketCharts["WTI:1d"].is_fixture_mode,
          available_timeframes: mockMarketCharts["WTI:1d"].available_timeframes,
          instrument_mapping: mockMarketCharts["WTI:1d"].instrument_mapping,
          data_reality: mockMarketCharts["WTI:1d"].data_reality,
          commodity_truth: mockMarketCharts["WTI:1d"].commodity_truth,
          selected_asset_truth: mockMarketCharts["WTI:1d"].selected_asset_truth,
          runtime_snapshot: mockMarketCharts["WTI:1d"].runtime_snapshot,
        },
        delta: {
          bars: {
            mode: "tail_replace",
            start_index: mockMarketCharts["WTI:1d"].bars.length,
            items: [appendedBar],
          },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.data.status_note).toBe("Delta applied");
      expect(result.current.data.bars[result.current.data.bars.length - 1]?.timestamp).toBe("2026-03-16T11:30:00Z");
      expect(result.current.loading).toBe(false);
      expect(result.current.transportDebug.deltaReceivedCount).toBe(1);
      expect(result.current.transportDebug.deltaAppliedCount).toBe(1);
    });
  });

  it("guards a REST resync after rejecting a stale delta", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(apiClient, "marketChartSocketUrl").mockReturnValue("ws://127.0.0.1:8011/ws/updates");
    const marketChartSpy = vi.spyOn(apiClient, "marketChart").mockResolvedValue(mockMarketCharts["WTI:1d"]);

    const { result } = renderHook(() => useLiveMarketChart("USOUSD", "1d", true));

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart",
        symbol: "USOUSD",
        timeframe: "1d",
        version: 3,
        payload: mockMarketCharts["WTI:1d"],
      });
    });

    await waitFor(() => {
      expect(result.current.streamStatus).toBe("live");
    });

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart_delta",
        symbol: "USOUSD",
        timeframe: "1d",
        base_version: 1,
        version: 4,
        meta: {
          status: mockMarketCharts["WTI:1d"].status,
          status_note: "Stale delta",
          source_mode: mockMarketCharts["WTI:1d"].source_mode,
          market_data_mode: mockMarketCharts["WTI:1d"].market_data_mode,
          freshness_minutes: mockMarketCharts["WTI:1d"].freshness_minutes,
          freshness_state: mockMarketCharts["WTI:1d"].freshness_state,
          data_quality: mockMarketCharts["WTI:1d"].data_quality,
          is_fixture_mode: mockMarketCharts["WTI:1d"].is_fixture_mode,
          available_timeframes: mockMarketCharts["WTI:1d"].available_timeframes,
          instrument_mapping: mockMarketCharts["WTI:1d"].instrument_mapping,
          data_reality: mockMarketCharts["WTI:1d"].data_reality,
          commodity_truth: mockMarketCharts["WTI:1d"].commodity_truth,
          selected_asset_truth: mockMarketCharts["WTI:1d"].selected_asset_truth,
          runtime_snapshot: mockMarketCharts["WTI:1d"].runtime_snapshot,
        },
        delta: {
          bars: {
            mode: "tail_replace",
            start_index: mockMarketCharts["WTI:1d"].bars.length,
            items: [],
          },
        },
      });
    });

    await waitFor(() => {
      expect(marketChartSpy).toHaveBeenCalledTimes(2);
      expect(result.current.loading).toBe(false);
      expect(result.current.data.status_note).not.toBe("Stale delta");
      expect(result.current.transportDebug.deltaRejectedCount).toBe(1);
      expect(result.current.transportDebug.restResyncRequestedCount).toBe(1);
      expect(result.current.transportDebug.restResyncCompletedCount).toBe(1);
      expect(result.current.transportDebug.lastRejectReason).toBe("stale_version");
    });
  });

  it("exposes hidden chart debug state and accepts a probe-triggered empty delta", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(apiClient, "marketChartSocketUrl").mockReturnValue("ws://127.0.0.1:8011/ws/updates");
    vi.spyOn(apiClient, "marketChart").mockResolvedValue(mockMarketCharts["WTI:1d"]);

    const { result } = renderHook(() => useLiveMarketChart("USOUSD", "1d", true));

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(window.__AI_TRADER_CHART_DEBUG__).toBeDefined();
    });

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart",
        symbol: "USOUSD",
        timeframe: "1d",
        version: 4,
        payload: mockMarketCharts["WTI:1d"],
        transport: {
          event_kind: "baseline",
          event_id: "evt-baseline",
          emitted_at: "2026-04-25T10:00:00Z",
          version: 4,
          proof_nonce: null,
          reason: "subscription",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.transportDebug.baselineReceivedCount).toBe(1);
      expect(result.current.transportDebug.lastVersion).toBe(4);
    });

    expect(window.__AI_TRADER_CHART_DEBUG__?.requestDeltaProbe()).toBe(true);
    expect(window.__AI_TRADER_CHART_DEBUG__?.requestRejectedDeltaProbe).toBeTypeOf("function");
    expect(MockWebSocket.instances[0].sentMessages[MockWebSocket.instances[0].sentMessages.length - 1]).toContain("\"type\":\"verify_market_chart_delta\"");
    expect(MockWebSocket.instances[0].sentMessages[MockWebSocket.instances[0].sentMessages.length - 1]).toContain("\"probe_kind\":\"accepted\"");

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart_delta",
        symbol: "USOUSD",
        timeframe: "1d",
        base_version: 4,
        version: 5,
        meta: {
          status: mockMarketCharts["WTI:1d"].status,
          status_note: mockMarketCharts["WTI:1d"].status_note,
          source_mode: mockMarketCharts["WTI:1d"].source_mode,
          market_data_mode: mockMarketCharts["WTI:1d"].market_data_mode,
          freshness_minutes: mockMarketCharts["WTI:1d"].freshness_minutes,
          freshness_state: mockMarketCharts["WTI:1d"].freshness_state,
          data_quality: mockMarketCharts["WTI:1d"].data_quality,
          is_fixture_mode: mockMarketCharts["WTI:1d"].is_fixture_mode,
          available_timeframes: mockMarketCharts["WTI:1d"].available_timeframes,
          instrument_mapping: mockMarketCharts["WTI:1d"].instrument_mapping,
          data_reality: mockMarketCharts["WTI:1d"].data_reality,
          commodity_truth: mockMarketCharts["WTI:1d"].commodity_truth,
          selected_asset_truth: mockMarketCharts["WTI:1d"].selected_asset_truth,
          runtime_snapshot: mockMarketCharts["WTI:1d"].runtime_snapshot,
        },
        delta: {},
        transport: {
          event_kind: "probe_delta",
          event_id: "evt-probe",
          emitted_at: "2026-04-25T10:00:05Z",
          version: 5,
          proof_nonce: "probe-123",
          reason: "verification_probe",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.transportDebug.deltaReceivedCount).toBe(1);
      expect(result.current.transportDebug.deltaAppliedCount).toBe(1);
      expect(result.current.transportDebug.lastEventKind).toBe("probe_delta");
      expect(result.current.transportDebug.lastVersion).toBe(5);
      expect(result.current.transportDebug.lastProbeNonce).toBe("probe-123");
      expect(result.current.transportDebug.restResyncRequestedCount).toBe(0);
      expect(result.current.transportDebug.restResyncCompletedCount).toBe(0);
      expect(window.__AI_TRADER_CHART_DEBUG__?.deltaAppliedCount).toBe(1);
      expect(window.__AI_TRADER_CHART_DEBUG__?.lastProbeNonce).toBe("probe-123");
    });
  });

  it("exposes rejected probe state and completed resync in the hidden debug api", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(apiClient, "marketChartSocketUrl").mockReturnValue("ws://127.0.0.1:8011/ws/updates");
    const marketChartSpy = vi.spyOn(apiClient, "marketChart").mockResolvedValue(mockMarketCharts["WTI:1d"]);

    const { result } = renderHook(() => useLiveMarketChart("USOUSD", "1d", true));

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(window.__AI_TRADER_CHART_DEBUG__).toBeDefined();
    });

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart",
        symbol: "USOUSD",
        timeframe: "1d",
        version: 4,
        payload: mockMarketCharts["WTI:1d"],
        transport: {
          event_kind: "baseline",
          event_id: "evt-baseline",
          emitted_at: "2026-04-25T10:00:00Z",
          version: 4,
          proof_nonce: null,
          reason: "subscription",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.transportDebug.baselineReceivedCount).toBe(1);
      expect(result.current.transportDebug.lastVersion).toBe(4);
    });

    expect(window.__AI_TRADER_CHART_DEBUG__?.requestRejectedDeltaProbe()).toBe(true);
    expect(MockWebSocket.instances[0].sentMessages[MockWebSocket.instances[0].sentMessages.length - 1]).toContain("\"probe_kind\":\"rejected_stale_version\"");

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "market_chart_delta",
        symbol: "USOUSD",
        timeframe: "1d",
        base_version: 3,
        version: 5,
        meta: {
          status: mockMarketCharts["WTI:1d"].status,
          status_note: mockMarketCharts["WTI:1d"].status_note,
          source_mode: mockMarketCharts["WTI:1d"].source_mode,
          market_data_mode: mockMarketCharts["WTI:1d"].market_data_mode,
          freshness_minutes: mockMarketCharts["WTI:1d"].freshness_minutes,
          freshness_state: mockMarketCharts["WTI:1d"].freshness_state,
          data_quality: mockMarketCharts["WTI:1d"].data_quality,
          is_fixture_mode: mockMarketCharts["WTI:1d"].is_fixture_mode,
          available_timeframes: mockMarketCharts["WTI:1d"].available_timeframes,
          instrument_mapping: mockMarketCharts["WTI:1d"].instrument_mapping,
          data_reality: mockMarketCharts["WTI:1d"].data_reality,
          commodity_truth: mockMarketCharts["WTI:1d"].commodity_truth,
          selected_asset_truth: mockMarketCharts["WTI:1d"].selected_asset_truth,
          runtime_snapshot: mockMarketCharts["WTI:1d"].runtime_snapshot,
        },
        delta: {},
        transport: {
          event_kind: "probe_invalid_delta",
          event_id: "evt-probe-invalid",
          emitted_at: "2026-04-25T10:00:05Z",
          version: 5,
          proof_nonce: "probe-invalid-123",
          reason: "verification_probe_invalid",
        },
      });
    });

    await waitFor(() => {
      expect(marketChartSpy).toHaveBeenCalledTimes(2);
      expect(result.current.transportDebug.deltaReceivedCount).toBe(1);
      expect(result.current.transportDebug.deltaRejectedCount).toBe(1);
      expect(result.current.transportDebug.deltaAppliedCount).toBe(0);
      expect(result.current.transportDebug.restResyncRequestedCount).toBe(1);
      expect(result.current.transportDebug.restResyncCompletedCount).toBe(1);
      expect(result.current.transportDebug.lastRejectReason).toBe("stale_version");
      expect(result.current.transportDebug.lastEventKind).toBe("probe_invalid_delta");
      expect(window.__AI_TRADER_CHART_DEBUG__?.deltaRejectedCount).toBe(1);
      expect(window.__AI_TRADER_CHART_DEBUG__?.restResyncCompletedCount).toBe(1);
      expect(result.current.data.selected_asset_truth?.symbol).toBe("USOUSD");
      expect(result.current.data.selected_asset_truth?.research_symbol_if_any).toBe("WTI_CTX");
    });
  });
});
