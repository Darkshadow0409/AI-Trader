import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockCommandCenter, mockOpsSummary } from "../api/mockData";
import { CommandCenter } from "./CommandCenter";

describe("CommandCenter", () => {
  it("renders status, history, and triggers approved actions", async () => {
    const actionSpy = vi.spyOn(apiClient, "runSystemAction").mockResolvedValue(mockOpsSummary.action_history[0]);
    const onRefreshAll = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<CommandCenter onRefreshAll={onRefreshAll} status={mockCommandCenter} summary={mockOpsSummary} />);

    expect(screen.getByRole("heading", { name: "Operations Console" })).toBeInTheDocument();
    expect(screen.getByText("fixture_mode")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Action History" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh System" }));
    await waitFor(() => {
      expect(actionSpy).toHaveBeenCalledWith("system_refresh", { confirm_heavy: false });
      expect(onRefreshAll).toHaveBeenCalled();
    });
    expect(screen.getAllByText(/source_mode=sample/i).length).toBeGreaterThan(0);
  });

  it("shows action errors without crashing", async () => {
    vi.spyOn(apiClient, "runSystemAction").mockRejectedValue(new Error("verify fast failed"));
    const onRefreshAll = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<CommandCenter onRefreshAll={onRefreshAll} status={mockCommandCenter} summary={mockOpsSummary} />);

    await user.click(screen.getByRole("button", { name: "Run Fast Verify" }));
    await waitFor(() => {
      expect(screen.getByText(/verify fast failed/i)).toBeInTheDocument();
    });
  });
});
