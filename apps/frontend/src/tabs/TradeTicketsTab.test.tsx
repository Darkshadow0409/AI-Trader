import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockBrokerSnapshot, mockShadowTickets, mockTicketDetail, mockTicketList } from "../api/mockData";
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

    expect(screen.getByRole("heading", { name: "Trade Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ticket Detail" })).toBeInTheDocument();
    expect(screen.getByText(/Signal: BTC trend_breakout/i)).toBeInTheDocument();
    expect(screen.getByText(/Risk: BTC stop 68450.00/i)).toBeInTheDocument();
    expect(screen.getByText("Paper Equity")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shadow Mode" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manual Fill Reconciliation" })).toBeInTheDocument();
    expect(screen.getByText("Read-only mock adapter surface only. No order routing is enabled.")).toBeInTheDocument();

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

    expect(screen.getByText(/Allocated capital exceeds the 10k paper account/i)).toBeInTheDocument();
    expect(screen.getByText(/Large slippage variance usually means the manual fill was recorded well away from the original plan/i)).toBeInTheDocument();
  });
});
