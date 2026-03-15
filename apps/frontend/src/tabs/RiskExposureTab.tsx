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
            <th>Stop</th>
            <th>Band</th>
            <th>Risk</th>
            <th>Risk-Off</th>
            <th>Gap</th>
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
              <td>{row.stop_price.toFixed(2)}</td>
              <td>{row.size_band}</td>
              <td>{row.max_portfolio_risk_pct.toFixed(3)}%</td>
              <td>{row.scenario_shocks.risk_off_pct?.toFixed(2)}%</td>
              <td>{row.scenario_shocks.liquidity_gap_pct?.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
