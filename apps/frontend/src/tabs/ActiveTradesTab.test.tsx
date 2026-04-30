import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockAssetContexts, mockPaperTradeDetail, mockPaperTradesActive, mockPaperTradesClosed, mockPaperTradesProposed } from "../api/mockData";
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
        selectedSignalReality={mockAssetContexts.BTC.data_reality}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
      />,
    );

    expect(screen.getByRole("heading", { name: "Proposed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Closed/ })).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Closed win").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BTCUSD \/ Trend Breakout \/ long \/ Closed win/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("BTCUSD -> BTCUSD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Research only").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "10k Paper Account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Execution Realism" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trade Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scenario Stress" })).toBeInTheDocument();
    expect(screen.getByText(/Signal context:/i)).toBeInTheDocument();
    expect(screen.getByText(/Risk context:/i)).toBeInTheDocument();

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

  it("shows calm missing-link copy and hides open actions when linked setup references are gone", () => {
    const staleDetail = {
      ...mockPaperTradeDetail,
      linked_signal: null,
      linked_risk: null,
    };

    render(
      <ActiveTradesTab
        activeRows={mockPaperTradesActive}
        closedRows={mockPaperTradesClosed}
        detail={staleDetail}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={vi.fn()}
        proposedRows={mockPaperTradesProposed}
        selectedRiskReportId={staleDetail.risk_report_id}
        selectedSignalReality={mockAssetContexts.BTC.data_reality}
        selectedSignalId={staleDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={staleDetail.trade_id}
      />,
    );

    expect(screen.getByText(/Linked setup is no longer available\./i)).toBeInTheDocument();
    expect(screen.getByText(/Linked risk frame is no longer available\./i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Signal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Risk" })).not.toBeInTheDocument();
  });

  it("shows explicit hydration copy instead of contradictory emptiness when trade rows are still loading", () => {
    render(
      <ActiveTradesTab
        activeLoading
        activeRows={[]}
        closedRows={[]}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={vi.fn()}
        openTradeCount={2}
        proposedLoading
        proposedRows={[]}
        selectedRiskReportId={null}
        selectedSignalReality={mockAssetContexts.BTC.data_reality}
        selectedSignalId={null}
        selectedSymbol="BTC"
        selectedTradeId={null}
      />,
    );

    expect(screen.getByText(/Proposed rows are hydrating from the current paper-trade state/i)).toBeInTheDocument();
    expect(screen.getByText(/Active rows are hydrating from the current paper-trade state/i)).toBeInTheDocument();
  });

  it("surfaces recent closed workflow context when no active or proposed trades are open for the focused asset", () => {
    const recentUsoClosedTrade = {
      ...mockPaperTradesClosed[0],
      trade_id: "paper_trade_uso_recent",
      symbol: "WTI",
      display_symbol: "USOUSD",
      review_due: true,
    };

    render(
      <ActiveTradesTab
        activeRows={[]}
        closedRows={[recentUsoClosedTrade]}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={vi.fn()}
        proposedRows={[]}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={null}
        selectedSignalReality={mockAssetContexts.WTI.data_reality}
        selectedSignalId={null}
        selectedSymbol="USOUSD"
        selectedTradeId={null}
      />,
    );

    expect(screen.getByText(/Last known workflow context is 1 recently closed trade\(s\), with 1 still awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText(/The most recent truthful context is 1 closed trade\(s\), with 1 review item\(s\) still due/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Closed / Recent context" })).toBeInTheDocument();
  });

  it("keeps the focused asset on recent closed context instead of drifting to unrelated rows", () => {
    const recentUsoClosedTrade = {
      ...mockPaperTradesClosed[0],
      trade_id: "paper_trade_uso_recent",
      symbol: "WTI",
      display_symbol: "USOUSD",
      review_due: true,
    };

    render(
      <ActiveTradesTab
        activeRows={[mockPaperTradesActive[0]]}
        closedRows={[recentUsoClosedTrade]}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={vi.fn()}
        proposedRows={[]}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={null}
        selectedSignalReality={mockAssetContexts.WTI.data_reality}
        selectedSignalId={null}
        selectedSymbol="USOUSD"
        selectedTradeId={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Closed / Recent context" })).toBeInTheDocument();
    expect(screen.getByText(/Last known workflow context is 1 recently closed trade\(s\), with 1 still awaiting review/i)).toBeInTheDocument();
  });

  it("defaults trader-facing oil proposals to USOUSD when the selected symbol is internal WTI", async () => {
    const createSpy = vi.spyOn(apiClient, "createProposedPaperTrade").mockResolvedValue(mockPaperTradeDetail);
    const user = userEvent.setup();

    render(
      <ActiveTradesTab
        activeRows={[]}
        closedRows={[]}
        detail={null}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={vi.fn()}
        proposedRows={[]}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalReality={mockAssetContexts.WTI.data_reality}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="WTI"
        selectedTradeId={null}
      />,
    );

    expect(screen.getByDisplayValue("USOUSD")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create Proposed Trade" }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ symbol: "USOUSD" }));
    });
  });

  it("blocks operator actions and generic retry copy for integrity-screened broken active trades", () => {
    const brokenTrade = {
      ...mockPaperTradeDetail,
      integrity_state: "broken",
      integrity_note: "Linked signal and risk context no longer resolve cleanly.",
      linked_signal: null,
      linked_risk: null,
    };

    render(
      <ActiveTradesTab
        activeRows={[]}
        closedRows={mockPaperTradesClosed}
        detail={brokenTrade}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={vi.fn()}
        openTradeCount={0}
        proposedRows={[]}
        selectedRiskReportId={brokenTrade.risk_report_id}
        selectedSignalReality={mockAssetContexts.WTI.data_reality}
        selectedSignalId={brokenTrade.signal_id}
        selectedSymbol="WTI"
        selectedTradeId={brokenTrade.trade_id}
      />,
    );

    expect(screen.getByText(/Integrity state: Broken/i)).toBeInTheDocument();
    expect(screen.getByText(/Linked signal and risk context no longer resolve cleanly\./i)).toBeInTheDocument();
    expect(screen.getByText(/Operator actions are blocked here until the trade is reconciled/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scale In" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry trade hydration/i })).not.toBeInTheDocument();
  });

  it("keeps active same-symbol labels compact when family and side already disambiguate them", () => {
    const activeBreakout = {
      ...mockPaperTradesActive[0],
      trade_id: "paper_trade_active_btc_breakout",
      symbol: "BTC",
      linked_signal_family: "trend_breakout",
      strategy_id: "trend_breakout_v1",
      side: "long" as const,
      status: "opened",
      data_reality: mockAssetContexts.BTC.data_reality,
    };
    const activeFade = {
      ...mockPaperTradesActive[0],
      trade_id: "paper_trade_active_btc_fade",
      symbol: "BTC",
      linked_signal_family: "mean_reversion_fade",
      strategy_id: "mean_reversion_fade",
      side: "short" as const,
      status: "opened",
      data_reality: mockAssetContexts.BTC.data_reality,
    };

    render(
      <ActiveTradesTab
        activeRows={[activeBreakout, activeFade]}
        closedRows={mockPaperTradesClosed}
        detail={mockPaperTradeDetail}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTrade={vi.fn()}
        proposedRows={[]}
        selectedRiskReportId={mockPaperTradeDetail.risk_report_id}
        selectedSignalReality={mockAssetContexts.BTC.data_reality}
        selectedSignalId={mockPaperTradeDetail.signal_id}
        selectedSymbol="BTC"
        selectedTradeId={mockPaperTradeDetail.trade_id}
      />,
    );

    expect(screen.getByText(/^BTCUSD \/ Trend Breakout \/ long \/ Active$/i)).toBeInTheDocument();
    expect(screen.getByText(/^BTCUSD \/ Mean Reversion Fade \/ short \/ Active$/i)).toBeInTheDocument();
  });
});
