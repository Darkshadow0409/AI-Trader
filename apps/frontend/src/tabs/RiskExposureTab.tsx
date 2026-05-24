import { useEffect, useMemo, useState } from "react";
import { commodityTruthIsReadyCurrent, commodityTruthStateLabel, commodityTruthSummaryLabel } from "../lib/uiLabels";
import type { CommodityTruthStatusView, RiskExposureView, RiskView, SignalView } from "../types/api";

interface RiskExposureTabProps {
  exposures: RiskExposureView[];
  reports: RiskView[];
  highRiskSignals?: SignalView[];
  commodityTruth?: CommodityTruthStatusView | null;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenRisk?: (riskReportId: string) => void;
}

export function RiskExposureTab({
  exposures,
  reports,
  highRiskSignals = [],
  commodityTruth = null,
  selectedSymbol,
  onSelectSymbol,
  onOpenRisk,
}: RiskExposureTabProps) {
  const [scope, setScope] = useState<"selected" | "global">("selected");

  useEffect(() => {
    setScope("selected");
  }, [selectedSymbol]);

  const selectedHighRiskSignals = useMemo(
    () => highRiskSignals.filter((row) => row.symbol === selectedSymbol),
    [highRiskSignals, selectedSymbol],
  );
  const selectedReports = useMemo(
    () => reports.filter((row) => row.symbol === selectedSymbol),
    [reports, selectedSymbol],
  );
  const selectedExposures = useMemo(
    () => exposures.filter((row) => row.symbols.includes(selectedSymbol)),
    [exposures, selectedSymbol],
  );
  const visibleHighRiskSignals = scope === "selected" ? selectedHighRiskSignals : highRiskSignals;
  const visibleReports = scope === "selected" ? selectedReports : reports;

  return (
    <div className="stack">
      {commodityTruth && !commodityTruthIsReadyCurrent(commodityTruth) ? (
        <article className="panel compact-panel">
          <div className="state-block">
            <strong>{commodityTruthStateLabel(commodityTruth)}</strong>
            <div>{commodityTruthSummaryLabel(commodityTruth)}</div>
          </div>
        </article>
      ) : null}

      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Risk Scope</p>
            <h3>{scope === "selected" ? `Selected asset: ${selectedSymbol}` : "All assets"}</h3>
          </div>
          <div className="inline-tags">
            <button className={scope === "selected" ? "pill active" : "pill"} onClick={() => setScope("selected")} type="button">
              Selected asset
            </button>
            <button className={scope === "global" ? "pill active" : "pill"} onClick={() => setScope("global")} type="button">
              All assets
            </button>
          </div>
        </div>
        <small>
          {scope === "selected"
            ? "The detailed risk tables below are filtered to the asset you selected. Portfolio-wide exposure stays visible underneath as separate fleet context."
            : "You are looking at fleet-wide risk context across all assets. Use Selected asset if you want the detailed rows to stay pinned to one instrument."}
        </small>
      </article>

      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{scope === "selected" ? "Selected Asset Risk" : "Fleet Risk"}</p>
            <h3>{scope === "selected" ? `High-risk / blocked setups for ${selectedSymbol}` : "High-risk / blocked setups"}</h3>
          </div>
          <span className="tag">{visibleHighRiskSignals.length}</span>
        </div>
        {visibleHighRiskSignals.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Family</th>
                <th>Status</th>
                <th>Score</th>
                <th>Why not now</th>
              </tr>
            </thead>
            <tbody>
              {visibleHighRiskSignals.map((row) => (
                <tr
                  className={selectedSymbol === row.symbol ? "row-selected" : ""}
                  key={row.signal_id}
                  onClick={() => onSelectSymbol(row.symbol)}
                >
                  <td>{row.display_symbol ?? row.data_reality?.provenance.tradable_symbol ?? row.symbol}</td>
                  <td>{String(row.features.setup_family ?? row.signal_type).replace(/_/g, " ")}</td>
                  <td>{String(row.features.setup_status ?? "candidate").replace(/_/g, " ")}</td>
                  <td>{row.score.toFixed(1)}</td>
                  <td>{Array.isArray(row.features.why_not_now) ? String(row.features.why_not_now[0] ?? row.thesis) : row.thesis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-copy">
            {scope === "selected"
              ? `No high-risk or blocked setup is currently loaded for ${selectedSymbol}.`
              : "No high-risk or event-sensitive setups are currently flagged."}
          </p>
        )}
      </article>

      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{scope === "selected" ? "Selected Asset Risk" : "Fleet Risk"}</p>
            <h3>{scope === "selected" ? `Risk frames for ${selectedSymbol}` : "Risk frames across all assets"}</h3>
          </div>
          <span className="tag">{visibleReports.length}</span>
        </div>
        {visibleReports.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Family</th>
                <th>Stop</th>
                <th>ATR Stop</th>
                <th>Band</th>
                <th>Leverage</th>
                <th>Slippage</th>
                <th>Event</th>
                <th>Shock</th>
              </tr>
            </thead>
            <tbody>
              {visibleReports.map((row) => (
                <tr
                  className={selectedSymbol === row.symbol ? "row-selected" : ""}
                  key={row.risk_report_id}
                  onClick={() => {
                    onSelectSymbol(row.symbol);
                    onOpenRisk?.(row.risk_report_id);
                  }}
                >
                  <td>{row.display_symbol ?? row.data_reality?.provenance.tradable_symbol ?? row.symbol}</td>
                  <td>{String(row.report.setup_family ?? "setup").replace(/_/g, " ")}</td>
                  <td>{row.stop_price.toFixed(2)}</td>
                  <td>{typeof row.report.atr_stop_multiple === "number" ? `${row.report.atr_stop_multiple.toFixed(2)}x` : "n/a"}</td>
                  <td>{row.size_band}</td>
                  <td>{typeof row.report.leverage_band === "string" ? row.report.leverage_band : "n/a"}</td>
                  <td>{typeof row.report.slippage_expectation_bps === "number" ? `${row.report.slippage_expectation_bps.toFixed(1)}bps` : "n/a"}</td>
                  <td>{row.report.event_lockout ? "lockout" : row.data_reality?.execution_grade_allowed ? "clear" : "research only"}</td>
                  <td>{row.scenario_shocks.risk_off_pct?.toFixed(2) ?? row.scenario_shocks.vol_spike_pct?.toFixed(2) ?? "n/a"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-copy">
            {scope === "selected"
              ? `No detailed risk frame is loaded for ${selectedSymbol} yet. Stay in chart or research workflow until a risk row is attached.`
              : "No detailed risk frames are loaded yet."}
          </p>
        )}
      </article>

      <div className="split-stack">
        <article className="panel compact-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Portfolio-Wide Exposure</p>
              <h3>Cluster exposure stays global</h3>
            </div>
            <span className="tag">{selectedExposures.length} linked to {selectedSymbol}</span>
          </div>
          <small>
            This table is always portfolio-wide. It stays visible even when the detailed risk rows are filtered to one asset.
          </small>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Symbols</th>
                <th>Gross Risk</th>
                <th>Worst Shock</th>
              </tr>
            </thead>
            <tbody>
              {exposures.map((row) => (
                <tr key={row.cluster}>
                  <td>{row.cluster}</td>
                  <td>{row.symbols.join(", ")}</td>
                  <td>{row.gross_risk_pct.toFixed(3)}%</td>
                  <td>{row.worst_scenario_pct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
    </div>
  );
}
