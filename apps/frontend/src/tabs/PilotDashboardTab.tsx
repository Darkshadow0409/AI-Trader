import type { AdapterHealthView, AuditLogView, ExecutionGateView, PilotDashboardView } from "../types/api";

interface PilotDashboardTabProps {
  dashboard: PilotDashboardView;
  executionGate: ExecutionGateView;
  adapterHealth: AdapterHealthView[];
  auditLogs: AuditLogView[];
}

function metric(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

export function PilotDashboardTab({ dashboard, executionGate, adapterHealth, auditLogs }: PilotDashboardTabProps) {
  return (
    <div className="split-stack">
      <div className="stack">
        <article className="panel compact-panel">
          <h3>Pilot Summary</h3>
          <div className="metric-grid">
            <div>
              <span className="metric-label">Approved Rate</span>
              <strong>{metric(dashboard.pilot_metrics.ticket_conversion.approved_rate)}</strong>
            </div>
            <div>
              <span className="metric-label">Shadow Divergence</span>
              <strong>{metric(dashboard.pilot_metrics.shadow_metrics.divergence_rate)}</strong>
            </div>
            <div>
              <span className="metric-label">Manual vs Modeled Slippage</span>
              <strong>{metric(dashboard.pilot_metrics.slippage_metrics.avg_manual_slippage_variance_bps)}bps</strong>
            </div>
            <div>
              <span className="metric-label">Ignored Alert Rate</span>
              <strong>{metric(dashboard.pilot_metrics.alert_metrics.ignored_alert_rate)}</strong>
            </div>
          </div>
        </article>

        <article className="panel compact-panel">
          <h3>Trust By Asset Class</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Avg Realism</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.trust_by_asset_class.map((row, index) => (
                <tr key={`${row.asset_class as string}-${index}`}>
                  <td>{row.asset_class as string}</td>
                  <td>{metric(Number(row.avg_realism_score))}</td>
                  <td>{String(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="panel compact-panel">
          <h3>Divergence Hotspots</h3>
          {dashboard.divergence_hotspots.length === 0 ? (
            <p className="muted-copy">No current divergence hotspots.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Asset</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.divergence_hotspots.map((row, index) => (
                  <tr key={`${row.ticket_id as string}-${index}`}>
                    <td>{row.ticket_id as string}</td>
                    <td>{row.symbol as string}</td>
                    <td>{row.reason as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Execution Gate</h3>
          <div className="metric-row compact-row">
            <span>{executionGate.status}</span>
            <span>blockers {executionGate.blockers.length}</span>
          </div>
          {executionGate.blockers.length > 0 ? executionGate.blockers.map((item) => <small key={item}>{item}</small>) : <small>No active blockers.</small>}
          {executionGate.rationale.map((item) => <small key={item}>{item}</small>)}
        </article>

        <article className="panel compact-panel">
          <h3>Adapter Health</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Adapter</th>
                <th>Status</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {adapterHealth.map((row) => (
                <tr key={row.health_id}>
                  <td>{row.adapter_name}</td>
                  <td>{row.status}</td>
                  <td>{row.checked_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="panel compact-panel">
          <h3>Audit Log</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Entity</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((row) => (
                <tr key={row.audit_id}>
                  <td>{row.event_type}</td>
                  <td>{row.entity_id}</td>
                  <td>{row.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
    </div>
  );
}
