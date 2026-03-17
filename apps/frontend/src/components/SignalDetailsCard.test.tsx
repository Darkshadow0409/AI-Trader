import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockAssetContexts, mockSignalDetail } from "../api/mockData";
import { SignalDetailsCard } from "./SignalDetailsCard";

describe("SignalDetailsCard", () => {
  it("renders the data-reality block for the selected signal", () => {
    render(<SignalDetailsCard context={mockAssetContexts.BTC} detail={mockSignalDetail} />);

    expect(screen.getByText("score 48.0")).toBeInTheDocument();
    expect(screen.getByText("BTC research symbol BTCUSD aligns directly with BTCUSD on binance_spot.")).toBeInTheDocument();
    expect(screen.getAllByText("research_only").length).toBeGreaterThan(0);
    expect(screen.getByText("Fixture timing semantics support deterministic local testing only.")).toBeInTheDocument();
    expect(screen.getByText("fixture_source")).toBeInTheDocument();
    expect(screen.getByText("Direct btc linkage, asset-specific wording. High volume. Active recent trading.")).toBeInTheDocument();
  });
});
