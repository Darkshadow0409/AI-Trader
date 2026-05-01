import { render, screen, waitFor, within } from "@testing-library/react";
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
  mockReviewSummary,
} from "../api/mockData";
import { JournalTab } from "./JournalTab";

describe("JournalTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders closed-trade review state and saves structured review updates", async () => {
    const saveSpy = vi.spyOn(apiClient, "upsertPaperTradeReview").mockResolvedValue(mockPaperTradeReviews[0]);
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const onNavigateWorkspaceTarget = vi.fn();
    const user = userEvent.setup();

    render(
      <JournalTab
        analytics={mockPaperTradeAnalytics}
        detail={mockPaperTradeDetail}
        onChanged={onChanged}
        onNavigateWorkspaceTarget={onNavigateWorkspaceTarget}
        onSelectTrade={vi.fn()}
        reviewSummary={mockReviewSummary}
        reviews={mockPaperTradeReviews}
        rows={mockJournal}
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
        trades={[...mockPaperTradesProposed, ...mockPaperTradesActive, ...mockPaperTradesClosed]}
        workspaceBaseState={{
          tab: "journal",
          symbol: "BTC",
          signalId: mockPaperTradeDetail.signal_id,
          riskReportId: mockPaperTradeDetail.risk_report_id,
          tradeId: mockPaperTradeDetail.trade_id,
          ticketId: null,
          reviewTaskId: null,
          timeframe: "1d",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Journal Console" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review Queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision Hygiene" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audit / History Trail" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review Chain" })).toBeInTheDocument();
    expect(screen.getAllByTitle("paper_trade_closed_btc").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Open asset workspace" })).toBeInTheDocument();
    expect(screen.getByText(/Unknown means the operator has not scored that review field yet/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Outcomes by Signal Family" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Failure Attribution" })).toBeInTheDocument();
    expect(screen.getAllByText(/BTCUSD \/ Trend Breakout \/ long \/ closed win/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(new RegExp(`Ticket linked:\\s*${mockReviewSummary.discipline_loop_proof.ticket_id}`, "i")),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(new RegExp(String(mockReviewSummary.review_chain_analytics.latest_loop_linkage_state).replace(/_/g, " "), "i")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/mixed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 partially linked reviewed loop/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 review task reopened after closure/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ETHUSD \/ Vol Expansion V1 \/ long \/ invalidated/i)).toBeInTheDocument();
    expect(screen.getByText(/Review exists, but both journal evidence and audit ticket linkage are still missing/i)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Open asset workspace" }));
    expect(onNavigateWorkspaceTarget).toHaveBeenCalled();

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
        reviewSummary={mockReviewSummary}
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

  it("keeps the fallback current symbol trader-facing when no trade is selected yet", () => {
    render(
      <JournalTab
        analytics={mockPaperTradeAnalytics}
        detail={null}
        onChanged={vi.fn()}
        onSelectTrade={vi.fn()}
        reviewSummary={mockReviewSummary}
        reviews={[]}
        rows={[]}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTradeId={null}
        trades={[]}
      />,
    );

    expect(screen.getByText(/Current symbol: USOUSD/i)).toBeInTheDocument();
    expect(screen.queryByText(/Current symbol: WTI/i)).not.toBeInTheDocument();
  });

  it("shows decision hygiene refresh copy instead of misleading zeroed metrics while analytics lag", () => {
    render(
      <JournalTab
        analytics={{
          ...mockPaperTradeAnalytics,
          hygiene_summary: {
            ...mockPaperTradeAnalytics.hygiene_summary,
            trade_count: 0,
            reviewed_trade_count: 0,
            adherence_rate: 0,
            invalidation_discipline_rate: 0,
            review_completion_rate: 0,
          },
        }}
        analyticsLoading
        detail={mockPaperTradeDetail}
        onChanged={vi.fn()}
        onSelectTrade={vi.fn()}
        reviewSummary={mockReviewSummary}
        reviews={mockPaperTradeReviews}
        rows={mockJournal}
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
        trades={[...mockPaperTradesProposed, ...mockPaperTradesActive, ...mockPaperTradesClosed]}
      />,
    );

    expect(screen.getByText("Review evidence is loaded. Decision hygiene metrics are refreshing.")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Decision Hygiene" }).closest("article")!).queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flagship Completed Loop" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Journal Console" })).toBeInTheDocument();
    expect(screen.getAllByText(/BTCUSD \/ Trend Breakout \/ long \/ closed win/i).length).toBeGreaterThan(0);
  });

  it("shows honest proof copy when the completed loop has no journal note attached yet", () => {
    render(
      <JournalTab
        analytics={mockPaperTradeAnalytics}
        detail={mockPaperTradeDetail}
        onChanged={vi.fn()}
        onSelectTrade={vi.fn()}
        reviewSummary={{
          ...mockReviewSummary,
          discipline_loop_proof: {
            ...mockReviewSummary.discipline_loop_proof,
            journal_id: null,
            journal_attached: false,
          },
        }}
        reviews={mockPaperTradeReviews}
        rows={mockJournal}
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
        trades={[...mockPaperTradesProposed, ...mockPaperTradesActive, ...mockPaperTradesClosed]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Flagship Completed Loop" })).toBeInTheDocument();
    expect(screen.getByText(/Trade and structured review evidence are attached\. Journal note is not attached yet\./i)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Ticket linked:\\s*${mockReviewSummary.discipline_loop_proof.ticket_id}`, "i")),
    ).toBeInTheDocument();
    expect(screen.getByText(/Linkage quality mixed/i)).toBeInTheDocument();
    expect(screen.getByText(/Showing latest fully linked reviewed loop\./i)).toBeInTheDocument();
  });
});
