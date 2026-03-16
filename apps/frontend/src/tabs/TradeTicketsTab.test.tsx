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
        selectedSignalId={mockTicketDetail.signal_id}
        selectedSymbol="BTC"
        selectedTicketId={mockTicketDetail.ticket_id}
        shadowRows={mockShadowTickets}
        tickets={mockTicketList}
      />,
    );

    expect(screen.getByRole("heading", { name: "Trade Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ticket Detail" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shadow Mode" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manual Fill Reconciliation" })).toBeInTheDocument();
    expect(screen.getByText("Read-only mock adapter surface only. No order routing is enabled.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create Ticket" }));
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
});
