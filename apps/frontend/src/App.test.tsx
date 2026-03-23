import { render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockHealth, mockMarketCharts, mockPolymarketHunter, mockRibbon, mockWatchlistSummary } from "./api/mockData";

vi.mock("./components/PriceChart", () => ({
  PriceChart: ({ chart }: { chart: { instrument_mapping: { trader_symbol: string }; symbol: string } }) => (
    <div data-testid="price-chart">
      {chart.instrument_mapping.trader_symbol} / {chart.symbol}
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

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    window.scrollTo = vi.fn();
  });

  it("renders the dense dashboard shell with fallback data", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: /^1\.\sDesk$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^2\.\sSignals$/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^5\.\sTickets(?:\s+\d+)?$/i })[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^8\.\sReview Queue(?:\s+\d+\/\d+)?$/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "USOUSD Focus" })).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Data" })).toBeInTheDocument();
    expect(screen.getAllByText(/signal /i).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("hard-asset-bid")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/mock/i)).length).toBeGreaterThan(0);
    const wtiLabels = await screen.findAllByText("WTI");
    const watchlistButton = wtiLabels.map((label) => label.closest("button")).find(Boolean);
    expect(watchlistButton).not.toBeNull();
    await user.click(watchlistButton as HTMLButtonElement);
    expect(await screen.findByRole("heading", { name: "USOUSD Focus" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/market/chart/USOUSD?timeframe=1d"), expect.any(Object));
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/dashboard/assets/WTI"))).toBe(false);
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

    await user.click(screen.getAllByRole("button", { name: /^2\.\sSignals$/i })[0]);

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 312, behavior: "auto" });
    });
  });

  it("switches every later navigation section reliably", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId("top-ribbon");

    await user.click(screen.getByRole("button", { name: /^7\.\sJournal$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();
    expect(screen.getByText("Structured Trade Review")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^8\.\sReview Queue(?:\s+\d+\/\d+)?$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Review Queue" })).toBeInTheDocument();
    expect(screen.getAllByText("Review Queue").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^9\.\sStrategy$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Strategy" })).toBeInTheDocument();
    expect(screen.getByTestId("tab-strategy")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Backtests$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Backtests" })).toBeInTheDocument();
    expect(screen.getByTestId("tab-backtests")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Replay$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Replay" })).toBeInTheDocument();
    expect(screen.getByTestId("tab-replay")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Pilot Ops/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Pilot Ops" })).toBeInTheDocument();
    expect(screen.getByTestId("tab-pilot")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Risk$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Risk" })).toBeInTheDocument();
    expect(screen.getByText("Worst Shock")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Research$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Research" })).toBeInTheDocument();
    expect(screen.getByText("Breakout%")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^News$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "News" })).toBeInTheDocument();
    expect(screen.getAllByText("Crude inventory draw tightens inflation-sensitive macro backdrop").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Polymarket$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Polymarket" })).toBeInTheDocument();
    expect(screen.getByText("Polymarket Hunter")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^AI Desk$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "AI Desk" })).toBeInTheDocument();
    expect(screen.getByTestId("tab-ai-desk")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Wallet$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Wallet" })).toBeInTheDocument();
    expect(screen.getByText("Wallet Balance")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  }, 15000);

  it("shows the Desk-implied signals on the Signals page by default", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId("top-ribbon");
    await user.click(screen.getAllByRole("button", { name: /^2\.\sSignals$/i })[0]);

    expect(await screen.findByRole("heading", { level: 1, name: "Signals" })).toBeInTheDocument();
    expect(screen.getAllByText("BTC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ETH").length).toBeGreaterThan(0);
    expect(screen.queryByText(/No signals match the current operator filters/i)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /^8\.\sReview Queue(?:\s+\d+\/\d+)?$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Review Queue" })).toBeInTheDocument();
    });

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
    await user.click(screen.getByRole("button", { name: /^7\.\sJournal$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /USOUSD/i })[0]);

    expect(await screen.findByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "USOUSD Focus" })).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toHaveTextContent("USOUSD / WTI");
  });

  it("hydrates the top ribbon from overview data even if desk summary is still pending", async () => {
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

    expect((await screen.findAllByText("risk-on")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("source-mode-badge")).toHaveTextContent("data mode Public live data");
    expect(screen.getByTestId("freshness-status-badge")).toHaveTextContent("market freshness fresh");
    expect(screen.queryByText("Loading data mode")).not.toBeInTheDocument();
  });

  it("shows a calm ribbon boot state instead of synthetic syncing badges before overview resolves", async () => {
    const never = new Promise<never>(() => {});
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.includes("/health") || url.includes("/dashboard/overview") || url.includes("/watchlist/summary")) {
        return never;
      }
      return Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const topRibbon = await screen.findByTestId("top-ribbon");
    expect(within(topRibbon).getByText("Syncing operator snapshot")).toBeInTheDocument();
    expect(within(topRibbon).queryByText("Syncing market-data truth")).not.toBeInTheDocument();
    expect(within(topRibbon).queryByText("Syncing active feed path")).not.toBeInTheDocument();
  });

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

    expect(await screen.findByTestId("price-chart")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();
    expect(screen.queryByText(/\/dashboard\/assets\/WTI returned 404/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/dashboard\/assets\/USOUSD returned 404/i)).not.toBeInTheDocument();
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
