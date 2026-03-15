import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockPaperTradeDetail, mockPaperTradesActive, mockPaperTradesClosed, mockPaperTradesProposed } from "../api/mockData";
import { ActiveTradesTab } from "./ActiveTradesTab";

describe("ActiveTradesTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders proposed, active, and closed paper trades and can create a proposed trade", async () => {
    const createSpy = vi.spyOn(apiClient, "createProposedPaperTrade").mockResolvedValue(mockPaperTradeDetail);
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const onSelectTrade = vi.fn();
    const user = userEvent.setup();

    render(
      <ActiveTradesTab
        activeRows={mockPaperTradesActive}
        closedRows={mockPaperTradesClosed}
        detail={mockPaperTradeDetail}
        onChanged={onChanged}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={onSelectTrade}
        proposedRows={mockPaperTradesProposed}
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
      />,
    );

    expect(screen.getByRole("heading", { name: "Proposed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Closed" })).toBeInTheDocument();
    expect(screen.getByText("opened")).toBeInTheDocument();
    expect(screen.getAllByText("closed_win").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Create Proposed Trade" }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: mockPaperTradeDetail.signal_id,
          risk_report_id: mockPaperTradeDetail.risk_report_id,
          symbol: "BTC",
        }),
      );
      expect(onChanged).toHaveBeenCalled();
      expect(onSelectTrade).toHaveBeenCalledWith(mockPaperTradeDetail.trade_id);
    });
  });
});
