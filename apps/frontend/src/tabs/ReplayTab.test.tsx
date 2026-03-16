import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockPaperTradeDetail, mockReplay, mockScenarioStressSummary } from "../api/mockData";
import { ReplayTab } from "./ReplayTab";

describe("ReplayTab", () => {
  it("renders replay frames, scenario stress, and timeline summaries", () => {
    render(
      <ReplayTab
        replay={mockReplay}
        scenarioStress={mockScenarioStressSummary}
        timeline={mockPaperTradeDetail.timeline}
      />,
    );

    expect(screen.getByRole("heading", { name: "Replay Frames" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scenario Stress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trade Timeline" })).toBeInTheDocument();
    expect(screen.getAllByText(/paper_trade_closed_btc/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("btc_down").length).toBeGreaterThan(0);
  });
});
