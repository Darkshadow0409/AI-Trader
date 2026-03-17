import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockAlerts, mockAssetContexts, mockRibbon, mockRiskDetail } from "../api/mockData";
import { ContextSidebar } from "./ContextSidebar";

describe("ContextSidebar", () => {
  it("renders top polymarket relevance reasons for the selected asset", () => {
    render(
      <ContextSidebar
        alerts={mockAlerts}
        context={mockAssetContexts.BTC}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={mockRiskDetail}
      />,
    );

    expect(screen.getByText("Crowd-Implied Narrative")).toBeInTheDocument();
    expect(screen.getByText("Direct btc linkage, asset-specific wording. High volume. Active recent trading.")).toBeInTheDocument();
  });

  it("suppresses weak polymarket matches cleanly", () => {
    render(
      <ContextSidebar
        alerts={[]}
        context={{ ...mockAssetContexts.BTC, related_polymarket_markets: [], crowd_implied_narrative: "" }}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={null}
      />,
    );

    expect(screen.getByText("No related Polymarket market is currently matched to this asset.")).toBeInTheDocument();
  });
});
