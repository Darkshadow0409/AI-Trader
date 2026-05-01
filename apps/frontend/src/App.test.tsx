import { render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockAssetContexts,
  mockDeskSummary,
  mockHealth,
  mockHomeSummary,
  mockMarketCharts,
  mockPaperTradeAnalytics,
  mockPolymarketHunter,
  mockResearchRun,
  mockRibbon,
  mockRisk,
  mockSignals,
  mockSelectedSignalWorkspace,
  mockSessionOverview,
  mockWatchlistSummary,
} from "./api/mockData";
import { resetApiClientInflightRequestsForTests } from "./api/client";

vi.mock("./components/PriceChart", () => ({
  PriceChart: ({
    chart,
    loading,
    timeframe,
    onTimeframeChange,
  }: {
    chart: { instrument_mapping: { trader_symbol: string }; symbol: string; status?: string; timeframe?: string };
    loading?: boolean;
    timeframe?: string;
    onTimeframeChange?: (timeframe: string) => void;
  }) => (
    <div data-testid="price-chart">
      {chart.instrument_mapping.trader_symbol} / {chart.symbol} / {chart.status ?? "unknown"} / chart {chart.timeframe ?? "unknown"} / requested {timeframe ?? "unknown"} / {loading ? "pending" : "settled"}
      {onTimeframeChange ? (
        <>
          <button onClick={() => onTimeframeChange("4h")} type="button">
            Mock switch 4h
          </button>
          <button onClick={() => onTimeframeChange("1d")} type="button">
            Mock switch 1d
          </button>
        </>
      ) : null}
    </div>
  ),
}));

vi.mock("./tabs/StrategyLabTab", () => ({
  StrategyLabTab: () => <div data-testid="tab-strategy">Strategy workspace</div>,
}));

vi.mock("./tabs/BacktestsTab", () => ({
  BacktestsTab: () => <div data-testid="tab-backtests">Backtests workspace</div>,
}));

vi.mock("./tabs/ReplayTab", () => ({
  ReplayTab: () => <div data-testid="tab-replay">Replay workspace</div>,
}));

vi.mock("./tabs/PilotDashboardTab", () => ({
  PilotDashboardTab: () => <div data-testid="tab-pilot">Pilot Ops workspace</div>,
}));

vi.mock("./tabs/AIDeskTab", () => ({
  AIDeskTab: () => <div data-testid="tab-ai-desk">AI Desk workspace</div>,
}));

import App, {
  chartHasRenderablePayload,
  chartMatchesSelectedSymbol,
  deriveBacklogReviewTasks,
  resolveReviewQueue,
  resolveSelectedRiskHydrationId,
  resolveSelectedSignalHydrationId,
  resolveTicketFocusSelection,
  resolveTradeFocusSelection,
  selectionUnavailableError,
} from "./App";

describe("App", () => {
  beforeEach(() => {
    resetApiClientInflightRequestsForTests();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.stubGlobal("WebSocket", class {
      constructor() {
        throw new Error("offline");
      }
    });
    window.scrollTo = vi.fn();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("accepts canonical research chart symbols when selected-asset truth preserves the trader-facing route", () => {
    expect(chartMatchesSelectedSymbol(mockMarketCharts["WTI:1d"], "USOUSD")).toBe(true);
    expect(chartMatchesSelectedSymbol(mockMarketCharts["SILVER:1d"], "XAGUSD")).toBe(true);
    expect(chartMatchesSelectedSymbol(mockMarketCharts["WTI:1d"], "XAGUSD")).toBe(false);
  });

  it("keeps unusable charts renderable so honest degraded/fallback copy can surface", () => {
    const unusableOilChart = {
      ...mockMarketCharts["WTI:1d"],
      status: "unusable",
      freshness_state: "unusable",
    };

    expect(chartHasRenderablePayload(unusableOilChart)).toBe(true);
  });

  it("realigns stale signal and risk hydration ids to the current symbol context", () => {
    expect(
      resolveSelectedSignalHydrationId({
        selectedSignalId: "sig_stale",
        selectedSymbol: mockDeskSummary.high_priority_signals[0]?.symbol ?? "WTI",
        signalRows: mockDeskSummary.high_priority_signals,
        assetSignalId: mockDeskSummary.high_priority_signals[0]?.signal_id ?? null,
      }),
    ).toBe(mockDeskSummary.high_priority_signals[0]?.signal_id);

    expect(
      resolveSelectedRiskHydrationId({
        selectedRiskReportId: "risk_stale",
        selectedSymbol: mockRisk[0]?.symbol ?? "WTI",
        riskRows: mockRisk,
        assetRiskId: mockRisk[0]?.risk_report_id ?? null,
        workspaceRiskId: null,
      }),
    ).toBe(mockRisk[0]?.risk_report_id);
  });

  it("keeps the current hydration ids when no current-symbol replacement is known yet", () => {
    expect(
      resolveSelectedSignalHydrationId({
        selectedSignalId: "sig_keep",
        selectedSymbol: "USOUSD",
        signalRows: [],
        assetSignalId: null,
      }),
    ).toBe("sig_keep");

    expect(
      resolveSelectedRiskHydrationId({
        selectedRiskReportId: "risk_keep",
        selectedSymbol: "USOUSD",
        riskRows: [],
        assetRiskId: null,
        workspaceRiskId: null,
      }),
    ).toBe("risk_keep");
  });

  it("treats trader-facing commodity symbols as the same focus as their research symbols during hydration", () => {
    expect(
      resolveSelectedSignalHydrationId({
        selectedSignalId: mockDeskSummary.high_priority_signals[0]?.signal_id ?? "sig_wti_pullback_001",
        selectedSymbol: "USOUSD",
        signalRows: mockDeskSummary.high_priority_signals,
        assetSignalId: mockDeskSummary.high_priority_signals[0]?.signal_id ?? null,
      }),
    ).toBe(mockDeskSummary.high_priority_signals[0]?.signal_id);

    expect(
      resolveSelectedRiskHydrationId({
        selectedRiskReportId: mockRisk[0]?.risk_report_id ?? "risk_wti_board_001",
        selectedSymbol: "USOUSD",
        riskRows: mockRisk,
        assetRiskId: mockRisk[0]?.risk_report_id ?? null,
        workspaceRiskId: null,
      }),
    ).toBe(mockRisk[0]?.risk_report_id);
  });

  it("treats calm unavailable-selection messages as stale-id signals", () => {
    expect(selectionUnavailableError("Selected signal context is no longer available. Reload the latest setup.")).toBe(true);
    expect(selectionUnavailableError("Selected risk context is no longer available. Reload the latest risk frame.")).toBe(true);
    expect(selectionUnavailableError("Desk summary is still refreshing on the backend.")).toBe(false);
  });

  it("uses persisted backlog task ids as a safe Review Queue fallback instead of a false empty state", () => {
    const backlog = {
      ...mockSessionOverview.operational_backlog,
      items: [
        {
          item_id: "review_task_backlog_eth",
          category: "post_trade_review_due",
          title: "USOUSD post-trade review due",
          priority: "high",
          status: "overdue",
          linked_symbol: "WTI",
          linked_entity_type: "paper_trade_review",
          linked_entity_id: "paper_trade_uso_closed",
          due_at: "2026-03-15T11:30:00Z",
          freshness_minutes: 45,
          note: "Closed paper trade is awaiting structured review.",
        },
      ],
    };

    expect(deriveBacklogReviewTasks(backlog.items)).toEqual([
      expect.objectContaining({
        task_id: "review_task_backlog_eth",
        display_symbol: "USOUSD",
        session_state: "post_session",
        metadata: expect.objectContaining({ backlog_fallback: true }),
      }),
    ]);

    expect(resolveReviewQueue({
      directTasks: [],
      sessionOverviewTasks: [],
      deskSummaryTasks: [],
      backlog,
      reviewCount: 1,
      loading: true,
      error: null,
      overdueCount: 1,
      highPriorityCount: 1,
    })).toEqual(expect.objectContaining({
      source: "backlog",
      continuityState: "reconciling",
      tasks: [
        expect.objectContaining({
          task_id: "review_task_backlog_eth",
          display_symbol: "USOUSD",
        }),
      ],
    }));
  });

  it("focuses trades and tickets without copying stale linked signal or risk ids from summary rows", () => {
    expect(
      resolveTradeFocusSelection({
        trade_id: "trade-1",
        symbol: "USOUSD",
      }),
    ).toEqual({
      selectedTradeId: "trade-1",
      selectedTicketId: null,
      selectedSymbol: "USOUSD",
      selectedSignalId: null,
      selectedRiskReportId: null,
    });

    expect(
      resolveTicketFocusSelection({
        ticket_id: "ticket-1",
        trade_id: "trade-1",
        symbol: "USOUSD",
      }),
    ).toEqual({
      selectedTicketId: "ticket-1",
      selectedTradeId: "trade-1",
      selectedSymbol: "USOUSD",
      selectedSignalId: null,
      selectedRiskReportId: null,
    });
  });

  it("renders the dense dashboard shell with fallback data", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({ ok: true, json: async () => ({ ...mockHealth, status: "ok" }) });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({ ok: true, json: async () => mockRibbon });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({ ok: true, json: async () => mockWatchlistSummary });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    expect(screen.getByTestId("left-rail")).toHaveClass("shell-scroll-region");
    expect(screen.getByTestId("operator-main")).toHaveClass("shell-scroll-region");
    expect(screen.getByTestId("right-pane")).toHaveClass("shell-scroll-region");
    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: /^Desk$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Signals$/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Tickets(?:\s+\d+)?$/i })[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Review Queue(?:\s+\d+\/\d+)?$/i })).toBeInTheDocument();
    expect(screen.getByTestId("rail-hotkeys")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /USOUSD Oil \/ USOUSD/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Surface" })).toBeInTheDocument();
    expect(screen.getAllByText(/signal /i).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Backlog pressure is elevated\. Clear overdue review work before expanding workflow\./i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Replay$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /USOUSD Oil \/ USOUSD/i }));
    expect(await screen.findByRole("heading", { name: "USOUSD Focus" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/market/chart/USOUSD?timeframe=1d"), expect.any(Object));
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/dashboard/assets/WTI"))).toBe(false);
  }, 10000);

  it("treats journal deep links without a selected symbol as settled route-owned state", async () => {
    window.history.replaceState({}, "", "/?tab=journal");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Journal Console" })).toBeInTheDocument();
    expect(screen.queryByText("Syncing workspace snapshot")).not.toBeInTheDocument();
  });

  it("scrolls to the operator workspace anchor when navigation changes", async () => {
    const user = userEvent.setup();
    render(<App />);

    const anchor = await screen.findByTestId("operator-workspace-anchor");
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        top: 320,
        bottom: 420,
        left: 0,
        right: 0,
        width: 800,
        height: 100,
        x: 0,
        y: 320,
        toJSON: () => "",
      }),
    });
    vi.mocked(window.scrollTo).mockClear();

    await user.click(screen.getAllByRole("button", { name: /^Signals$/i })[0]);

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 312, behavior: "auto" });
    });
  });

  it("switches every later navigation section reliably", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId("top-ribbon");

    await user.click(screen.getByRole("button", { name: /^Journal$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();
    expect(await screen.findByText("Structured Trade Review")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Review Queue(?:\s+\d+\/\d+)?$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Review Queue" })).toBeInTheDocument();
    expect(screen.getAllByText("Review Queue").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Strategy$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Strategy" })).toBeInTheDocument();
    expect(await screen.findByTestId("tab-strategy")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Backtests$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Backtests" })).toBeInTheDocument();
    expect(await screen.findByTestId("tab-backtests")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Pilot Ops/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Pilot Ops" })).toBeInTheDocument();
    expect(await screen.findByTestId("tab-pilot")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Risk$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Risk" })).toBeInTheDocument();
    expect(await screen.findByText("Worst Shock")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Research$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Research" })).toBeInTheDocument();
    expect(await screen.findByText("Breakout%")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^News$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "News" })).toBeInTheDocument();
    expect((await screen.findAllByText("Crude inventory draw tightens inflation-sensitive macro backdrop")).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Polymarket$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Polymarket" })).toBeInTheDocument();
    expect(await screen.findByText("Polymarket Hunter")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^AI Desk$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "AI Desk" })).toBeInTheDocument();
    expect(await screen.findByTestId("tab-ai-desk")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Wallet$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Wallet" })).toBeInTheDocument();
    expect(await screen.findByText("Wallet Balance")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  }, 15000);

  it("restores the stored Research workspace and selected run after a refresh-style boot", async () => {
    window.sessionStorage.setItem("ai-trader:active-tab", "research");
    window.sessionStorage.setItem("ai-trader:selected-research-run-id", mockResearchRun.run_id);

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Research" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Research Memo Detail" })).toBeInTheDocument();
    expect(screen.getAllByText(mockResearchRun.final_summary).length).toBeGreaterThan(0);
  });

  it("keeps deep-linked symbol and risk context stable after signal workspace hydration", async () => {
    const riskId = "risk_wti_board_001";
    window.history.replaceState(
      {},
      "",
      `/?tab=ai_desk&symbol=WTI&signal=sig_wti_pullback_001&risk=${riskId}&tf=1d`,
    );

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "AI Desk" })).toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.search).toContain("tab=ai_desk");
      expect(window.location.search).toContain("symbol=WTI");
      expect(window.location.search).toContain("signal=sig_wti_pullback_001");
      expect(window.location.search).toContain(`risk=${riskId}`);
    });
  });

  it("keeps a valid deep-linked signal stable across research reload hydration", async () => {
    window.history.replaceState({}, "", "/?tab=research&symbol=ETH&signal=sig_342ef03a8f4a559b9b1773fc5fd9f4ae&tf=1d");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Research" })).toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.search).toContain("tab=research");
      expect(window.location.search).toContain("symbol=ETH");
      expect(window.location.search).toContain("signal=sig_342ef03a8f4a559b9b1773fc5fd9f4ae");
    });
  });

  it("does not auto-promote a preferred commodity over an explicit deep-linked non-primary symbol", async () => {
    window.history.replaceState({}, "", "/?tab=ai_desk&symbol=ETH&tf=1d");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "AI Desk" })).toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.search).toContain("tab=ai_desk");
      expect(window.location.search).toContain("symbol=ETH");
      expect(window.location.search).not.toContain("symbol=WTI");
    });
  });

  it("shows the Desk-implied signals on the Signals page by default", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId("top-ribbon");
    await user.click(screen.getAllByRole("button", { name: /^Signals$/i })[0]);

    expect(await screen.findByRole("heading", { level: 1, name: "Signals" })).toBeInTheDocument();
    expect(screen.getByText("Actionable commodity setups")).toBeInTheDocument();
    expect(screen.getByText("Needs confirmation / candidate setups")).toBeInTheDocument();
    expect(screen.getByText("High-risk / event-sensitive setups")).toBeInTheDocument();
    expect(screen.getAllByText("WTI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GOLD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SILVER").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Setups Not In Scope/i)).not.toBeInTheDocument();
  });

  it("falls back to desk summary signals when the dedicated signal endpoints are empty", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({ ok: true, json: async () => ({ ...mockHealth, status: "ok" }) });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({ ok: true, json: async () => mockRibbon });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({ ok: true, json: async () => mockWatchlistSummary });
      }
      if (url.includes("/signals/high-risk")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/signals/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            generated_at: "2026-03-26T00:00:00Z",
            filter_metadata: { symbols: [], families: [], directions: [], freshness_states: [], realism_grades: [] },
            grouped_counts: { family: {}, direction: {}, freshness: {}, realism: {} },
            top_ranked_signals: [],
            warning_counts: { high_risk: 0, stale_or_degraded: 0, proxy_or_context_only: 0, promotion_blocked: 0 },
          }),
        });
      }
      if (url.includes("/signals")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/dashboard/desk")) {
        return Promise.resolve({ ok: true, json: async () => mockDeskSummary });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByTestId("top-ribbon");
    await user.click(screen.getAllByRole("button", { name: /^Signals$/i })[0]);

    expect(await screen.findByRole("heading", { level: 1, name: "Signals" })).toBeInTheDocument();
    expect(screen.getAllByText("WTI").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Setups Not In Scope/i)).not.toBeInTheDocument();
  });

  it("uses normalized home summary counts for shell badges while desk detail is still thin", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({ ok: true, json: async () => ({ ...mockHealth, status: "ok" }) });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({ ok: true, json: async () => mockRibbon });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({ ok: true, json: async () => mockWatchlistSummary });
      }
      if (url.includes("/dashboard/home-summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockHomeSummary,
            review_backlog_counts: { overdue: 2, high_priority: 4, open_reviews: 4 },
            operator_state_summary: {
              open_review_items: 4,
              overdue_review_items: 2,
              open_tickets: 3,
              ready_for_review_tickets: 1,
              proposed_trades: 3,
              active_trades: 1,
            },
          }),
        });
      }
      if (url.includes("/dashboard/desk")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockDeskSummary,
            operational_backlog: { ...mockDeskSummary.operational_backlog, overdue_count: 0, high_priority_count: 0, items: [] },
            review_tasks: [],
            open_tickets: [],
            active_paper_trades: [],
          }),
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    expect(screen.getAllByText("2 overdue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4 high priority").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Review Queue\s+2\/4$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Trades\s+0$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tickets\s+3$/i })).toBeInTheDocument();
  });

  it("does not keep firing chart fetches after switching to a non-chart workspace", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByTestId("top-ribbon");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/market/chart/USOUSD?timeframe=1d"), expect.any(Object));
    });

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: /^Review Queue(?:\s+\d+\/\d+)?$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Review Queue" })).toBeInTheDocument();
    });

    fetchMock.mockClear();
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    await waitFor(() => {
      const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calledUrls.some((url) => url.includes("/market/chart/USOUSD?timeframe=1d"))).toBe(false);
      expect(calledUrls.some((url) => url.includes("/dashboard/assets/USOUSD"))).toBe(false);
    });
  });

  it("routes left-rail asset clicks into a chart-capable workspace from non-focus tabs", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId("top-ribbon");
    await user.click(screen.getByRole("button", { name: /^Journal$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /USOUSD Oil \/ USOUSD/i }));

    expect(await screen.findByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "USOUSD Focus" })).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toHaveTextContent("USOUSD / WTI");
  });

  it("keeps the desk shell usable with truthful fallback framing while the focus surface recovers", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockRibbon,
            macro_regime: "risk-on",
            data_mode_label: "Public live data",
            feed_source_label: "Live-capable source family",
          }),
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/dashboard/desk") || url.includes("/dashboard/home-summary")) {
        return never;
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const topRibbon = await screen.findByTestId("top-ribbon");
    expect(screen.getAllByText(/Workspace Status/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Desk$/i })).toBeInTheDocument();
    expect(
      topRibbon.getAttribute("data-shell-bootstrap") === "true"
      || topRibbon.getAttribute("data-shell-bootstrap") === "false",
    ).toBe(true);
    expect(
      screen.queryAllByText(/Syncing workspace snapshot|Unknown source|Commodity truth status unknown/i).length,
    ).toBeGreaterThan(0);
  });

  it("lets the desk route settle once one primary market surface is usable even if board summary is still pending", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return never;
      }
      if (url.includes("/dashboard/assets/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAssetContexts.WTI,
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=1d")) {
        return never;
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=USOUSD&tf=1d");

    render(<App />);

    const topRibbon = await screen.findByTestId("top-ribbon");
    expect(topRibbon).toHaveAttribute("data-shell-bootstrap", "false");
    expect(screen.queryByText("Syncing workspace snapshot")).not.toBeInTheDocument();
    expect(await screen.findByTestId("route-settle-strip")).toHaveTextContent("Supporting market context is still syncing");
  });

  it("prefers session overview weekly review metrics over a stale direct weekly review endpoint", async () => {
    const zeroWeeklyReview = {
      ...mockSessionOverview.weekly_review,
      signal_family_outcomes: [],
      failure_attribution_trend: [],
      realism_warning_violations: [],
      paper_trade_outcome_distribution: {
        wins: 0,
        losses: 0,
        invalidated: 0,
        timed_out: 0,
        cancelled: 0,
      },
      adherence_trend: {
        ...mockSessionOverview.weekly_review.adherence_trend,
        trade_count: 0,
        reviewed_trade_count: 0,
        adherence_rate: 0,
        invalidation_discipline_rate: 0,
        review_completion_rate: 0,
        realism_warning_violation_count: 0,
        invalidation_breach_count: 0,
      },
    };
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/session/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSessionOverview,
        });
      }
      if (url.includes("/session/weekly-review")) {
        return Promise.resolve({ ok: true, json: async () => zeroWeeklyReview });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);

    await screen.findByTestId("top-ribbon");
    await user.click(screen.getByRole("button", { name: /^Review Queue(?:\s+\d+\/\d+)?$/i }));

    expect(await screen.findByRole("heading", { level: 3, name: "Weekly Review" })).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(String(mockPaperTradeAnalytics.hygiene_summary.realism_warning_violation_count)).length,
    ).toBeGreaterThan(0);
  });

  it("keeps the default desk shell usable with fallback truth framing while route-critical selection is still resolving", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health") || url.includes("/dashboard/overview") || url.includes("/watchlist/summary")) {
        return never;
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=USOUSD&tf=1d");

    render(<App />);

    const topRibbon = await screen.findByTestId("top-ribbon");
    expect(topRibbon).toHaveAttribute("data-shell-bootstrap", "false");
    expect(screen.queryByText("Syncing workspace snapshot")).not.toBeInTheDocument();
    expect(screen.getByText(/Trader Operations Desk|Current delayed futures context/i)).toBeInTheDocument();
  });

  it("lets the watchlist route leave bootstrap once board rows resolve even if scouting queues are still pending", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/watchlist/opportunity-hunter")) {
        return never;
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=watchlist&symbol=USOUSD");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("top-ribbon")).toHaveAttribute("data-shell-bootstrap", "false");
    });
    expect(screen.queryByText("Syncing workspace snapshot")).not.toBeInTheDocument();
    expect(await screen.findByTestId("route-settle-strip")).toHaveTextContent("Scouting queues are still syncing");
    expect(screen.getByRole("heading", { name: "Primary Commodity Board" })).toBeInTheDocument();
  });

  it("lets the watchlist route degrade into a usable state when the board summary stalls too long", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/selected-asset-truth/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            symbol: "USOUSD",
            trader_facing_symbol: "USOUSD",
            research_symbol_if_any: "WTI_CTX",
            as_of: "2026-04-23T10:00:00Z",
            freshness_minutes: 15,
            source_mode: "delayed",
            route_readiness: "ready",
            degraded_reason: "Delayed/public commodity context",
            is_proxy: true,
            confidence: 0.67,
          }),
        });
      }
      if (url.includes("/watchlist/summary")) {
        return never;
      }
      if (url.includes("/watchlist/opportunity-hunter")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            generated_at: "2026-04-23T10:00:00Z",
            focus_queue: [],
            scout_queue: [],
          }),
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=watchlist&symbol=USOUSD");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
    expect(screen.getByTestId("top-ribbon")).toHaveAttribute("data-shell-bootstrap", "true");

    await waitFor(() => {
      expect(screen.getByTestId("top-ribbon")).toHaveAttribute("data-shell-bootstrap", "false");
    }, { timeout: 8000 });
    expect(await screen.findByTestId("route-settle-strip")).toHaveTextContent("Board refresh is degraded but usable");
    expect(screen.getByText("Watchlist board is unavailable right now.")).toBeInTheDocument();
  }, 10000);

  it("keeps the oil focus surface usable without leaking a raw WTI or USOUSD 404", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/watchlist")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes("/dashboard/assets/USOUSD")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({}),
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMarketCharts["WTI:1d"],
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    expect(screen.queryByText(/\/dashboard\/assets\/WTI returned 404/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/dashboard\/assets\/USOUSD returned 404/i)).not.toBeInTheDocument();
  });

  it("accepts canonical commodity chart responses for trader-facing symbols instead of falling back to a synthetic loading chart", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/watchlist")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes("/dashboard/assets/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAssetContexts.WTI,
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMarketCharts["WTI:1d"],
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=USOUSD&tf=1d");

    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("price-chart")).toHaveTextContent("USOUSD / WTI");
    });
  });

  it("keeps the last direct chart visible while a requested timeframe is still hydrating", async () => {
    const user = userEvent.setup();
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/watchlist")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes("/dashboard/assets/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAssetContexts.WTI,
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockMarketCharts["WTI:1d"],
            available_timeframes: ["15m", "1h", "4h", "1d"],
          }),
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=4h")) {
        return never;
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=USOUSD&tf=1d");

    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("price-chart")).toHaveTextContent("USOUSD / WTI / ok / chart 1d / requested 1d / settled");
    });

    await user.click(screen.getByRole("button", { name: "Mock switch 4h" }));

    await waitFor(() => {
      expect(window.location.search).toContain("tf=4h");
      expect(screen.getByTestId("price-chart")).toHaveTextContent("USOUSD / WTI / ok / chart 1d / requested 4h / pending");
    });
    expect(screen.getByTestId("price-chart")).not.toHaveTextContent("USOUSD / USOUSD / loading");
  });

  it("keeps the last 4h direct chart visible during a 1d hydration gap", async () => {
    const user = userEvent.setup();
    const never = new Promise<never>(() => {});
    const wti4hChart = {
      ...mockMarketCharts["WTI:1d"],
      timeframe: "4h",
      available_timeframes: ["15m", "1h", "4h", "1d"],
    };
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/watchlist")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes("/dashboard/assets/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAssetContexts.WTI,
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=4h")) {
        return Promise.resolve({
          ok: true,
          json: async () => wti4hChart,
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=1d")) {
        return never;
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=USOUSD&tf=4h");

    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("price-chart")).toHaveTextContent("USOUSD / WTI / ok / chart 4h / requested 4h / settled");
    });

    await user.click(screen.getByRole("button", { name: "Mock switch 1d" }));

    await waitFor(() => {
      expect(window.location.search).toContain("tf=1d");
      expect(screen.getByTestId("price-chart")).toHaveTextContent(/USOUSD \/ WTI \/ ok \/ chart (4h|1d) \/ requested 1d \/ pending/);
    });
    expect(screen.getByTestId("price-chart")).not.toHaveTextContent("USOUSD / USOUSD / loading");
  });

  it("keeps a cold XAGUSD desk deep link usable while supporting market context keeps syncing", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (
        url.includes("/dashboard/overview")
        || url.includes("/watchlist")
        || url.includes("/watchlist/summary")
        || url.includes("/dashboard/desk")
        || url.includes("/dashboard/home-summary")
      ) {
        return never;
      }
      if (url.includes("/dashboard/assets/XAGUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAssetContexts.SILVER,
        });
      }
      if (url.includes("/market/chart/XAGUSD?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMarketCharts["SILVER:1d"],
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=XAGUSD&tf=1d");

    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("price-chart")).toHaveTextContent("XAGUSD / SILVER / ok");
    });
    await waitFor(() => {
      expect(screen.getByTestId("top-ribbon")).toHaveAttribute("data-shell-bootstrap", "false");
    });
    expect(screen.queryByText("Syncing workspace snapshot")).not.toBeInTheDocument();
    expect(screen.getByTestId("route-settle-strip")).toHaveTextContent("Supporting market context is still syncing");
  });

  it("settles a cold USOUSD trades deep link once focused signal and risk context are available", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (
        url.includes("/dashboard/overview")
        || url.includes("/watchlist")
        || url.includes("/watchlist/summary")
        || url.includes("/dashboard/desk")
        || url.includes("/dashboard/home-summary")
      ) {
        return never;
      }
      if (url.includes("/dashboard/assets/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAssetContexts.WTI,
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=active_trades&symbol=USOUSD&tf=1d");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Trades" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("Signal").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Risk").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
  });

  it("settles a cold USOUSD trades deep link once the closed-trade lane resolves even if proposed and active rows are still hydrating", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (
        url.includes("/dashboard/overview")
        || url.includes("/watchlist")
        || url.includes("/watchlist/summary")
        || url.includes("/dashboard/desk")
        || url.includes("/dashboard/home-summary")
        || url.includes("/dashboard/assets/USOUSD")
      ) {
        return never;
      }
      if (url.includes("/portfolio/paper-trades/proposed")) {
        return never;
      }
      if (url.includes("/portfolio/paper-trades/active")) {
        return never;
      }
      if (url.includes("/portfolio/paper-trades/closed")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=active_trades&symbol=USOUSD&tf=1d");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Trades" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Proposed rows are hydrating from the current paper-trade state.")).toBeInTheDocument();
      expect(screen.getByText("Active rows are hydrating from the current paper-trade state.")).toBeInTheDocument();
      expect(screen.getByText("No trades in this state.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Propose Paper Trade" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
  });

  it("hydrates a deep-linked XAGUSD signal workspace from canonical SILVER rows", async () => {
    const silverSignal = mockSignals.find((row) => row.signal_id === "sig_silver_event_001");
    const silverRisk = mockRisk.find((row) => row.signal_id === "sig_silver_event_001");
    const silverWorkspace = {
      ...mockSelectedSignalWorkspace,
      selected_symbol: "SILVER",
      signal: silverSignal ? { ...mockSelectedSignalWorkspace.signal, ...silverSignal } : mockSelectedSignalWorkspace.signal,
      risk: silverRisk ? { ...mockSelectedSignalWorkspace.risk, ...silverRisk } : mockSelectedSignalWorkspace.risk,
      asset_context: mockAssetContexts.SILVER,
      chart: mockMarketCharts["SILVER:1d"],
    };
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/watchlist")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.endsWith("/signals")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSignals,
        });
      }
      if (url.includes("/signals/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ generated_at: "", top_ranked_signals: [], filter_metadata: { symbols: [], families: [], directions: [], freshness_states: [] } }),
        });
      }
      if (url.includes("/dashboard/assets/XAGUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockAssetContexts.SILVER,
            latest_signal: null,
          }),
        });
      }
      if (url.includes("/signals/sig_silver_event_001/workspace-context?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => silverWorkspace,
        });
      }
      if (url.includes("/market/chart/XAGUSD?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMarketCharts["SILVER:1d"],
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=XAGUSD&signal=sig_silver_event_001&tf=1d");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "XAGUSD Focus" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/signals/sig_silver_event_001/workspace-context?timeframe=1d"), expect.any(Object));
      expect(screen.getByTestId("price-chart")).toHaveTextContent("XAGUSD / SILVER / ok");
    });
  });

  it("prefers a loaded direct chart over a slower workspace chart placeholder for trader-facing commodities", async () => {
    const loadingWorkspace = {
      ...mockSelectedSignalWorkspace,
      chart: {
        ...mockSelectedSignalWorkspace.chart,
        status: "loading" as const,
        status_note: "Loading chart data…",
        freshness_minutes: 0,
        freshness_state: "loading" as const,
        data_quality: "loading",
        bars: [],
        indicators: { ema_20: [], ema_50: [], ema_200: [], rsi_14: [], atr_14: [] },
      overlays: { markers: [], price_lines: [], zones: [] },
      },
    };
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRibbon,
        });
      }
      if (url.includes("/watchlist/summary")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWatchlistSummary,
        });
      }
      if (url.includes("/dashboard/assets/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAssetContexts.WTI,
        });
      }
      if (url.includes("/signals/sig_wti_range/workspace-context?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => loadingWorkspace,
        });
      }
      if (url.includes("/market/chart/USOUSD?timeframe=1d")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMarketCharts["WTI:1d"],
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=desk&symbol=USOUSD&signal=sig_wti_range&tf=1d");

    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("price-chart")).toHaveTextContent("USOUSD / WTI / ok");
    });
  });

  it("renders standalone Polymarket markets and clears the loading state on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/polymarket/hunter")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockPolymarketHunter,
            source_status: "fixture_fallback",
          }),
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByTestId("top-ribbon");
    await user.click(screen.getByRole("button", { name: /^Polymarket$/i }));

    expect((await screen.findAllByText("Will WTI crude settle above $85 after the next EIA inventory report?")).length).toBeGreaterThan(0);
    expect(screen.queryByText("No trader-relevant crowd markets are available in the current source.")).not.toBeInTheDocument();
  });

  it("lets the Polymarket route settle from selected-asset truth even if overview is still pending", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockHealth, status: "ok" }),
        });
      }
      if (url.includes("/dashboard/overview")) {
        return never;
      }
      if (url.includes("/dashboard/selected-asset-truth/USOUSD")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            symbol: "USOUSD",
            trader_facing_symbol: "USOUSD",
            research_symbol_if_any: "WTI_CTX",
            as_of: "2026-04-23T05:15:00Z",
            freshness_minutes: 8,
            source_mode: "public_live",
            route_readiness: "ready_current",
            degraded_reason: null,
            is_proxy: true,
            confidence: 0.78,
          }),
        });
      }
      if (url.includes("/polymarket/hunter")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockPolymarketHunter,
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/?tab=polymarket&symbol=USOUSD");

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Polymarket" })).toBeInTheDocument();
    expect(screen.getByText("Polymarket Hunter")).toBeInTheDocument();
    expect(screen.getByTestId("top-ribbon")).toHaveAttribute("data-shell-bootstrap", "false");
    expect(screen.queryByText("Syncing workspace snapshot")).not.toBeInTheDocument();
  });

  it("clears standalone Polymarket loading into an honest empty state when no markets are returned", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/polymarket/hunter")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockPolymarketHunter,
            source_status: "public_live",
            source_note: "No relevant crowd markets are available for the current source.",
            markets: [],
            events: [],
          }),
        });
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByTestId("top-ribbon");
    await user.click(screen.getByRole("button", { name: /^Polymarket$/i }));

    expect(await screen.findByText("No trader-relevant crowd markets are available in the current source.")).toBeInTheDocument();
  });
});
