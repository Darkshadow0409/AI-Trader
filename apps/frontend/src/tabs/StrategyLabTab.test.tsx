import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/EquityCurveChart", () => ({
  EquityCurveChart: () => <div data-testid="equity-chart">equity</div>,
}));

import { StrategyLabTab } from "./StrategyLabTab";

describe("StrategyLabTab", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/strategies")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              name: "trend_breakout_v1",
              version: "1.0",
              template: "trend_breakout",
              description: "Trend breakout strategy",
              underlying_symbol: "BTC",
              tradable_symbol: "BTC",
              timeframe: "1d",
              warmup_bars: 55,
              fees_bps: 8,
              slippage_bps: 5,
              proxy_grade: false,
              promoted: false,
              tags: ["trend"],
              validation: { walk_forward_required: true },
            },
          ],
        });
      }
      if (url.endsWith("/backtests") && init?.method !== "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => [
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
            },
          ],
        });
      }
      if (url.endsWith("/strategies/trend_breakout_v1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            name: "trend_breakout_v1",
            version: "1.0",
            template: "trend_breakout",
            description: "Trend breakout strategy",
            underlying_symbol: "BTC",
            tradable_symbol: "BTC",
            timeframe: "1d",
            warmup_bars: 55,
            fees_bps: 8,
            slippage_bps: 5,
            proxy_grade: false,
            promoted: false,
            tags: ["trend"],
            validation: { walk_forward_required: true, robustness_required: true },
            search_space: { breakout_buffer: { kind: "float", low: 0, high: 0.02, step: 0.01 } },
            spec: {},
          }),
        });
      }
      if (url.endsWith("/backtests/7")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
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
            fees_bps: 8,
            slippage_bps: 5,
            warmup_bars: 55,
            validation: {
              flags: { no_lookahead: true, time_series_split_only: true },
              walk_forward: { window_count: 3, positive_window_ratio: 0.67 },
            },
            summary: { best_parameters: { breakout_buffer: 0.01 } },
            equity_curve: [{ timestamp: "2026-03-01T00:00:00Z", equity: 100000 }],
            trades: [
              {
                entry_time: "2026-03-02T00:00:00Z",
                exit_time: "2026-03-03T00:00:00Z",
                side: "long",
                entry_price: 62000,
                exit_price: 63200,
                pnl_pct: 1.94,
              },
            ],
            stability_heatmap: [
              {
                x_param: "relative_volume_min",
                y_param: "breakout_buffer",
                x_labels: ["1.0", "1.1"],
                y_labels: ["0.00", "0.01"],
                values: [
                  [55.2, 60.1],
                  [58.3, 63.4],
                ],
              },
            ],
            regime_summary: [{ regime: "risk_on", return_pct: 13.4, trade_count: 6, win_rate: 0.67 }],
            metadata: {},
          }),
        });
      }
      if (url.endsWith("/backtests/8")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 8,
            strategy_name: "trend_breakout_v1",
            engine: "strategy_lab",
            status: "completed",
            symbol: "BTC",
            timeframe: "1d",
            created_at: "2026-03-14T11:00:00Z",
            completed_at: "2026-03-14T11:01:00Z",
            proxy_grade: false,
            promoted_candidate: false,
            search_method: "grid",
            robustness_score: 73.1,
            net_return_pct: 15.2,
            sharpe_ratio: 1.26,
            max_drawdown_pct: -8.1,
            trade_count: 7,
            fees_bps: 8,
            slippage_bps: 5,
            warmup_bars: 55,
            validation: {
              flags: { no_lookahead: true, time_series_split_only: true },
              walk_forward: { window_count: 3, positive_window_ratio: 0.67 },
            },
            summary: { best_parameters: { breakout_buffer: 0.01 } },
            equity_curve: [{ timestamp: "2026-03-01T00:00:00Z", equity: 100000 }],
            trades: [],
            stability_heatmap: [],
            regime_summary: [],
            metadata: {},
          }),
        });
      }
      if (url.endsWith("/backtests/run") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 8,
            strategy_name: "trend_breakout_v1",
            engine: "strategy_lab",
            status: "completed",
            symbol: "BTC",
            timeframe: "1d",
            created_at: "2026-03-14T11:00:00Z",
            completed_at: "2026-03-14T11:01:00Z",
            proxy_grade: false,
            promoted_candidate: false,
            search_method: "grid",
            robustness_score: 73.1,
            net_return_pct: 15.2,
            sharpe_ratio: 1.26,
            max_drawdown_pct: -8.1,
            trade_count: 7,
            fees_bps: 8,
            slippage_bps: 5,
            warmup_bars: 55,
            validation: {
              flags: { no_lookahead: true, time_series_split_only: true },
              walk_forward: { window_count: 3, positive_window_ratio: 0.67 },
            },
            summary: { best_parameters: { breakout_buffer: 0.01 } },
            equity_curve: [{ timestamp: "2026-03-01T00:00:00Z", equity: 100000 }],
            trades: [],
            stability_heatmap: [],
            regime_summary: [],
            metadata: {},
          }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }));
  });

  it("renders strategy detail and can trigger a run", async () => {
    const user = userEvent.setup();
    render(<StrategyLabTab />);

    expect(await screen.findByRole("heading", { name: "Strategy List" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Run Detail" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Equity Curve" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Search space" })).toBeInTheDocument();
    expect(screen.getByTestId("equity-chart")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Run trend_breakout_v1/i }));

    expect(await screen.findByText("Run #8")).toBeInTheDocument();
    expect(await screen.findByText("Robustness 73.1")).toBeInTheDocument();
  });
});
