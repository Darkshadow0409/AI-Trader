import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockOpportunities, mockWatchlist } from "../api/mockData";
import { WatchlistTab } from "./WatchlistTab";

describe("WatchlistTab", () => {
  it("renders focus and scout queues and supports drill-down callbacks", () => {
    const onSelectSymbol = vi.fn();
    const onOpenSignal = vi.fn();
    const onOpenRisk = vi.fn();

    render(
      <WatchlistTab
        onOpenRisk={onOpenRisk}
        onOpenSignal={onOpenSignal}
        onSelectSymbol={onSelectSymbol}
        opportunities={mockOpportunities}
        rows={mockWatchlist}
        selectedSymbol="BTC"
      />,
    );

    expect(screen.getByText("Focus Queue")).toBeInTheDocument();
    expect(screen.getByText("Scout Queue")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("BTC")[0]);

    expect(onSelectSymbol).toHaveBeenCalled();
  });
});
