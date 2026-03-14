import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { EquityCurveChart } from "../components/EquityCurveChart";
import { HeatmapGrid } from "../components/HeatmapGrid";
import type {
  BacktestDetailView,
  BacktestListView,
  BacktestRunRequest,
  StrategyDetailView,
  StrategyListView,
} from "../types/api";

const searchMethods: Array<NonNullable<BacktestRunRequest["search_method"]>> = ["grid", "random", "optuna"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function titleize(value: string): string {
  return value.replace(/_/g, " ");
}

export function StrategyLabTab() {
  const [strategies, setStrategies] = useState<StrategyListView[]>([]);
  const [strategyDetail, setStrategyDetail] = useState<StrategyDetailView | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [backtests, setBacktests] = useState<BacktestListView[]>([]);
  const [backtestDetail, setBacktestDetail] = useState<BacktestDetailView | null>(null);
  const [selectedBacktestId, setSelectedBacktestId] = useState<number | null>(null);
  const [searchMethod, setSearchMethod] = useState<NonNullable<BacktestRunRequest["search_method"]>>("grid");
  const [maxTrials, setMaxTrials] = useState(8);
  const [promoteCandidate, setPromoteCandidate] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRegistry() {
      try {
        const [strategyRows, backtestRows] = await Promise.all([apiClient.strategies(), apiClient.backtests()]);
        if (cancelled) {
          return;
        }
        setStrategies(strategyRows);
        setBacktests(backtestRows);
        setSelectedStrategy((current) => current ?? strategyRows[0]?.name ?? null);
        setSelectedBacktestId((current) => current ?? backtestRows[0]?.id ?? null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Strategy Lab load failed");
        }
      }
    }
    void loadRegistry();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedStrategy) {
      return;
    }
    const strategyName = selectedStrategy;
    let cancelled = false;
    async function loadStrategy() {
      try {
        const detail = await apiClient.strategyDetail(strategyName);
        if (!cancelled) {
          setStrategyDetail(detail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Strategy detail load failed");
        }
      }
    }
    void loadStrategy();
    return () => {
      cancelled = true;
    };
  }, [selectedStrategy]);

  useEffect(() => {
    if (selectedBacktestId === null) {
      return;
    }
    const backtestId = selectedBacktestId;
    let cancelled = false;
    async function loadBacktest() {
      try {
        const detail = await apiClient.backtestDetail(backtestId);
        if (!cancelled) {
          setBacktestDetail(detail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Backtest detail load failed");
        }
      }
    }
    void loadBacktest();
    return () => {
      cancelled = true;
    };
  }, [selectedBacktestId]);

  async function handleRunBacktest() {
    if (!selectedStrategy) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const created = await apiClient.runBacktest({
        strategy_name: selectedStrategy,
        search_method: searchMethod,
        max_trials: maxTrials,
        promote_candidate: promoteCandidate,
      });
      setBacktests((existing) => [created, ...existing]);
      setSelectedBacktestId(created.id);
      setBacktestDetail(created);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Backtest run failed");
    } finally {
      setRunning(false);
    }
  }

  const bestParameters = asRecord(backtestDetail ? backtestDetail.summary["best_parameters"] : undefined);
  const walkForward = asRecord(backtestDetail ? backtestDetail.validation["walk_forward"] : undefined);
  const validationFlags = asRecord(backtestDetail ? backtestDetail.validation["flags"] : undefined);

  return (
    <section className="stack">
      {error ? <div className="panel error">{error}</div> : null}

      <div className="tab-grid strategy-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Registry</p>
              <h2>Strategy List</h2>
            </div>
            <span>{strategies.length} templates</span>
          </div>
          <div className="strategy-list">
            {strategies.map((strategy) => (
              <button
                className={selectedStrategy === strategy.name ? "strategy-card active" : "strategy-card"}
                key={strategy.name}
                onClick={() => setSelectedStrategy(strategy.name)}
                type="button"
              >
                <div className="card-topline">
                  <strong>{strategy.name}</strong>
                  <span>{strategy.timeframe}</span>
                </div>
                <p>{strategy.description}</p>
                <div className="metric-row">
                  <span>{strategy.underlying_symbol}</span>
                  <span>{strategy.proxy_grade ? "Proxy-grade" : "Tradable"}</span>
                  <span>{strategy.promoted ? "Promoted" : "Research"}</span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Validation First</p>
              <h2>Run Controls</h2>
            </div>
            <span>{backtests.length} persisted runs</span>
          </div>
          <div className="control-grid">
            <label className="field">
              <span>Search method</span>
              <select value={searchMethod} onChange={(event) => setSearchMethod(event.target.value as typeof searchMethod)}>
                {searchMethods.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Max trials</span>
              <input
                max={24}
                min={1}
                onChange={(event) => setMaxTrials(Number(event.target.value))}
                type="number"
                value={maxTrials}
              />
            </label>
          </div>
          <label className="checkbox-row">
            <input checked={promoteCandidate} onChange={(event) => setPromoteCandidate(event.target.checked)} type="checkbox" />
            <span>Request promotion only after walk-forward and robustness gates pass</span>
          </label>
          <button className="action-button" disabled={!selectedStrategy || running} onClick={() => void handleRunBacktest()} type="button">
            {running ? "Running validation..." : `Run ${selectedStrategy ?? "strategy"}`}
          </button>
          <div className="metric-row compact">
            <span>No lookahead</span>
            <span>Fees + slippage required</span>
            <span>Time-series split only</span>
          </div>
        </article>
      </div>

      {strategyDetail ? (
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Template</p>
              <h2>{strategyDetail.name}</h2>
            </div>
            <div className="pill-row">
              {strategyDetail.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <p>{strategyDetail.description}</p>
          <div className="metric-strip">
            <div>
              <span className="metric-label">Underlying</span>
              <strong>{strategyDetail.underlying_symbol}</strong>
            </div>
            <div>
              <span className="metric-label">Tradable</span>
              <strong>{strategyDetail.tradable_symbol}</strong>
            </div>
            <div>
              <span className="metric-label">Warm-up</span>
              <strong>{strategyDetail.warmup_bars} bars</strong>
            </div>
            <div>
              <span className="metric-label">Execution drag</span>
              <strong>
                {strategyDetail.fees_bps} / {strategyDetail.slippage_bps} bps
              </strong>
            </div>
          </div>
          <div className="detail-columns">
            <div>
              <h3>Search space</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Definition</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(strategyDetail.search_space).map(([name, definition]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{JSON.stringify(definition)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3>Validation gates</h3>
              <table className="data-table">
                <tbody>
                  {Object.entries(strategyDetail.validation).map(([name, value]) => (
                    <tr key={name}>
                      <td>{titleize(name)}</td>
                      <td>{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      ) : null}

      <div className="tab-grid strategy-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">History</p>
              <h2>Run Detail</h2>
            </div>
            <span>{selectedBacktestId ? `Run #${selectedBacktestId}` : "No run selected"}</span>
          </div>
          <div className="strategy-list run-list">
            {backtests.map((run) => (
              <button
                className={selectedBacktestId === run.id ? "strategy-card active" : "strategy-card"}
                key={run.id}
                onClick={() => setSelectedBacktestId(run.id)}
                type="button"
              >
                <div className="card-topline">
                  <strong>{run.strategy_name}</strong>
                  <span>{new Date(run.created_at).toLocaleString()}</span>
                </div>
                <div className="metric-row">
                  <span>{formatPct(run.net_return_pct)}</span>
                  <span>DD {formatPct(run.max_drawdown_pct)}</span>
                  <span>Robustness {run.robustness_score.toFixed(1)}</span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          {backtestDetail ? (
            <>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Selected Run</p>
                  <h2>{backtestDetail.strategy_name}</h2>
                </div>
                <span>{backtestDetail.status}</span>
              </div>
              <div className="metric-strip">
                <div>
                  <span className="metric-label">Validation return</span>
                  <strong>{formatPct(backtestDetail.net_return_pct)}</strong>
                </div>
                <div>
                  <span className="metric-label">Sharpe</span>
                  <strong>{backtestDetail.sharpe_ratio.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="metric-label">Max drawdown</span>
                  <strong>{formatPct(backtestDetail.max_drawdown_pct)}</strong>
                </div>
                <div>
                  <span className="metric-label">Trades</span>
                  <strong>{backtestDetail.trade_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Robustness</span>
                  <strong>{backtestDetail.robustness_score.toFixed(1)}</strong>
                </div>
              </div>
              <div className="detail-columns">
                <div>
                  <h3>Validation flags</h3>
                  <table className="data-table">
                    <tbody>
                      {Object.entries(validationFlags).map(([name, value]) => (
                        <tr key={name}>
                          <td>{titleize(name)}</td>
                          <td>{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3>Run metadata</h3>
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td>Search method</td>
                        <td>{backtestDetail.search_method}</td>
                      </tr>
                      <tr>
                        <td>Fees / slippage</td>
                        <td>
                          {backtestDetail.fees_bps} / {backtestDetail.slippage_bps} bps
                        </td>
                      </tr>
                      <tr>
                        <td>Proxy grade</td>
                        <td>{String(backtestDetail.proxy_grade)}</td>
                      </tr>
                      <tr>
                        <td>Promoted</td>
                        <td>{String(backtestDetail.promoted_candidate)}</td>
                      </tr>
                      <tr>
                        <td>Best parameters</td>
                        <td>{JSON.stringify(bestParameters)}</td>
                      </tr>
                      <tr>
                        <td>Walk-forward windows</td>
                        <td>{asNumber(walkForward.window_count).toFixed(0)}</td>
                      </tr>
                      <tr>
                        <td>Positive window ratio</td>
                        <td>{asNumber(walkForward.positive_window_ratio).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="muted-copy">Select a backtest run to inspect its validation output.</p>
          )}
        </article>
      </div>

      {backtestDetail ? (
        <div className="tab-grid strategy-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Curve</p>
                <h2>Equity Curve</h2>
              </div>
              <span>{backtestDetail.symbol}</span>
            </div>
            <EquityCurveChart points={backtestDetail.equity_curve} />
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Stability</p>
                <h2>Parameter Stability Heatmap</h2>
              </div>
              <span>{backtestDetail.stability_heatmap.length} matrix</span>
            </div>
            <HeatmapGrid heatmap={backtestDetail.stability_heatmap[0] ?? null} />
          </article>
        </div>
      ) : null}

      {backtestDetail ? (
        <div className="tab-grid strategy-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Execution</p>
                <h2>Trade List</h2>
              </div>
              <span>{backtestDetail.trades.length} trades</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Side</th>
                  <th>Entry Px</th>
                  <th>Exit Px</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {backtestDetail.trades.map((trade, index) => (
                  <tr key={`${trade.entry_time}-${trade.exit_time}-${index}`}>
                    <td>{new Date(trade.entry_time).toLocaleDateString()}</td>
                    <td>{new Date(trade.exit_time).toLocaleDateString()}</td>
                    <td>{trade.side}</td>
                    <td>{trade.entry_price.toFixed(2)}</td>
                    <td>{trade.exit_price.toFixed(2)}</td>
                    <td>{formatPct(trade.pnl_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Regimes</p>
                <h2>Regime-Sliced Summary</h2>
              </div>
              <span>{backtestDetail.regime_summary.length} slices</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Regime</th>
                  <th>Return</th>
                  <th>Trades</th>
                  <th>Win rate</th>
                </tr>
              </thead>
              <tbody>
                {backtestDetail.regime_summary.map((row) => (
                  <tr key={row.regime}>
                    <td>{titleize(row.regime)}</td>
                    <td>{formatPct(row.return_pct)}</td>
                    <td>{row.trade_count}</td>
                    <td>{(row.win_rate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}
    </section>
  );
}
