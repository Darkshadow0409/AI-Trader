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
    expect(screen.getAllByText("Bitcoin above $95k by March 31?").length).toBeGreaterThan(0);

    await user.click(screen.getByText("Will WTI crude settle above $85 after the next EIA inventory report?"));
    expect(onSelectSymbol).toHaveBeenCalledWith("WTI");
  });
});
