import type { RiskExposureView, RiskView } from "../types/api";

interface RiskExposureTabProps {
  exposures: RiskExposureView[];
  reports: RiskView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenRisk?: (riskReportId: string) => void;
}

export function RiskExposureTab({ exposures, reports, selectedSymbol, onSelectSymbol, onOpenRisk }: RiskExposureTabProps) {
  return (
    <div className="split-stack">
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
          {reports.map((row) => (
            <tr
              className={selectedSymbol === row.symbol ? "row-selected" : ""}
              key={row.risk_report_id}
              onClick={() => {
                onSelectSymbol(row.symbol);
                onOpenRisk?.(row.risk_report_id);
              }}
            >
              <td>{row.symbol}</td>
              <td>{String(row.report.setup_family ?? "setup").replace(/_/g, " ")}</td>
              <td>{row.stop_price.toFixed(2)}</td>
              <td>{typeof row.report.atr_stop_multiple === "number" ? `${row.report.atr_stop_multiple.toFixed(2)}x` : "n/a"}</td>
              <td>{row.size_band}</td>
              <td>{typeof row.report.leverage_band === "string" ? row.report.leverage_band : "n/a"}</td>
              <td>{typeof row.report.slippage_expectation_bps === "number" ? `${row.report.slippage_expectation_bps.toFixed(1)}bps` : "n/a"}</td>
              <td>{row.report.event_lockout ? "lockout" : "clear"}</td>
              <td>{row.scenario_shocks.risk_off_pct?.toFixed(2) ?? row.scenario_shocks.vol_spike_pct?.toFixed(2) ?? "n/a"}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
