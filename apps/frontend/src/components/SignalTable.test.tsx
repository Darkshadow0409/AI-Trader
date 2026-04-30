import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignalTable } from "./SignalTable";

describe("SignalTable", () => {
  it("renders dense signal rows and supports symbol drill-down", () => {
    const onSelectSymbol = vi.fn();
    render(
      <SignalTable
        onSelectSymbol={onSelectSymbol}
        rows={[
          {
            signal_id: "sig_test_wti",
            symbol: "WTI",
            signal_type: "trend_breakout",
            timestamp: "2026-03-15T11:25:00Z",
            freshness_minutes: 5,
            direction: "long",
            score: 74.6,
            confidence: 0.79,
            noise_probability: 0.22,
            thesis: "Breakout intact",
            invalidation: 68450,
            targets: { base: 73120, stretch: 74840 },
            uncertainty: 0.21,
            data_quality: "fixture",
            affected_assets: ["WTI", "USOUSD"],
            features: {
              setup_family: "trend_breakout",
              setup_status: "actionable",
              regime: "trend_breakout",
              entry_zone: { low: 70220, high: 70610 },
              why_now: ["Relative volume is expanding into the breakout."],
            },
            data_reality: null,
          },
        ]}
        selectedSymbol="ETH"
      />,
    );

    const wtiCells = screen.getAllByText("WTI");
    expect(wtiCells.length).toBeGreaterThan(0);
    expect(screen.getByText("74.6")).toBeInTheDocument();
    expect(screen.getByText("79%")).toBeInTheDocument();
    expect(screen.getByText("actionable")).toBeInTheDocument();
    expect(screen.getAllByText("trend breakout")).toHaveLength(2);
    expect(screen.getByText("70220.00 / 68450.00")).toBeInTheDocument();
    expect(screen.getByText("Relative volume is expanding into the breakout.")).toBeInTheDocument();
    fireEvent.click(wtiCells[wtiCells.length - 1]);
    expect(onSelectSymbol).toHaveBeenCalledWith("WTI");
  });
});
