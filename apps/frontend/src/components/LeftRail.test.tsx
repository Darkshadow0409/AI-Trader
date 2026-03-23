import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockExecutionGate, mockOperationalBacklog, mockResearch, mockWatchlistSummary } from "../api/mockData";
import { LeftRail } from "./LeftRail";

describe("LeftRail", () => {
  it("renders trader watchlist details and lets the operator load a chart from the rail", async () => {
    const user = userEvent.setup();
    const onSelectSymbol = vi.fn();

    render(
      <LeftRail
        activeTab="desk"
        backlog={mockOperationalBacklog}
        executionGate={mockExecutionGate}
        navItems={[{ key: "desk", label: "Desk", tone: "active" }]}
        onSelectSymbol={onSelectSymbol}
        onSelectTab={vi.fn()}
        research={mockResearch}
        selectedSymbol="BTC"
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(screen.getByText("71880.00 / +3.07%")).toBeInTheDocument();
    expect(screen.getAllByText("5m / fresh").length).toBeGreaterThan(0);
    expect(screen.getByText("Reality B / fixture / trend breakout")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /ETH/i })[0]);
    expect(onSelectSymbol).toHaveBeenCalledWith("ETH");
  });
});
