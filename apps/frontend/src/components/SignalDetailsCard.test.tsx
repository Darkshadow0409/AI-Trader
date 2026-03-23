import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockAssetContexts, mockMarketCharts, mockRibbon, mockSignalDetail } from "../api/mockData";
import { SignalDetailsCard } from "./SignalDetailsCard";

describe("SignalDetailsCard", () => {
  it("renders the data-reality block for the selected signal", () => {
    render(<SignalDetailsCard context={mockAssetContexts.BTC} detail={mockSignalDetail} ribbon={mockRibbon} />);

    expect(screen.getByText("score 48.0")).toBeInTheDocument();
    expect(screen.getByText("BTC research symbol BTCUSD aligns directly with BTCUSD on binance_spot.")).toBeInTheDocument();
    expect(screen.getAllByText("research_only").length).toBeGreaterThan(0);
    expect(screen.getByText("Fixture timing semantics support deterministic local testing only.")).toBeInTheDocument();
    expect(screen.getByText("fixture_source")).toBeInTheDocument();
    expect(screen.getByText("Signal Age")).toBeInTheDocument();
    expect(screen.getByText("Selected Market Freshness")).toBeInTheDocument();
    expect(screen.getByText("fixture bars")).toBeInTheDocument();
    expect(screen.getByText("Direct btc linkage, asset-specific wording. High volume. Active recent trading.")).toBeInTheDocument();
  });

  it("shows a friendly fallback instead of raw signal 404 text", () => {
    render(
      <SignalDetailsCard
        context={mockAssetContexts.BTC}
        detail={mockSignalDetail}
        ribbon={mockRibbon}
        error="/signals/sig_missing returned 404"
      />,
    );

    expect(screen.getByText(/Signal context unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/\/signals\/sig_missing returned 404/i)).not.toBeInTheDocument();
    expect(screen.getByText("Breakout above the 20-day range remains intact with aligned structure and supportive volume.")).toBeInTheDocument();
  });

  it("prefers selected-asset freshness over global ribbon freshness", () => {
    render(
      <SignalDetailsCard
        chart={{
          ...mockMarketCharts["BTC:1d"],
          freshness_minutes: 671,
          freshness_state: "stale",
          status: "stale",
        }}
        context={{
          ...mockAssetContexts.BTC,
          data_reality: {
            ...mockAssetContexts.BTC.data_reality!,
            freshness_minutes: 18,
            freshness_state: "fresh",
          },
        }}
        detail={{
          ...mockSignalDetail,
          data_reality: {
            ...mockSignalDetail.data_reality!,
            freshness_minutes: 18,
            freshness_state: "fresh",
          },
        }}
        ribbon={{
          ...mockRibbon,
          data_freshness_minutes: 18,
          freshness_status: "fresh",
        }}
      />,
    );

    expect(screen.getByText("671m / stale")).toBeInTheDocument();
    expect(screen.queryByText("18m / fresh")).not.toBeInTheDocument();
  });
});
