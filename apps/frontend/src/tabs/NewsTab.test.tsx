import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockNews } from "../api/mockData";
import { NewsTab } from "./NewsTab";

describe("NewsTab", () => {
  it("renders current feed metadata and can focus the related asset", async () => {
    const user = userEvent.setup();
    const onSelectSymbol = vi.fn();

    render(<NewsTab rows={mockNews} onSelectSymbol={onSelectSymbol} />);

    expect(screen.getByText("EIA")).toBeInTheDocument();
    expect(screen.getAllByText("WTI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
    expect(screen.getAllByText("fixture").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Focus WTI" }));
    expect(onSelectSymbol).toHaveBeenCalledWith("WTI");
  });
});
