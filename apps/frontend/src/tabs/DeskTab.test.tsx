import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockDeskSummary, mockHomeSummary } from "../api/mockData";
import { DeskTab } from "./DeskTab";

describe("DeskTab", () => {
  it("renders the operator home view with review, signals, tickets, and divergence", () => {
    render(
      <DeskTab
        desk={mockDeskSummary}
        homeSummary={mockHomeSummary}
        onOpenCommandCenter={vi.fn()}
        onOpenRisk={vi.fn()}
        onOpenSignal={vi.fn()}
        onSelectSymbol={vi.fn()}
        onSelectTicket={vi.fn()}
        onSelectTrade={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "What Matters Now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review Queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "High-Priority Signals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shadow Divergence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next Actions" })).toBeInTheDocument();
    expect(screen.getByText("ticket_btc_manual")).toBeInTheDocument();
  });
});
