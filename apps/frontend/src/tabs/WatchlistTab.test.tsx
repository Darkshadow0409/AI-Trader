import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockOpportunities, mockWatchlistSummary } from "../api/mockData";
import { WatchlistTab } from "./WatchlistTab";

describe("WatchlistTab", () => {
  it("surfaces readiness and mapping context before the user drills into weaker assets", () => {
    const onSelectSymbol = vi.fn();
    const onOpenSignal = vi.fn();
    const onOpenRisk = vi.fn();
    const opportunities = {
      ...mockOpportunities,
      scout_queue: [
        ...mockOpportunities.scout_queue,
        {
          ...mockOpportunities.scout_queue[0],
          symbol: "SILVER",
          label: "Silver / XAGUSD",
          display_symbol: "XAGUSD",
          data_reality: {
            ...mockOpportunities.scout_queue[0].data_reality!,
            execution_grade_allowed: false,
            execution_suitability: "unusable",
            promotion_blocked: true,
            ui_warning: "Silver is research-only today until a stronger setup and risk frame return.",
            provenance: {
              ...mockOpportunities.scout_queue[0].data_reality!.provenance,
              tradable_symbol: "XAGUSD",
            },
          },
        },
      ],
    } as any;

    render(
      <WatchlistTab
        onOpenRisk={onOpenRisk}
        onOpenSignal={onOpenSignal}
        onSelectSymbol={onSelectSymbol}
        opportunities={opportunities}
        rows={mockWatchlistSummary}
        selectedSymbol="WTI"
      />,
    );

    expect(screen.getByText("Primary Commodity Board")).toBeInTheDocument();
    expect(screen.getByText("Focus Queue")).toBeInTheDocument();
    expect(screen.getByText("Scout Queue")).toBeInTheDocument();
    expect(screen.getAllByText("USOUSD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Readiness").length).toBeGreaterThan(0);
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Truth Context")).toBeInTheDocument();
    expect(screen.getByText("Last verified 78.90 / +0.38%")).toBeInTheDocument();
    expect(screen.getAllByText("18m / fresh").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Commodity truth recovering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("verified delayed futures fallback / recovering").length).toBeGreaterThan(0);
    expect(screen.getByText(/You trade USOUSD here\. Research context still comes from WTI/i)).toBeInTheDocument();
    expect(screen.getAllByText("No actionable setup loaded").length).toBeGreaterThan(0);
    expect(screen.getByText(/Silver is research-only today until a stronger setup and risk frame return/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("USOUSD")[0]);

    expect(onSelectSymbol).toHaveBeenCalledWith("WTI");
  });

  it("shows an honest board error and keeps queue syncing secondary when route-critical data is degraded", () => {
    render(
      <WatchlistTab
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        opportunities={{ ...mockOpportunities, focus_queue: [], scout_queue: [] } as any}
        opportunitiesLoading
        rows={[]}
        selectedSymbol="USOUSD"
        summaryError="watchlist summary unavailable"
      />,
    );

    expect(screen.getByText("Watchlist board is unavailable right now.")).toBeInTheDocument();
    expect(screen.getAllByText("Queue is still syncing in the background.").length).toBe(2);
  });
});
