import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockAssetContexts, mockMarketCharts, mockRibbon, mockSelectedSignalWorkspace, mockSignalDetail } from "../api/mockData";
import { SignalDetailsCard } from "./SignalDetailsCard";

describe("SignalDetailsCard", () => {
  it("renders the data-reality block for the selected signal", () => {
    render(<SignalDetailsCard context={mockAssetContexts.BTC} detail={mockSignalDetail} ribbon={mockRibbon} />);

    expect(screen.getByText("Action / Risk Companion")).toBeInTheDocument();
    expect(screen.queryByText("Operator guidance")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reality-strip")).not.toBeInTheDocument();
    expect(screen.getByText("Risk Frame")).toBeInTheDocument();
    expect(screen.getByText("Catalyst Detail")).toBeInTheDocument();
    expect(screen.getByText("score 74.6")).toBeInTheDocument();
    expect(screen.getByText("Current context is running in deterministic fixture-first mode.")).toBeInTheDocument();
    expect(screen.getByText("signal 5m old")).toBeInTheDocument();
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

  it("renders fallback signal context immediately while detail refresh is still loading", () => {
    render(
      <SignalDetailsCard
        context={mockSelectedSignalWorkspace.asset_context}
        detail={null}
        loading
        ribbon={mockRibbon}
      />,
    );

    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
    expect(screen.getByText("Action / Risk Companion")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "USOUSD Setup" })).toBeInTheDocument();
    expect(screen.getByText(/Oil is holding above the recent pullback zone/i)).toBeInTheDocument();
    expect(screen.getByText(/Refreshing detailed signal context/i)).toBeInTheDocument();
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

    expect(screen.getByText(/Chart stale/i)).toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes("18m / fresh"))).not.toBeInTheDocument();
  });

  it("keeps the chart lane as the proposal home instead of rendering a second action center", () => {
    render(
      <SignalDetailsCard
        context={mockAssetContexts.WTI}
        detail={{ ...mockSignalDetail, ...mockAssetContexts.WTI.latest_signal!, related_risk: null }}
        ribbon={mockRibbon}
      />,
    );

    expect(screen.queryByRole("button", { name: /Proposal|Review Before Proposal/i })).not.toBeInTheDocument();
    expect(screen.getByText("Supplemental note")).toBeInTheDocument();
  });

  it("never renders a commodity freshness badge as execution-grade when execution is disallowed", () => {
    render(
      <SignalDetailsCard
        context={{
          ...mockAssetContexts.WTI,
          data_reality: {
            ...mockAssetContexts.WTI.data_reality!,
            freshness_state: "fresh",
            execution_grade_allowed: false,
          },
        }}
        detail={{
          ...mockSignalDetail,
          symbol: "WTI",
          display_symbol: "USOUSD",
          data_reality: {
            ...mockAssetContexts.WTI.data_reality!,
            freshness_state: "fresh",
            execution_grade_allowed: false,
          },
        }}
        ribbon={mockRibbon}
      />,
    );

    expect(screen.getByText(/Chart context only/i)).toBeInTheDocument();
    expect(screen.queryByText("E / fresh")).not.toBeInTheDocument();
  });

  it("renders the selected-asset action companion with next-step and catalyst framing for oil", () => {
    render(
      <SignalDetailsCard
        chart={mockMarketCharts["WTI:1d"]}
        context={mockAssetContexts.WTI}
        detail={{ ...mockSignalDetail, ...mockAssetContexts.WTI.latest_signal! }}
        ribbon={mockRibbon}
      />,
    );

    expect(screen.getByText("Action / Risk Companion")).toBeInTheDocument();
    expect(screen.queryByText("Operator guidance")).not.toBeInTheDocument();
    expect(screen.getByText("Catalyst Detail")).toBeInTheDocument();
    expect(screen.getAllByText(/USOUSD/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/WTI/i).length).toBeGreaterThan(0);
  });
});
