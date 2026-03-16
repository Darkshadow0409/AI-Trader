import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockDailyBriefing, mockOperationalBacklog, mockReviewTasks, mockSessionOverview, mockWeeklyReview } from "../api/mockData";

vi.mock("../api/client", () => ({
  apiClient: {
    updateReviewTask: vi.fn().mockResolvedValue(mockReviewTasks[0]),
  },
}));

import { apiClient } from "../api/client";
import { SessionDashboardTab } from "./SessionDashboardTab";

describe("SessionDashboardTab", () => {
  it("renders session states, review queue, and weekly review summaries", () => {
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        overview={mockSessionOverview}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    expect(screen.getByText("Session States")).toBeInTheDocument();
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("Operational Backlog")).toBeInTheDocument();
    expect(screen.getAllByText("Weekly Review").length).toBeGreaterThan(0);
    expect(screen.getByText("BTC open trade check-in")).toBeInTheDocument();
    expect(screen.getAllByText("ETH post-trade review due").length).toBeGreaterThan(0);
  });

  it("lets the operator mark a review task done", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <SessionDashboardTab
        backlog={mockOperationalBacklog}
        dailyBriefing={mockDailyBriefing}
        onChanged={onChanged}
        overview={mockSessionOverview}
        reviewTasks={mockReviewTasks}
        weeklyReview={mockWeeklyReview}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "done" })[0]);

    await waitFor(() => {
      expect(apiClient.updateReviewTask).toHaveBeenCalledWith(mockReviewTasks[0].task_id, { state: "done" });
    });
  });
});
