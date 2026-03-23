import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockDeskSummary, mockHomeSummary } from "../api/mockData";
import { DeskTab } from "./DeskTab";

const paperCapitalSummary = {
  accountSize: 10000,
  equity: 10120,
  allocated: 1800,
  openRisk: 250,
  targetPnl: 430,
  stretchPnl: 620,
  stopLoss: -240,
  riskPct: 2.5,
  openExposureCount: 2,
  overAllocated: false,
};

describe("DeskTab", () => {
  it("renders the operator home view with review, signals, tickets, divergence, and demo helpers", () => {
    render(
      <DeskTab
        desk={mockDeskSummary}
        executionGate={mockDeskSummary.execution_gate}
        homeSummary={mockHomeSummary}
        onNavigate={vi.fn()}
        onOpenCommandCenter={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        operationalBacklog={mockDeskSummary.operational_backlog}
        onSelectSymbol={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        paperCapitalSummary={paperCapitalSummary}
      />,
    );

    expect(screen.getByRole("heading", { name: "Board -> Chart -> Risk -> Ticket -> Review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "10k Paper Capital" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What Matters Now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review Queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "High-Priority Signals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shadow Divergence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next Actions" })).toBeInTheDocument();
    expect(screen.getByText("ticket_btc_manual")).toBeInTheDocument();
    expect(screen.getByTestId("desk-onboarding")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start Here" })).toBeInTheDocument();
    expect(screen.getByText(/Command Center handles safe operational actions/i)).toBeInTheDocument();
    expect(screen.getByText(/paper-trading and pilot mode only/i)).toBeInTheDocument();
  });

  it("lets the operator dismiss the onboarding card and use the demo path buttons", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onSelectTrade = vi.fn();

    render(
      <DeskTab
        desk={mockDeskSummary}
        executionGate={mockDeskSummary.execution_gate}
        homeSummary={mockHomeSummary}
        onNavigate={onNavigate}
        onOpenCommandCenter={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        operationalBacklog={mockDeskSummary.operational_backlog}
        onSelectSymbol={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={onSelectTrade}
        paperCapitalSummary={paperCapitalSummary}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await user.click(screen.getByRole("button", { name: "6. AI Desk" }));
    await user.click(screen.getByRole("button", { name: "Open Active Trades" }));

    expect(screen.queryByTestId("desk-onboarding")).not.toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("ai_desk");
    expect(onNavigate).toHaveBeenCalledWith("active_trades");
    expect(onSelectTrade).toHaveBeenCalled();
  });

  it("surfaces calm degraded desk notes when partial sections are degraded", () => {
    render(
      <DeskTab
        desk={{
          ...mockDeskSummary,
          section_notes: {
            adapter_health: "Adapter health is degraded. Using the last healthy adapter snapshot while refresh recovers.",
          },
        }}
        executionGate={mockDeskSummary.execution_gate}
        homeSummary={mockHomeSummary}
        onNavigate={vi.fn()}
        onOpenCommandCenter={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        operationalBacklog={mockDeskSummary.operational_backlog}
        onSelectSymbol={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
        paperCapitalSummary={paperCapitalSummary}
      />,
    );

    expect(screen.getByRole("heading", { name: "Degraded But Usable" })).toBeInTheDocument();
    expect(screen.getAllByText(/Adapter Health/i).length).toBeGreaterThan(0);
  });
});
