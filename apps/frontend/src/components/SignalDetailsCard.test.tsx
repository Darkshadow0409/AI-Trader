import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockAssetContexts, mockSignalDetail } from "../api/mockData";
import { SignalDetailsCard } from "./SignalDetailsCard";

describe("SignalDetailsCard", () => {
  it("renders the data-reality block for the selected signal", () => {
    render(<SignalDetailsCard context={mockAssetContexts.BTC} detail={mockSignalDetail} />);

    expect(screen.getByText("score 52.0")).toBeInTheDocument();
    expect(screen.getByText("BTC aligns directly with BTCUSD.")).toBeInTheDocument();
    expect(screen.getByText("fixture_source")).toBeInTheDocument();
  });
});
