import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockPolymarketHunter } from "../api/mockData";
import { PolymarketHunterTab } from "./PolymarketHunterTab";

describe("PolymarketHunterTab", () => {
  it("renders hunter rows and can focus the related asset", async () => {
    const user = userEvent.setup();
    const onSelectSymbol = vi.fn();

    render(<PolymarketHunterTab hunter={mockPolymarketHunter} onSelectSymbol={onSelectSymbol} />);

    expect(screen.getByText("Polymarket Hunter")).toBeInTheDocument();
    expect(screen.getAllByText("WTI above $85 after the next EIA?").length).toBeGreaterThan(0);
    expect(screen.getByRole("combobox", { name: "Sort Polymarket markets" })).toHaveValue("relevance");

    await user.click(screen.getByRole("button", { name: "Focus WTI" }));
    expect(onSelectSymbol).toHaveBeenCalledWith("WTI");
  });
});
