import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { EquityCurveChart } from "../components/EquityCurveChart";
import { HeatmapGrid } from "../components/HeatmapGrid";
import { Panel } from "../components/Panel";
import { StateBlock } from "../components/StateBlock";
import type { BacktestDetailView, BacktestListView } from "../types/api";

interface BacktestsTabProps {
  rows: BacktestListView[];
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unavailable";
  }
  return `${value.toFixed(2)}%`;
}

function formatBps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "unavailable";
  }
  return `${value.toFixed(2)} bps`;
}

function formatIndexRange(start: number | null | undefined, end: number | null | undefined): string {
  if (start === null || start === undefined || end === null || end === undefined) {
    return "unavailable";
  }
  return `${start} -> ${end}`;
}

export function BacktestsTab({ rows }: BacktestsTabProps) {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(rows[0]?.id ?? null);
  const [detail, setDetail] = useState<BacktestDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastEquityPoint = detail ? detail.equity_curve[detail.equity_curve.length - 1] : null;
  const assumptions = detail?.assumptions ?? null;
  const validationMetadata = detail?.validation_metadata ?? null;
  const metricsAudit = detail?.metrics_audit ?? null;
  const assumptionWarnings = [
    ...(assumptions?.warnings ?? []),
    ...(validationMetadata?.low_sample_warning ? ["Low sample warning: review this run before comparing strategy quality."] : []),
    ...(validationMetadata?.assumptions_complete === false ? ["Assumptions are incomplete or reconstructed from legacy metadata."] : []),
  ];

  useEffect(() => {
    setSelectedRunId((current) => current ?? rows[0]?.id ?? null);
  }, [rows]);

  useEffect(() => {
    if (selectedRunId === null) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    void apiClient
      .backtestDetail(selectedRunId)
      .then((payload) => {
        if (!cancelled) {
          setDetail(payload);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Backtest detail load failed");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  return (
    <div className="split-stack">
      <table className="data-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Symbol</th>
            <th>Return</th>
            <th>Sharpe</th>
            <th>DD</th>
            <th>Robustness</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className={selectedRunId === row.id ? "row-selected" : ""} key={row.id} onClick={() => setSelectedRunId(row.id)}>
              <td>{row.strategy_name}</td>
              <td>{row.symbol}</td>
              <td>{row.net_return_pct.toFixed(2)}%</td>
              <td>{row.sharpe_ratio.toFixed(2)}</td>
              <td>{row.max_drawdown_pct.toFixed(2)}%</td>
              <td>{row.robustness_score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="stack">
        <StateBlock loading={loading} error={error} empty={!detail} emptyLabel="Select a backtest run." />
        {detail ? (
          <>
            <Panel title="Backtest Summary" eyebrow={detail.strategy_name}>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Strategy</span>
                  <strong>{detail.strategy_name}</strong>
                </div>
                <div>
                  <span className="metric-label">Lifecycle</span>
                  <strong>{detail.lifecycle_state}</strong>
                </div>
                <div>
                  <span className="metric-label">Date Range</span>
                  <strong>{detail.equity_curve[0]?.timestamp?.slice(0, 10) ?? "n/a"} {"->"} {lastEquityPoint?.timestamp?.slice(0, 10) ?? "n/a"}</strong>
                </div>
                <div>
                  <span className="metric-label">Return / DD</span>
                  <strong>{detail.net_return_pct.toFixed(2)}% / {detail.max_drawdown_pct.toFixed(2)}%</strong>
                </div>
                <div>
                  <span className="metric-label">Trades</span>
                  <strong>{detail.trade_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Realism</span>
                  <strong>{detail.data_reality?.provenance.realism_grade ?? "n/a"}</strong>
                </div>
              </div>
              {detail.promotion_rationale ? <small>{detail.promotion_rationale.notes.join(" ")}</small> : null}
            </Panel>
            <Panel title="Equity Curve" eyebrow={detail.strategy_name}>
              <EquityCurveChart points={detail.equity_curve} />
            </Panel>
            <Panel title="Assumptions & Validation" eyebrow="Research-only backtest proof">
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Fees / spread / slippage</span>
                  <strong>
                    {formatBps(assumptions?.fee_bps)} / {formatBps(assumptions?.spread_bps)} / {formatBps(assumptions?.slippage_bps)}
                  </strong>
                </div>
                <div>
                  <span className="metric-label">Candle fill rule</span>
                  <strong>{assumptions?.candle_fill_rule?.replace(/_/g, " ") ?? "unavailable"}</strong>
                </div>
                <div>
                  <span className="metric-label">Benchmark</span>
                  <strong>{assumptions?.benchmark_label ?? "unavailable"}</strong>
                </div>
                <div>
                  <span className="metric-label">No-lookahead</span>
                  <strong>{validationMetadata?.no_lookahead ? "on" : "unavailable"}</strong>
                </div>
                <div>
                  <span className="metric-label">Train / test index range</span>
                  <strong>
                    {formatIndexRange(validationMetadata?.train_start, validationMetadata?.train_end)} / {formatIndexRange(validationMetadata?.test_start, validationMetadata?.test_end)}
                  </strong>
                </div>
                <div>
                  <span className="metric-label">Walk-forward windows</span>
                  <strong>{validationMetadata?.walk_forward_enabled ? validationMetadata.walk_forward_window_count : "off"}</strong>
                </div>
                <div>
                  <span className="metric-label">Win rate / expectancy</span>
                  <strong>{formatPct(metricsAudit?.win_rate === null || metricsAudit?.win_rate === undefined ? null : metricsAudit.win_rate * 100)} / {formatPct(metricsAudit?.expectancy)}</strong>
                </div>
                <div>
                  <span className="metric-label">Profit factor / avg R</span>
                  <strong>{metricsAudit?.profit_factor?.toFixed(2) ?? "unavailable"} / {metricsAudit?.average_r?.toFixed(2) ?? "unavailable"}</strong>
                </div>
              </div>
              <p className="muted-copy">
                {validationMetadata?.no_lookahead_method ?? "No-lookahead method unavailable. Treat this run as research-only until assumptions are complete."}
              </p>
              {assumptionWarnings.length > 0 ? (
                <div className="inline-tags" aria-label="Backtest assumption warnings">
                  {assumptionWarnings.map((warning) => (
                    <span className="tag warning" key={warning}>{warning}</span>
                  ))}
                </div>
              ) : null}
            </Panel>
            <Panel title="Trade List" eyebrow="Executed Trades">
              {detail.trades.length === 0 ? (
                <p className="muted-copy">No trades recorded for this run.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>Side</th>
                      <th>P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.trades.slice(0, 8).map((trade) => (
                      <tr key={`${trade.entry_time}-${trade.exit_time}-${trade.entry_price}`}>
                        <td>{trade.entry_time.slice(0, 10)}</td>
                        <td>{trade.exit_time.slice(0, 10)}</td>
                        <td>{trade.side}</td>
                        <td>{trade.pnl_pct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel title="Parameter Stability" eyebrow="Heatmap">
              <HeatmapGrid heatmap={detail.stability_heatmap[0] ?? null} />
            </Panel>
          </>
        ) : null}
      </div>
    </div>
  );
}
