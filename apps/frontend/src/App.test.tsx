import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./components/PriceChart", () => ({
  PriceChart: () => <div data-testid="price-chart">chart</div>,
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
});
