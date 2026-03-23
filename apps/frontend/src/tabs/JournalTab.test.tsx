import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import {
  mockJournal,
  mockPaperTradeAnalytics,
  mockPaperTradeDetail,
  mockPaperTradeReviews,
  mockPaperTradesActive,
  mockPaperTradesClosed,
  mockPaperTradesProposed,
} from "../api/mockData";
import { JournalTab } from "./JournalTab";

describe("JournalTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders closed-trade review state and saves structured review updates", async () => {
    const saveSpy = vi.spyOn(apiClient, "upsertPaperTradeReview").mockResolvedValue(mockPaperTradeReviews[0]);
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <JournalTab
        analytics={mockPaperTradeAnalytics}
        detail={mockPaperTradeDetail}
        onChanged={onChanged}
        onSelectTrade={vi.fn()}
        reviews={mockPaperTradeReviews}
        rows={mockJournal}
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
        trades={[...mockPaperTradesProposed, ...mockPaperTradesActive, ...mockPaperTradesClosed]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Review Queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision Hygiene" })).toBeInTheDocument();
    expect(screen.getAllByTitle("paper_trade_closed_btc").length).toBeGreaterThan(0);
    expect(screen.getByText(/Unknown means the operator has not scored that review field yet/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Outcomes by Strategy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Failure Attribution" })).toBeInTheDocument();

    const notesField = screen.getByLabelText("Operator Notes");
    await user.clear(notesField);
    await user.type(notesField, "Updated structured review note.");
    await user.clear(screen.getByLabelText("Failure Tags"));
    await user.type(screen.getByLabelText("Failure Tags"), "operator_timing");
    await user.click(screen.getByRole("button", { name: "Save Review" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        "paper_trade_closed_btc",
        expect.objectContaining({
          operator_notes: "Updated structured review note.",
          failure_categories: ["operator_timing"],
        }),
      );
      expect(onChanged).toHaveBeenCalled();
    });
  }, 10000);

  it("renders a calm journal-unavailable message instead of raw fetch text", () => {
    render(
      <JournalTab
        analytics={mockPaperTradeAnalytics}
        detail={mockPaperTradeDetail}
        error="TypeError: Failed to fetch"
        onChanged={vi.fn()}
        onSelectTrade={vi.fn()}
        reviews={mockPaperTradeReviews}
        rows={mockJournal}
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
        trades={[...mockPaperTradesProposed, ...mockPaperTradesActive, ...mockPaperTradesClosed]}
      />,
    );

    expect(screen.getByText(/Journal data is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument();
  });
});
