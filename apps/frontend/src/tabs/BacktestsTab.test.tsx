import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    backtestDetail.mockReset();
  });

  it("renders an empty state without crashing when placeholder rows are absent", () => {
    render(<BacktestsTab rows={[]} />);

    expect(screen.getByText("Select a backtest run.")).toBeInTheDocument();
    expect(backtestDetail).not.toHaveBeenCalled();
  });

  it("renders backtest assumptions and validation metadata without live-trading copy", async () => {
    backtestDetail.mockResolvedValue({
      id: 7,
      strategy_name: "trend_breakout_v1",
      engine: "strategy_lab",
      status: "completed",
      symbol: "BTC",
      timeframe: "1d",
      created_at: "2026-03-14T10:00:00Z",
      completed_at: "2026-03-14T10:01:00Z",
      proxy_grade: false,
      promoted_candidate: false,
      search_method: "grid",
      robustness_score: 71.2,
      net_return_pct: 13.4,
      sharpe_ratio: 1.18,
      max_drawdown_pct: -8.3,
      trade_count: 6,
      lifecycle_state: "paper_validating",
      data_realism_penalties: [],
      data_reality: null,
      assumptions: {
        assumption_schema_version: "phase9b.v1",
        assumptions_complete: true,
        fee_model_label: "fixed basis points per trade",
        fee_bps: 8,
        spread_model_label: "not modeled separately; folded into slippage",
        spread_bps: 0,
        slippage_model_label: "fixed basis points per trade",
        slippage_bps: 5,
        candle_fill_rule: "close_only",
        benchmark_label: "BTC buy-and-hold benchmark pending",
        data_reality_label: "fixture",
        source_family: "fixture",
        symbol: "BTC",
        timeframe: "1d",
        run_started_at: "2026-03-14T10:00:00Z",
        run_completed_at: "2026-03-14T10:01:00Z",
        warnings: [],
      },
      validation_metadata: {
        no_lookahead: true,
        no_lookahead_method: "signals activate after warmup; parameters are selected on train slices and evaluated on later test slices",
        train_start: 20,
        train_end: 110,
        test_start: 110,
        test_end: 140,
        walk_forward_enabled: true,
        walk_forward_window_count: 3,
        walk_forward_windows: [{ train_start: 20, train_end: 110, test_start: 110, test_end: 140 }],
        min_trade_count_warning: true,
        low_sample_warning: true,
        assumptions_complete: true,
      },
      metrics_audit: {
        total_return: 13.4,
        max_drawdown: -8.3,
        win_rate: 0.67,
        trade_count: 6,
        profit_factor: 1.8,
        expectancy: 1.1,
        average_r: null,
        sharpe: 1.18,
        sortino: null,
        unavailable_metrics: ["average_r", "sortino"],
      },
      fees_bps: 8,
      slippage_bps: 5,
      warmup_bars: 55,
      validation: {},
      summary: {},
      equity_curve: [{ timestamp: "2026-03-01T00:00:00Z", equity: 100000 }],
      trades: [],
      stability_heatmap: [],
      regime_summary: [],
      metadata: {},
      promotion_rationale: null,
      forward_validation_summary: null,
      calibration_summary: [],
    });

    const { container } = render(
      <BacktestsTab
        rows={[
          {
            id: 7,
            strategy_name: "trend_breakout_v1",
            engine: "strategy_lab",
            status: "completed",
            symbol: "BTC",
            timeframe: "1d",
            created_at: "2026-03-14T10:00:00Z",
            proxy_grade: false,
            promoted_candidate: false,
            search_method: "grid",
            robustness_score: 71.2,
            net_return_pct: 13.4,
            sharpe_ratio: 1.18,
            max_drawdown_pct: -8.3,
            trade_count: 6,
            lifecycle_state: "paper_validating",
            data_realism_penalties: [],
            data_reality: null,
          },
        ]}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Assumptions & Validation" })).toBeInTheDocument();
    expect(await screen.findByText("8.00 bps / 0.00 bps / 5.00 bps")).toBeInTheDocument();
    expect(screen.getByText("close only")).toBeInTheDocument();
    expect(screen.getByText("BTC buy-and-hold benchmark pending")).toBeInTheDocument();
    expect(screen.getByText("20 -> 110 / 110 -> 140")).toBeInTheDocument();
    expect(screen.getByText(/Low sample warning/i)).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain("broker-ready");
    expect(container.textContent?.toLowerCase()).not.toContain("execution-ready");
    expect(container.textContent?.toLowerCase()).not.toContain("real-money");
  });
});
