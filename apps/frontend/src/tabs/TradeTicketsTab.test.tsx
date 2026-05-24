import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockAlerts, mockBrokerSnapshot, mockShadowTickets, mockTicketDetail, mockTicketList } from "../api/mockData";
import { TradeTicketsTab } from "./TradeTicketsTab";

describe("TradeTicketsTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders ticket detail, shadow mode, and manual fill actions", async () => {
    const createSpy = vi.spyOn(apiClient, "createTradeTicket").mockResolvedValue(mockTicketDetail);
    const saveChecklistSpy = vi.spyOn(apiClient, "updateTradeTicket").mockResolvedValue(mockTicketDetail);
    const fillSpy = vi.spyOn(apiClient, "createManualFill").mockResolvedValue(mockTicketDetail.manual_fills[0]);
    const onChanged = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={mockTicketDetail}
        onChanged={onChanged}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedRiskReportId={mockTicketDetail.risk_report_id}
        selectedRiskLabel="BTC stop 68450.00"
        selectedSignalLabel="BTC trend_breakout"
        selectedSignalId={mockTicketDetail.signal_id}
        selectedSymbol="BTC"
        selectedTicketId={mockTicketDetail.ticket_id}
        shadowRows={mockShadowTickets}
        tickets={mockTicketList}
      />,
    );

    expect(screen.getByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Focused Ticket" })).toBeInTheDocument();
    expect(screen.getAllByText(/Signal context: BTC trend_breakout/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Risk context: BTC stop 68450.00/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Paper Equity")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paper Execution Check" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manual Fill Review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ticket History" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Route Status" })).toBeInTheDocument();
    expect(screen.getByText("Read-only mock adapter surface only. No order routing is enabled.")).toBeInTheDocument();
    expect(screen.queryByText(mockTicketDetail.ticket_id)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create Draft Ticket" }));
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
      expect(onChanged).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Save Checklist" }));
    await waitFor(() => {
      expect(saveChecklistSpy).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Record Fill" }));
    await waitFor(() => {
      expect(fillSpy).toHaveBeenCalled();
    });
  });

  it("shows over-allocation and reconciliation exception warnings when values are extreme", () => {
    const extremeTicket = {
      ...mockTicketDetail,
      paper_account: {
        ...mockTicketDetail.paper_account!,
        allocated_capital: 12500,
      },
      manual_fills: [
        {
          ...mockTicketDetail.manual_fills[0],
          reconciliation: {
            ...mockTicketDetail.manual_fills[0].reconciliation,
            slippage_variance_bps: 120,
            requires_review: true,
          },
        },
      ],
    };

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={extremeTicket}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedRiskReportId={extremeTicket.risk_report_id}
        selectedRiskLabel="BTC stop 68450.00"
        selectedSignalLabel="BTC trend_breakout"
        selectedSignalId={extremeTicket.signal_id}
        selectedSymbol="BTC"
        selectedTicketId={extremeTicket.ticket_id}
        shadowRows={mockShadowTickets}
        tickets={mockTicketList}
      />,
    );

    expect(screen.getByText(/Paper account is over-allocated/i)).toBeInTheDocument();
    expect(screen.getByText(/Large slippage variance usually means the manual fill was recorded well away from the original plan/i)).toBeInTheDocument();
  });

  it("shows calm missing-link copy and hides dead open actions when linked setup references are gone", () => {
    const staleDetail = {
      ...mockTicketDetail,
      linked_signal: null,
      linked_risk: null,
    };

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={staleDetail}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedRiskReportId={staleDetail.risk_report_id}
        selectedRiskLabel="BTC stop 68450.00"
        selectedSignalLabel="BTC trend_breakout"
        selectedSignalId={staleDetail.signal_id}
        selectedSymbol="BTC"
        selectedTicketId={staleDetail.ticket_id}
        shadowRows={mockShadowTickets}
        tickets={mockTicketList}
      />,
    );

    expect(screen.getByText(/Linked setup is no longer available\./i)).toBeInTheDocument();
    expect(screen.getByText(/Linked risk frame is no longer available\./i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Signal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Risk" })).not.toBeInTheDocument();
  });

  it("prefills the draft ticket with the trader-facing symbol when internal context is canonical WTI", () => {
    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={mockTicketDetail}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={mockTicketDetail.risk_report_id}
        selectedRiskLabel="USOUSD stop 68450.00"
        selectedSignalLabel="USOUSD trend_breakout"
        selectedSignalId={mockTicketDetail.signal_id}
        selectedSymbol="WTI"
        selectedTicketId={mockTicketDetail.ticket_id}
        shadowRows={mockShadowTickets}
        tickets={mockTicketList}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Symbol" })).toHaveValue("USOUSD");
  });

  it("shows a specific retry state when summary counts exist but ticket rows failed to load", () => {
    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        hydrationError="Tickets request timed out."
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTicketId={null}
        shadowRows={[]}
        summaryCount={2}
        tickets={[]}
      />,
    );

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry ticket hydration" })).toBeInTheDocument();
  });

  it("uses shadow-mode rows as recent truthful context when no live ticket rows are open for the focused asset", () => {
    const silverShadowTicket = {
      ...mockShadowTickets[0],
      ticket_id: "ticket_silver_shadow_recent",
      symbol: "SILVER",
      display_symbol: "XAGUSD",
    };

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="XAGUSD"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="XAGUSD"
        selectedTicketId={null}
        shadowRows={[silverShadowTicket]}
        tickets={[]}
      />,
    );

    expect(screen.getByText(/No active ticket rows are open for XAGUSD\. Recent ticket history is available in the collapsed shadow history panel below\./i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ticket History" })).toBeInTheDocument();
  });

  it("hides cancelled or rejected ticket rows from the live table while keeping history available below", () => {
    const cancelledTicket = {
      ...mockTicketList[0],
      ticket_id: "ticket_cancelled_live_surface",
      symbol: "USOUSD",
      display_symbol: "USOUSD",
      status: "cancelled",
      approval_status: "rejected",
    };
    const shadowTicket = {
      ...mockShadowTickets[0],
      ticket_id: "ticket_shadow_history_uso",
      symbol: "USOUSD",
      display_symbol: "USOUSD",
    };

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="USOUSD"
        selectedTicketId={null}
        shadowRows={[shadowTicket]}
        tickets={[cancelledTicket]}
      />,
    );

    expect(screen.getByText(/No active ticket rows are open for USOUSD\. Recent ticket history is available in the collapsed shadow history panel below\./i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ticket History" })).toBeInTheDocument();
    const actionablePanel = screen.getByRole("heading", { name: "Ticket Queue" }).closest("article");
    expect(actionablePanel).not.toBeNull();
    expect(within(actionablePanel!).queryByRole("cell", { name: /Cancelled/i })).not.toBeInTheDocument();
    expect(within(actionablePanel!).queryByRole("cell", { name: /Rejected/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: /Cancelled/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("cell", { name: /Rejected/i }).length).toBeGreaterThan(0);
    expect(screen.getByText(/USOUSD \/ Trend Breakout \/ long \/ Cancelled \/ Rejected/i)).toBeInTheDocument();
  });

  it("falls back to strategy identity for historical duplicate-symbol tickets when no linked signal row remains", () => {
    const historicalBreakoutTicket = {
      ...mockTicketList[0],
      ticket_id: "ticket_history_uso_breakout",
      symbol: "USOUSD",
      display_symbol: "USOUSD",
      status: "cancelled",
      approval_status: "rejected",
      history_only: true,
    };
    const archivedFallbackTicket = {
      ...mockTicketList[0],
      ticket_id: "ticket_history_uso_mean_reversion",
      symbol: "USOUSD",
      display_symbol: "USOUSD",
      signal_id: null,
      linked_signal_family: "",
      strategy_id: "mean_reversion_fade",
      side: "short" as const,
      status: "cancelled",
      approval_status: "rejected",
      history_only: true,
    };

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="USOUSD"
        selectedTicketId={null}
        shadowRows={[]}
        tickets={[historicalBreakoutTicket, archivedFallbackTicket]}
      />,
    );

    expect(screen.getByText(/USOUSD \/ Trend Breakout \/ long \/ Cancelled \/ Rejected/i)).toBeInTheDocument();
    expect(screen.getByText(/USOUSD \/ Mean Reversion Fade \/ short \/ Cancelled \/ Rejected/i)).toBeInTheDocument();
  });

  it("ignores unrelated live ticket rows and settles on focused shadow context for the selected asset", () => {
    const silverShadowTicket = {
      ...mockShadowTickets[0],
      ticket_id: "ticket_silver_shadow_recent",
      symbol: "SILVER",
      display_symbol: "XAGUSD",
    };

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="XAGUSD"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="XAGUSD"
        selectedTicketId={null}
        shadowRows={[silverShadowTicket]}
        summaryCount={mockTicketList.length}
        tickets={[mockTicketList[0]]}
      />,
    );

    expect(screen.getByText(/No active ticket rows are open for XAGUSD\. Recent ticket history is available in the collapsed shadow history panel below\./i)).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: /BTC/i })).not.toBeInTheDocument();
  });

  it("shows focused last-known ticket context instead of generic loading copy when setup and risk context are already available", () => {
    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        hydrationLoading
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="USOUSD"
        selectedRiskLabel="USOUSD stop 77.80"
        selectedRiskReportId="risk_uso_001"
        selectedSignalId="sig_uso_001"
        selectedSignalLabel="USOUSD breakout"
        selectedSymbol="USOUSD"
        selectedTicketId={null}
        shadowRows={[]}
        summaryCount={1}
        tickets={[]}
      />,
    );

    expect(screen.queryByText(/still loading from the current paper-trade and shadow-mode state/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/are hydrating from the current paper-trade and shadow-mode state/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Ticket summary state is already live for USOUSD/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Draft Ticket Workflow" })).toBeInTheDocument();
    expect(screen.getAllByText(/Signal context: USOUSD breakout/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Risk context: USOUSD stop 77.80/i).length).toBeGreaterThan(0);
  });

  it("settles into an honest empty ticket state when summary says no open workflow is in scope", () => {
    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        hydrationLoading
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="USOUSD"
        selectedTicketId={null}
        shadowRows={[]}
        summaryCount={0}
        tickets={[]}
      />,
    );

    expect(screen.queryByText(/still loading from the current paper-trade and shadow-mode state/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/are hydrating from the current paper-trade and shadow-mode state/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No active ticket rows are open for USOUSD right now/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open Ticket Workflow" })).toBeInTheDocument();
    expect(screen.getByText(/Load setup context first, then open a draft ticket workflow/i)).toBeInTheDocument();
  });

  it("keeps active same-symbol ticket labels compact when family already disambiguates them", () => {
    const activeBreakoutTicket = {
      ...mockTicketList[0],
      ticket_id: "ticket_active_uso_breakout",
      symbol: "WTI",
      display_symbol: "USOUSD",
      linked_signal_family: "trend_breakout",
      strategy_id: "trend_breakout_v1",
      side: "long" as const,
      status: "ready_for_review",
      approval_status: "pending",
      history_only: false,
    };
    const activeFadeTicket = {
      ...mockTicketList[0],
      ticket_id: "ticket_active_uso_fade",
      symbol: "WTI",
      display_symbol: "USOUSD",
      linked_signal_family: "mean_reversion_fade",
      strategy_id: "mean_reversion_fade",
      side: "short" as const,
      status: "ready_for_review",
      approval_status: "pending",
      history_only: false,
    };

    render(
      <TradeTicketsTab
        brokerSnapshot={mockBrokerSnapshot}
        detail={null}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedDisplaySymbol="USOUSD"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="USOUSD"
        selectedTicketId={null}
        shadowRows={[]}
        tickets={[activeBreakoutTicket, activeFadeTicket]}
      />,
    );

    expect(screen.getByText(/^USOUSD \/ Trend Breakout \/ long \/ Ready for review \/ Pending$/i)).toBeInTheDocument();
    expect(screen.getByText(/^USOUSD \/ Mean Reversion Fade \/ short \/ Ready for review \/ Pending$/i)).toBeInTheDocument();
  });

  it("collapses ticket warnings into a top-three priority alert stack", () => {
    render(
      <TradeTicketsTab
        alerts={[
          ...mockAlerts,
          { ...mockAlerts[0], alert_id: "alert_extra_1", title: "Extra review alert", body: "Needs extra review.", severity: "warning", status: "sent", asset_ids: ["BTC"] },
          { ...mockAlerts[0], alert_id: "alert_extra_2", title: "Extra info alert", body: "Informational follow-up.", severity: "info", status: "sent", asset_ids: ["BTC"] },
        ]}
        brokerSnapshot={mockBrokerSnapshot}
        detail={mockTicketDetail}
        onChanged={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        selectedRiskReportId={mockTicketDetail.risk_report_id}
        selectedRiskLabel="BTC stop 68450.00"
        selectedSignalLabel="BTC trend_breakout"
        selectedSignalId={mockTicketDetail.signal_id}
        selectedSymbol="BTC"
        selectedTicketId={mockTicketDetail.ticket_id}
        shadowRows={mockShadowTickets}
        tickets={mockTicketList}
      />,
    );

    expect(screen.getByRole("heading", { name: "Priority Alerts" })).toBeInTheDocument();
    expect(screen.getAllByText(/critical|review required|informational/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/More alerts/i)).toBeInTheDocument();
  });
});
