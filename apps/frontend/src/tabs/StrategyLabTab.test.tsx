import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/EquityCurveChart", () => ({
  EquityCurveChart: () => <div data-testid="equity-chart">equity</div>,
}));

import { StrategyLabTab } from "./StrategyLabTab";

const mockReality = {
  provenance: {
    symbol: "BTC",
    underlying_asset: "BTC",
    research_symbol: "BTCUSD",
    tradable_symbol: "BTCUSD",
    intended_venue: "binance_spot",
    intended_instrument: "spot_pair",
    source_name: "fixture_bars",
    source_type: "fixture",
    source_timing: "fixture",
    freshness_sla_minutes: 1440,
    realism_grade: "B",
    proxy_mapping_notes: "Direct crypto spot mapping in fixture mode.",
    asset_class: "crypto",
  },
  freshness_minutes: 5,
  freshness_state: "fresh",
  event_recency_minutes: null,
  realism_score: 52,
  ranking_penalty: 32,
  promotion_blocked: false,
  alert_allowed: true,
  execution_suitability: "research_only",
  news_suitability: "research_only",
  ui_warning: "",
  timing_semantics_note: "Fixture timing semantics support deterministic local testing only.",
  event_context_note: "",
  penalties: [],
  tradable_alignment_note: "BTC research symbol BTCUSD aligns directly with BTCUSD on binance_spot.",
};

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
              lifecycle_state: "paper_validating",
              lifecycle_updated_at: "2026-03-14T10:00:00Z",
              lifecycle_note: "Forward validation is underway.",
              tags: ["trend"],
              validation: { walk_forward_required: true },
              data_reality: mockReality,
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
              lifecycle_state: "paper_validating",
              data_realism_penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
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
            lifecycle_state: "promoted",
            lifecycle_updated_at: "2026-03-15T11:30:00Z",
            lifecycle_note: "Promotion gates passed.",
            tags: ["trend"],
            validation: { walk_forward_required: true, robustness_required: true },
            search_space: { breakout_buffer: { kind: "float", low: 0, high: 0.02, step: 0.01 } },
            spec: {},
            promotion_rationale: {
              state: "promoted",
              recommended_state: "promoted",
              gate_results: {
                robustness_score: true,
                walk_forward_quality: true,
                forward_results: true,
                minimum_sample_size: true,
                data_quality: true,
                proxy_grade_penalty: true,
              },
              notes: ["Calibration buckets compare cohorts only."],
              penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            },
            operator_feedback_summary: {
              trade_count: 2,
              adherence_rate: 0.75,
              adherence_adjusted_expectancy_proxy: 0.9,
              realism_adjusted_expectancy_proxy: 0.52,
              operator_error_rate: 0.25,
              drift_indicator: "monitor",
              dominant_failure_categories: ["operator_timing"],
              notes: ["Adherence-adjusted expectancy proxy: +0.90%."],
            },
            calibration_summary: [
              {
                strategy_name: "trend_breakout_v1",
                created_at: "2026-03-15T11:30:00Z",
                bucket_kind: "score",
                notes: "Calibration compares buckets only.",
                buckets: [
                  {
                    bucket: "top",
                    sample_size: 3,
                    avg_score: 74.6,
                    avg_confidence: 0.79,
                    hit_rate: 0.67,
                    expectancy_proxy: 1,
                    invalidation_rate: 0,
                    target_attainment: 0.67,
                  },
                ],
              },
            ],
            forward_validation_summary: {
              sample_size: 3,
              hit_rate: 0.67,
              expectancy_proxy: 1,
              drawdown: -1.12,
              target_attainment: 0.67,
              invalidation_rate: 0,
              time_stop_frequency: 0.33,
              modes: { paper_trade: 2, live_sim: 1 },
            },
            forward_validation_records: [
              {
                validation_id: "fv_1",
                strategy_name: "trend_breakout_v1",
                mode: "paper_trade",
                signal_id: "sig_1",
                risk_report_id: "risk_1",
                trade_id: null,
                opened_at: "2026-03-12T00:00:00Z",
                closed_at: "2026-03-13T00:00:00Z",
                entry_price: 62000,
                exit_price: 63200,
                pnl_pct: 1.94,
                drawdown_pct: -0.5,
                target_attained: true,
                invalidated: false,
                time_stopped: false,
                data_quality: "paper",
                notes: "held",
              },
            ],
            data_realism_penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            data_reality: mockReality,
            transition_history: [
              {
                strategy_name: "trend_breakout_v1",
                from_state: "paper_validating",
                to_state: "promoted",
                changed_at: "2026-03-15T11:30:00Z",
                note: "Promotion gates passed.",
              },
            ],
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
            lifecycle_state: "promoted",
            data_realism_penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            data_reality: mockReality,
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
            promotion_rationale: {
              state: "promoted",
              recommended_state: "promoted",
              gate_results: { robustness_score: true, walk_forward_quality: true, forward_results: true },
              notes: ["Calibration buckets compare cohorts only."],
              penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            },
            forward_validation_summary: {
              sample_size: 3,
              hit_rate: 0.67,
              expectancy_proxy: 1,
              drawdown: -1.12,
              target_attainment: 0.67,
              invalidation_rate: 0,
              time_stop_frequency: 0.33,
              modes: { paper_trade: 2, live_sim: 1 },
            },
            calibration_summary: [],
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
            lifecycle_state: "promoted",
            data_realism_penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            data_reality: mockReality,
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
            promotion_rationale: {
              state: "promoted",
              recommended_state: "promoted",
              gate_results: { robustness_score: true, walk_forward_quality: true, forward_results: true },
              notes: ["Calibration buckets compare cohorts only."],
              penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            },
            forward_validation_summary: {
              sample_size: 4,
              hit_rate: 0.75,
              expectancy_proxy: 1.2,
              drawdown: -1.01,
              target_attainment: 0.75,
              invalidation_rate: 0,
              time_stop_frequency: 0.25,
              modes: { paper_trade: 3, live_sim: 1 },
            },
            calibration_summary: [],
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
            lifecycle_state: "promoted",
            data_realism_penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            data_reality: mockReality,
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
            promotion_rationale: {
              state: "promoted",
              recommended_state: "promoted",
              gate_results: { robustness_score: true, walk_forward_quality: true, forward_results: true },
              notes: ["Calibration buckets compare cohorts only."],
              penalties: [{ code: "fixture_only", severity: "warning", summary: "fixture", score_penalty: 14 }],
            },
            forward_validation_summary: {
              sample_size: 4,
              hit_rate: 0.75,
              expectancy_proxy: 1.2,
              drawdown: -1.01,
              target_attainment: 0.75,
              invalidation_rate: 0,
              time_stop_frequency: 0.25,
              modes: { paper_trade: 3, live_sim: 1 },
            },
            calibration_summary: [],
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
    expect(await screen.findByRole("heading", { name: "Strategy Promotion / Validation" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Operator feedback" })).toBeInTheDocument();
    expect(await screen.findByText("Adherence-adjusted outcome")).toBeInTheDocument();
    expect((await screen.findAllByText("BTCUSD -> BTCUSD")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("fixture")).length).toBeGreaterThan(0);
    expect(await screen.findByText("float | 0 -> 0.02 | step 0.01")).toBeInTheDocument();
    expect(await screen.findByText("paper trade 2, live sim 1")).toBeInTheDocument();
    expect(await screen.findByText("breakout buffer 0.01")).toBeInTheDocument();
    expect(screen.getByTestId("equity-chart")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Run trend_breakout_v1/i }));

    expect(await screen.findByText("Run #8")).toBeInTheDocument();
    expect(await screen.findByText("Robustness 73.1")).toBeInTheDocument();
  });
});
