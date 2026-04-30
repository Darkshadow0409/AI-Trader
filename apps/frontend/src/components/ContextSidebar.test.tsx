import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockAlerts, mockAssetContexts, mockMarketCharts, mockRibbon, mockRiskDetail, mockSelectedSignalWorkspace } from "../api/mockData";
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

    expect(screen.getAllByText("BTC signal created")).toHaveLength(1);
    expect(screen.getByText(/Current mode has limited news context for this asset/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready for review or follow-up/i)).toBeInTheDocument();
    expect(screen.getByText("Priority Alerts")).toBeInTheDocument();
  });

  it("keeps suppressed alerts visible without leaking internal dedupe tokens", () => {
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

    expect(screen.getByText(/Muted repeats \(/i)).toBeInTheDocument();
    expect(screen.getByText(/A duplicate alert was already shown/i)).toBeInTheDocument();
    expect(screen.queryByText(/cooldown_window|dedupe_window/i)).not.toBeInTheDocument();
  });

  it("keeps the noise-reduced section visible even when there are no muted repeats", () => {
    render(
      <ContextSidebar
        alerts={mockAlerts.filter((item) => item.status !== "suppressed")}
        context={mockAssetContexts.BTC}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={mockRiskDetail}
      />,
    );

    expect(screen.getByText(/Muted repeats \(/i)).toBeInTheDocument();
    expect(screen.getByText("No muted repeats right now.")).toBeInTheDocument();
  });

  it("uses a live-runtime alert empty state instead of claiming fixture mode", () => {
    render(
      <ContextSidebar
        alerts={[]}
        context={mockAssetContexts.BTC}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={{ ...mockRibbon, market_data_mode: "public_live" }}
        riskDetail={mockRiskDetail}
      />,
    );

    expect(screen.getByText("No active alerts are queued for the current runtime.")).toBeInTheDocument();
    expect(screen.queryByText("No active alerts in fixture mode.")).not.toBeInTheDocument();
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

  it("renders fallback risk context immediately while the detailed risk refresh is still loading", () => {
    render(
      <ContextSidebar
        alerts={mockAlerts}
        context={mockSelectedSignalWorkspace.asset_context}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onRefreshContext={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={null}
        riskLoading
      />,
    );

    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
    expect(screen.getByText("Risk Context")).toBeInTheDocument();
    expect(screen.getByText(/Stop 77\.80/i)).toBeInTheDocument();
    expect(screen.getByText(/Refreshing detailed risk context/i)).toBeInTheDocument();
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

  it("keeps data reality focused on alignment/provenance instead of repeating the chart freshness rail", () => {
    render(
      <ContextSidebar
        alerts={[]}
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
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={{ ...mockRibbon, data_freshness_minutes: 5, freshness_status: "fresh" }}
        riskDetail={null}
      />,
    );

    expect(screen.getByText(/Freshness and recovery stay on the selected-asset rail above the chart/i)).toBeInTheDocument();
    expect(screen.queryByText(/Selected market freshness/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chart state stale/i)).not.toBeInTheDocument();
  });

  it("shows a calm snapshot note when asset context is running from the last good payload", () => {
    render(
      <ContextSidebar
        alerts={[]}
        context={{
          ...mockAssetContexts.WTI,
          runtime_snapshot: {
            source_status: "degraded",
            generated_at: "2026-03-15T11:00:00Z",
            age_minutes: 30,
            using_last_good_snapshot: true,
          },
        }}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={null}
      />,
    );

    expect(screen.getByText(/last good snapshot from 30m ago/i)).toBeInTheDocument();
  });

  it("suppresses duplicate catalyst and risk panels on focus tabs when the chart lane already has that context", () => {
    render(
      <ContextSidebar
        activeTab="desk"
        alerts={mockAlerts}
        context={mockAssetContexts.WTI}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={mockRiskDetail}
        selectedRiskLoaded
        selectedSignalLoaded
      />,
    );

    expect(screen.queryByText("Catalyst Feed")).not.toBeInTheDocument();
    expect(screen.queryByText("Crowd-Implied Narrative")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk Context")).not.toBeInTheDocument();
    expect(screen.getByText("Priority Alerts")).toBeInTheDocument();
    expect(screen.getByText("Macro Context")).toBeInTheDocument();
  });

  it("hides the sidebar alert panel on the tickets route so ticket warnings stay in one lane", () => {
    render(
      <ContextSidebar
        activeTab="trade_tickets"
        alerts={mockAlerts}
        context={mockAssetContexts.WTI}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        ribbon={mockRibbon}
        riskDetail={mockRiskDetail}
      />,
    );

    expect(screen.queryByText("Priority Alerts")).not.toBeInTheDocument();
  });
});
