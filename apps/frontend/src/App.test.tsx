import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./components/PriceChart", () => ({
  PriceChart: () => <div data-testid="price-chart">chart</div>,
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

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  });

  it("renders the dense dashboard shell with fallback data", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^1\.\sDesk$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^2\.\sSignals$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^5\.\sTickets(?:\s+\d+)?$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^8\.\sReview Queue(?:\s+\d+\/\d+)?$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "BTC Focus" })).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Data" })).toBeInTheDocument();
    expect(screen.getAllByText(/signal /i).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("event-risk")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/mock/i)).length).toBeGreaterThan(0);
    const wtiLabels = await screen.findAllByText("WTI");
    const watchlistButton = wtiLabels.map((label) => label.closest("button")).find(Boolean);
    expect(watchlistButton).not.toBeNull();
    await user.click(watchlistButton as HTMLButtonElement);
    expect(await screen.findByRole("heading", { name: "WTI Focus" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/system/refresh"), expect.any(Object));
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

    await user.click(screen.getByRole("button", { name: /^Wallet$/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Wallet" })).toBeInTheDocument();
    expect(screen.getByText("Wallet Balance")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart")).not.toBeInTheDocument();
  });

  it("shows the Desk-implied signals on the Signals page by default", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByTestId("top-ribbon");
    await user.click(screen.getByRole("button", { name: /^2\.\sSignals$/i }));

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
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/market/chart/BTC?timeframe=1d"), expect.any(Object));
    });

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: /^8\.\sReview Queue(?:\s+\d+\/\d+)?$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Review Queue" })).toBeInTheDocument();
    });

    await waitFor(() => {
      const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calledUrls.some((url) => url.includes("/market/chart/BTC?timeframe=1d"))).toBe(false);
      expect(calledUrls.some((url) => url.includes("/dashboard/assets/BTC"))).toBe(false);
    });
  });
});
