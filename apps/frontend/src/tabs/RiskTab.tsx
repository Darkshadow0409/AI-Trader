import type { RiskView } from "../types/api";

export function RiskTab({ reports }: { reports: RiskView[] }) {
  return (
    <section className="stack">
      {reports.map((report) => (
        <article className="panel" key={`${report.symbol}-${report.as_of}`}>
          <div className="card-topline">
            <strong>{report.symbol}</strong>
            <span>{report.exposure_cluster}</span>
          </div>
          <h3>{report.size_band} size band</h3>
          <div className="metric-row">
            <span>Stop {report.stop_price.toFixed(2)}</span>
            <span>Risk {report.max_portfolio_risk_pct.toFixed(3)}</span>
            <span>Uncertainty {report.uncertainty.toFixed(2)}</span>
          </div>
          <p>Scenario shocks are persisted with fees and slippage assumptions in the report payload.</p>
        </article>
      ))}
    </section>
  );
}

