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
            signal_id: "sig_test_btc",
            symbol: "BTC",
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
            affected_assets: ["BTC"],
            features: {},
          },
        ]}
        selectedSymbol="ETH"
      />,
    );

    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("74.6")).toBeInTheDocument();
    expect(screen.getByText("79%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("BTC"));
    expect(onSelectSymbol).toHaveBeenCalledWith("BTC");
  });
});
