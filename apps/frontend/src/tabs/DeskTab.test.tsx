import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockDeskSummary, mockHomeSummary, mockReviewSummary } from "../api/mockData";
import { DeskTab } from "./DeskTab";
import type { AssetReadinessView } from "../lib/assetReadiness";

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

const researchOnlyReadiness: AssetReadinessView = {
  kind: "research_only_today",
  badgeLabel: "Research-only today",
  headline: "USOUSD is usable for research, not direct execution timing.",
  summary: "Truth and risk posture are still too weak for direct ticket framing.",
  nextStep: "Stay in chart, research, and review workflow until a stronger setup returns.",
  tone: "warning",
};

function renderDeskTab(overrides: Partial<ComponentProps<typeof DeskTab>> = {}) {
  return render(
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
      reviewSummary={mockReviewSummary}
      selectedAssetReadiness={researchOnlyReadiness}
      selectedHasRisk={false}
      selectedHasSignal={false}
      selectedInstrumentLabel="USOUSD"
      selectedMappingNote="You trade USOUSD here. Research context still comes from WTI / CL=F."
      selectedUnderlyingLabel="WTI"
      {...overrides}
    />,
  );
}

function nonBlockingReviewSummary() {
  return {
    ...mockReviewSummary,
    accountability_metrics: {
      ...mockReviewSummary.accountability_metrics,
      gate_blocking_count: 0,
      clearance_status: "clearing",
    },
    gate_impact: {
      ...mockReviewSummary.gate_impact,
      gate_blocking_count: 0,
      gate_blocking_task_ids: [],
      clear_these_first: [],
    },
  };
}

describe("DeskTab", () => {
  it("renders a compressed operator desk with review pressure, signals, wire, and hidden workflow help", () => {
    renderDeskTab();

    expect(screen.getByRole("heading", { name: "What Matters Now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Priority Wire" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Queue Pressure" })).toBeInTheDocument();
    expect(screen.getByText("Gate-blocking reviews")).toBeInTheDocument();
    expect(screen.getByText("Oldest overdue")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "High-Priority Signals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review Queue first" })).toBeInTheDocument();
    expect(screen.getAllByText(/Trend Breakout/i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("desk-onboarding")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Start Here" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Board -> Chart -> Risk -> Ticket -> Review" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("desk-help-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Research-only today" })).toBeInTheDocument();
    expect(screen.getByText("USOUSD is usable for research, not direct execution timing.")).toBeInTheDocument();
    expect(screen.getByText(/Complete the overdue ETH post-trade review/i)).toBeInTheDocument();
  });

  it("opens workflow help on demand and keeps the demo path buttons usable", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onSelectTrade = vi.fn();

    renderDeskTab({ onNavigate, onSelectTrade });

    await user.click(screen.getByRole("button", { name: "Help / Workflow" }));
    await user.click(screen.getByRole("button", { name: "Open Ops Console" }));
    await user.click(screen.getByRole("button", { name: "Open Active Trades" }));

    expect(screen.getByTestId("desk-help-panel")).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("active_trades");
    expect(onSelectTrade).toHaveBeenCalled();
  });

  it("surfaces calm degraded desk notes when partial sections are degraded", () => {
    renderDeskTab({
      desk: {
        ...mockDeskSummary,
        section_notes: {
          adapter_health: "Adapter health is degraded. Using the last healthy adapter snapshot while refresh recovers.",
        },
      },
    });

    expect(screen.getByRole("heading", { name: "What Matters Now" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Degraded But Usable" })).not.toBeInTheDocument();
  });

  it("renders compact recovery telemetry when commodity truth is recovering", () => {
    renderDeskTab({
      desk: {
        ...mockDeskSummary,
        recovery_telemetry: {
          truth_state: "ready_last_verified",
          truth_label: "Commodity truth recovering",
          recovery_active: true,
          recovery_attempt_count: 3,
          recovery_last_attempt_at: "2026-03-15T11:28:00Z",
          recovery_next_attempt_at: "2026-03-15T11:29:00Z",
          recovery_reason: "current_truth_stale_for_operator_use",
          blocking_reason: "current_truth_stale_for_operator_use",
        },
      },
    });

    expect(screen.getByTestId("desk-recovery-telemetry")).toBeInTheDocument();
    expect(screen.getByText("Recovery active")).toBeInTheDocument();
    expect(screen.getByText(/Attempts 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Current commodity truth is too stale for operator use/i)).toBeInTheDocument();
  });

  it("shows last-good snapshot age and normalized operator counts when the desk is running from cached state", () => {
    renderDeskTab({
      desk: {
        ...mockDeskSummary,
        runtime_snapshot: {
          source_status: "degraded",
          generated_at: "2026-03-15T11:00:00Z",
          age_minutes: 30,
          using_last_good_snapshot: true,
        },
      },
      homeSummary: {
        ...mockHomeSummary,
        operator_state_summary: {
          open_review_items: 7,
          overdue_review_items: 2,
          open_tickets: 4,
          ready_for_review_tickets: 1,
          proposed_trades: 3,
          active_trades: 2,
        },
      },
    });

    expect(screen.getByText(/last good operator snapshot from 30m ago/i)).toBeInTheDocument();
    expect(within(screen.getAllByText("Review Queue")[0].closest("div")!).getByText("7")).toBeInTheDocument();
    expect(within(screen.getAllByText("Open Tickets")[0].closest("div")!).getByText("4")).toBeInTheDocument();
    expect(within(screen.getAllByText("Open Trades")[0].closest("div")!).getByText("2")).toBeInTheDocument();
  });

  it("changes first-step guidance when the selected asset is research-only versus execution-ready", () => {
    const onNavigate = vi.fn();

    renderDeskTab({
      onNavigate,
      executionGate: {
        ...mockDeskSummary.execution_gate,
        status: "execution_candidate",
        blockers: [],
        blocker_details: [],
      },
      reviewSummary: nonBlockingReviewSummary(),
    });

    expect(screen.getByText("Research USOUSD first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Research" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Commodity Board" })).toBeInTheDocument();
  });

  it("points an execution-ready asset toward risk or tickets instead of research", () => {
    const onNavigate = vi.fn();

    renderDeskTab({
      onNavigate,
      executionGate: {
        ...mockDeskSummary.execution_gate,
        status: "execution_candidate",
        blockers: [],
        blocker_details: [],
      },
      selectedAssetReadiness: {
        kind: "primary_path",
        badgeLabel: "Primary path",
        headline: "USOUSD is the clearest workflow path right now.",
        summary: "Truth is usable and risk context is already attached.",
        nextStep: "Use the chart first, then confirm Risk and Tickets from this same selected asset.",
        tone: "positive",
      },
      reviewSummary: nonBlockingReviewSummary(),
      selectedHasRisk: true,
      selectedHasSignal: true,
    });

    expect(screen.getByText("Advance USOUSD into risk or tickets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Selected Setup" })).toBeInTheDocument();
  });
});
