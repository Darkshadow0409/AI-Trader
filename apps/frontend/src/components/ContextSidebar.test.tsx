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

    expect(screen.getByText("No relevant crowd markets are currently matched to this asset.")).toBeInTheDocument();
    expect(screen.getByText("No relevant crowd markets for this asset.")).toBeInTheDocument();
  });

  it("uses asset-correct polymarket relevance language for eth", () => {
    render(
      <ContextSidebar
        alerts={mockAlerts}
        context={mockAssetContexts.ETH}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={null}
      />,
    );

    expect(screen.getAllByText(/Direct eth linkage/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Direct btc linkage/i)).not.toBeInTheDocument();
  });

  it("deduplicates repeated alerts and shows explicit related-news empty state", () => {
    render(
      <ContextSidebar
        alerts={[mockAlerts[0], { ...mockAlerts[0], alert_id: "alert_dup" }]}
        context={{ ...mockAssetContexts.BTC, related_news: [] }}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={mockRiskDetail}
      />,
    );

    expect(screen.getAllByText(/\[sent\/info\] BTC signal created/i)).toHaveLength(1);
    expect(screen.getByText(/Current mode has limited news context for this asset/i)).toBeInTheDocument();
    expect(screen.getByText(/Actionable alert delivered/i)).toBeInTheDocument();
  });

  it("shows a friendly fallback instead of raw risk 404 text", () => {
    render(
      <ContextSidebar
        alerts={mockAlerts}
        context={mockAssetContexts.BTC}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onRefreshContext={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={mockRiskDetail}
        riskError="/risk/risk_missing returned 404"
      />,
    );

    expect(screen.getByText(/Risk context unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/\/risk\/risk_missing returned 404/i)).not.toBeInTheDocument();
  });

  it("suppresses irrelevant cross-asset polymarket matches", () => {
    render(
      <ContextSidebar
        alerts={[]}
        context={{
          ...mockAssetContexts.BTC,
          related_polymarket_markets: [
            {
              ...mockAssetContexts.BTC.related_polymarket_markets![0],
              market_id: "pm_irrelevant",
              related_assets: ["SPORTS"],
              question: "Will FIFA World Cup attendance break records?",
              event_title: "FIFA World Cup attendance",
              relevance_reason: "Sports crowd narrative with no crypto linkage.",
              relevance_score: 7.8,
              category: "politics",
              tags: ["Sports"],
            },
          ],
          crowd_implied_narrative: "",
        }}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={null}
      />,
    );

    expect(screen.getByText("No relevant crowd markets for this asset.")).toBeInTheDocument();
    expect(screen.queryByText(/FIFA World Cup/i)).not.toBeInTheDocument();
  });
});
