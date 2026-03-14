import { render, screen } from "@testing-library/react";
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
    render(<App />);

    expect(await screen.findByTestId("top-ribbon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High-Risk Signals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Risk / Exposure" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "BTC Chart" })).toBeInTheDocument();
    expect(screen.getByTestId("price-chart")).toBeInTheDocument();
    expect((await screen.findAllByText("event-risk")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/mock/i)).length).toBeGreaterThan(0);
  });
});
