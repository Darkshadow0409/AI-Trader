import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockDailyBriefing,
  mockExecutionGate,
  mockOperationalBacklog,
  mockReviewSummary,
  mockReviewTasks,
  mockSessionOverview,
  mockWeeklyReview,
} from "../api/mockData";

vi.mock("../api/client", () => ({
  apiClient: {
    updateReviewTask: vi.fn().mockResolvedValue(mockReviewTasks[0]),
  },
}));

import { apiClient } from "../api/client";
import { SessionDashboardTab } from "./SessionDashboardTab";

describe("SessionDashboardTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders session states, review queue, and weekly review summaries", () => {
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={mockSessionOverview}
        reviewSummary={mockReviewSummary}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    expect(screen.getByRole("heading", { name: "Accountability Console" })).toBeInTheDocument();
    expect(screen.getByText("What clears next")).toBeInTheDocument();
    expect(screen.getAllByText("Flagship Completed Loop").length).toBeGreaterThan(0);
    expect(screen.getByText("Review Chain")).toBeInTheDocument();
    expect(screen.getByText("Linkage Quality")).toBeInTheDocument();
    expect(screen.getByText("Pressure by Family")).toBeInTheDocument();
    expect(screen.getAllByText("blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Session States").length).toBeGreaterThan(0);
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("Gate Blocking")).toBeInTheDocument();
    expect(screen.getByText("Archived / History")).toBeInTheDocument();
    expect(screen.getAllByText("Operational Backlog").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Weekly Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BTC open trade check-in").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ETH post-trade review due").length).toBeGreaterThan(0);
    expect(screen.getByText("USOUSD stale post-trade review")).toBeInTheDocument();
    expect(screen.getByText(/BTCUSD \/ Trend Breakout \/ long \/ closed win/i)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Ticket linked:\\s*${mockReviewSummary.discipline_loop_proof.ticket_id}`, "i")),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(new RegExp(String(mockReviewSummary.review_chain_analytics.latest_loop_linkage_state).replace(/_/g, " "), "i")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/fully linked/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 partially linked reviewed loop/i)).toBeInTheDocument();
    expect(screen.getByText(/1 review task reopened after closure/i)).toBeInTheDocument();
    expect(screen.getAllByText(/mixed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Showing latest fully linked reviewed loop\./i)).toBeInTheDocument();
    expect(screen.getByText(/ETHUSD \/ Vol Expansion V1 \/ long \/ invalidated/i)).toBeInTheDocument();
    expect(screen.getByText(/Capture the missing journal and link or create the paper-only audit ticket/i)).toBeInTheDocument();
  });

  it("lets the operator mark a review task done", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={onChanged}
        overview={mockSessionOverview}
        reviewSummary={mockReviewSummary}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "mark reviewed" })[0]);

    await waitFor(() => {
      expect(apiClient.updateReviewTask).toHaveBeenCalledWith(mockReviewTasks[1].task_id, { action: "done" });
    });
  });

  it("lets the operator move a review task into progress", async () => {
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={mockSessionOverview}
        reviewSummary={mockReviewSummary}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "in progress" })[0]);

    await waitFor(() => {
      expect(apiClient.updateReviewTask).toHaveBeenCalledWith(mockReviewTasks[1].task_id, { action: "in_progress" });
    });
  });

  it("keeps backlog-backed queue rows visible instead of rendering a false empty state", () => {
    render(
      <SessionDashboardTab
        backlog={{
          ...mockOperationalBacklog,
          items: [
            {
              item_id: "review_task_backlog_uso",
              category: "post_trade_review_due",
              title: "USOUSD post-trade review due",
              priority: "high",
              status: "overdue",
              linked_symbol: "WTI",
              linked_entity_type: "paper_trade_review",
              linked_entity_id: "paper_trade_uso_closed",
              due_at: "2026-03-15T11:30:00Z",
              freshness_minutes: 30,
              note: "Closed paper trade is awaiting structured review.",
            },
          ],
        }}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={{ ...mockSessionOverview, review_tasks: [] }}
        reviewCount={1}
        reviewQueueNote="Using backlog-backed review rows while the detailed queue is still reconciling."
        reviewQueueState="reconciling"
        reviewSummary={mockReviewSummary}
        reviewTasks={[
          {
            ...mockReviewTasks[0],
            task_id: "review_task_backlog_uso",
            title: "USOUSD post-trade review due",
            summary: "Closed paper trade is awaiting structured review.",
            display_symbol: "USOUSD",
            metadata: { backlog_fallback: true },
          },
        ]}
        weeklyReview={mockWeeklyReview}
      />,
    );

    expect(screen.getByRole("heading", { name: "Accountability Console" })).toBeInTheDocument();
    expect(screen.queryByText("No review tasks generated.")).not.toBeInTheDocument();
    expect(screen.getAllByText("USOUSD post-trade review due").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Using backlog-backed review rows while the detailed queue is still reconciling.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "mark reviewed" }).length).toBeGreaterThan(0);
  });

  it("shows a loading continuity state instead of a false empty queue when review work is still expected", () => {
    render(
      <SessionDashboardTab
        backlog={{
          ...mockOperationalBacklog,
          items: [],
          overdue_count: 1,
          high_priority_count: 1,
        }}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        loading
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={{ ...mockSessionOverview, review_tasks: [] }}
        reviewCount={1}
        reviewQueueNote="Queue summary shows 1 review item(s). Detailed queue rows are still hydrating."
        reviewQueueState="loading_expected_rows"
        reviewSummary={mockReviewSummary}
        reviewTasks={[]}
        weeklyReview={mockWeeklyReview}
      />,
    );

    expect(screen.queryByText("No review tasks generated.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Queue summary live, detail hydrating").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Queue summary shows 1 review item(s). Detailed queue rows are still hydrating.").length).toBeGreaterThan(0);
  });

  it("shows identity context when multiple review tasks share the same title", () => {
    const duplicateTitleTasks = [
      {
        ...mockReviewTasks[0],
        task_id: "review_task_btc_a",
        title: "BTCUSD post-trade review due",
        linked_entity_type: "paper_trade_review",
        linked_entity_id: "paper_trade_btc_a",
        created_at: "2026-03-15T11:30:00Z",
      },
      {
        ...mockReviewTasks[0],
        task_id: "review_task_btc_b",
        title: "BTCUSD post-trade review due",
        linked_entity_type: "paper_trade_review",
        linked_entity_id: "paper_trade_btc_b",
        created_at: "2026-04-01T16:06:32Z",
      },
    ];

    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={mockSessionOverview}
        reviewSummary={mockReviewSummary}
        reviewTasks={duplicateTitleTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    expect(screen.getAllByText("BTCUSD post-trade review due").length).toBe(2);
    expect(screen.getByText(/paper trade review: paper_trade_btc_a/i)).toBeInTheDocument();
    expect(screen.getByText(/paper trade review: paper_trade_btc_b/i)).toBeInTheDocument();
  });

  it("adds a direct asset workspace jump without replacing the existing open action", () => {
    const onNavigateWorkspaceTarget = vi.fn();

    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onNavigateWorkspaceTarget={onNavigateWorkspaceTarget}
        overview={mockSessionOverview}
        reviewSummary={mockReviewSummary}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
        workspaceBaseState={{
          tab: "session",
          symbol: "BTC",
          signalId: null,
          riskReportId: null,
          tradeId: null,
          ticketId: null,
          reviewTaskId: null,
          timeframe: "1d",
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole("link", { name: "asset workspace" })[0]);
    expect(onNavigateWorkspaceTarget).toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: "open" }).length).toBeGreaterThan(0);
  });

  it("lets the operator archive a stale review task into history", async () => {
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={mockSessionOverview}
        reviewSummary={mockReviewSummary}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "archive" })[0]);

    await waitFor(() => {
      expect(apiClient.updateReviewTask).toHaveBeenCalledWith(mockReviewTasks[1].task_id, { action: "archive" });
    });
  });

  it("lets the operator reopen an archived review item", async () => {
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={mockExecutionGate}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={mockSessionOverview}
        reviewSummary={mockReviewSummary}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    await waitFor(() => {
      expect(apiClient.updateReviewTask).toHaveBeenCalledWith("review_task_archived_uso", { state: "open" });
    });
  });

  it("explains when the gate is blocked by baseline or data blockers instead of review tasks", () => {
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        executionGate={{
          ...mockExecutionGate,
          status: "not_ready",
          blockers: ["pilot baseline is not established yet"],
          blocker_details: [
            {
              code: "pilot_baseline_not_established",
              severity: "warning",
              category: "baseline",
              rank: 1,
              metric_value: 0,
              threshold: 1,
              scope_count: 1,
              excluded_count: 0,
              explanation: "No integrity-valid pilot tickets have been created yet.",
              next_step: "Create the first clean loop.",
            },
          ],
        }}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={mockSessionOverview}
        reviewSummary={{
          ...mockReviewSummary,
          gate_impact: {
            ...mockReviewSummary.gate_impact,
            gate_blocking_count: 0,
            gate_blocking_task_ids: [],
            clear_these_first: [],
          },
        }}
        reviewTasks={mockReviewTasks.filter((task) => !task.overdue)}
        weeklyReview={mockWeeklyReview}
      />,
    );

    expect(screen.getByText("Gate is currently blocked by baseline or data blockers, not by review tasks.")).toBeInTheDocument();
  });
});
