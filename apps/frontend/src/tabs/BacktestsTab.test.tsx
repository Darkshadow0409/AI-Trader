import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { backtestDetail } = vi.hoisted(() => ({
  backtestDetail: vi.fn(),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    backtestDetail,
  },
}));

vi.mock("../components/EquityCurveChart", () => ({
  EquityCurveChart: () => <div data-testid="equity-curve-chart">curve</div>,
}));

import { BacktestsTab } from "./BacktestsTab";

describe("BacktestsTab", () => {
  it("renders an empty state without crashing when placeholder rows are absent", () => {
    render(<BacktestsTab rows={[]} />);

    expect(screen.getByText("Select a backtest run.")).toBeInTheDocument();
    expect(backtestDetail).not.toHaveBeenCalled();
  });
});
