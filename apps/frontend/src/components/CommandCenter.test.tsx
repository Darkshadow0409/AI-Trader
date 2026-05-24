import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockCommandCenter, mockOpsSummary } from "../api/mockData";
import { CommandCenter } from "./CommandCenter";


describe("CommandCenter", () => {
  it("shows compact commodity recovery telemetry without turning into a debug console", async () => {
    const user = userEvent.setup();
    const onOpenWireItem = vi.fn();

    render(<CommandCenter onOpenWireItem={onOpenWireItem} status={mockCommandCenter} summary={mockOpsSummary} onRefreshAll={vi.fn(async () => {})} />);

    expect(screen.getByRole("heading", { name: "Commodity Recovery" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Priority Wire" })).toBeInTheDocument();
    expect(screen.getAllByTestId("reality-strip").length).toBeGreaterThan(0);
    expect(screen.getByText("Recovery active")).toBeInTheDocument();
    expect(screen.getAllByText("Commodity truth recovering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current commodity truth is too stale for operator use").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Blocking reason:/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("link", { name: /Commodity truth recovering/i }));
    expect(onOpenWireItem).toHaveBeenCalled();
  });
});
