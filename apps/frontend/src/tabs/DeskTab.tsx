import type { DeskSummaryView, HomeOperatorSummaryView } from "../types/api";

interface DeskTabProps {
  desk: DeskSummaryView;
  homeSummary: HomeOperatorSummaryView;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
  onOpenCommandCenter: () => void;
  onSelectSymbol: (symbol: string) => void;
  onSelectTicket: (ticketId: string | null) => void;
  onSelectTrade: (tradeId: string | null) => void;
}

function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

export function DeskTab({ desk, homeSummary, onOpenSignal, onOpenRisk, onOpenCommandCenter, onSelectSymbol, onSelectTicket, onSelectTrade }: DeskTabProps) {
  return (
    <section className="desk-grid">
      <article className="panel compact-panel">
        <h3>What Matters Now</h3>
        <div className="metric-grid">
          <div>
            <span className="metric-label">Gate</span>
            <strong>{desk.execution_gate.status}</strong>
          </div>
          <div>
            <span className="metric-label">Backlog</span>
            <strong>{desk.operational_backlog.overdue_count} overdue</strong>
          </div>
          <div>
            <span className="metric-label">Open Tickets</span>
            <strong>{desk.open_tickets.length}</strong>
          </div>
          <div>
            <span className="metric-label">Open Trades</span>
            <strong>{desk.active_paper_trades.length}</strong>
          </div>
          <div>
            <span className="metric-label">Degraded Sources</span>
            <strong>{homeSummary.degraded_source_count}</strong>
          </div>
        </div>
        <div className="stack">
          {(desk.execution_gate.blockers.length ? desk.execution_gate.blockers : ["No active execution-gate blockers."]).map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
      </article>

      <article className="panel compact-panel">
        <h3>Next Actions</h3>
        <div className="command-grid">
          <button className="action-button" onClick={() => onSelectTicket(desk.open_tickets[0]?.ticket_id ?? null)} type="button">
            Review Tickets
          </button>
          <button className="action-button" onClick={() => onSelectTrade(desk.active_paper_trades[0]?.trade_id ?? null)} type="button">
            Check Active Trades
          </button>
          <button
            className="action-button"
            onClick={() => {
              const signalId = desk.high_priority_signals[0]?.signal_id;
              if (signalId) {
                onOpenSignal(signalId);
              }
            }}
            type="button"
          >
            Inspect Lead Signal
          </button>
          <button className="action-button" onClick={onOpenCommandCenter} type="button">
            Open Command Center
          </button>
        </div>
        <div className="stack">
          <small>Session focus: {homeSummary.session_state}</small>
          <small>
            Shadow divergence: {String(homeSummary.shadow_divergence_summary.count ?? 0)} / adapter health:
            {" "}
            {Object.entries(homeSummary.adapter_health_summary)
              .map(([key, value]) => `${key} ${value}`)
              .join(", ") || "n/a"}
          </small>
        </div>
      </article>

      <article className="panel compact-panel">
        <h3>Review Queue</h3>
        {desk.review_tasks.length === 0 ? (
          <p className="muted-copy">No open review tasks.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Priority</th>
                <th>Symbol</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {desk.review_tasks.map((task) => (
                <tr key={task.task_id}>
                  <td>{task.title}</td>
                  <td>{task.priority}</td>
                  <td>{task.linked_symbol || "-"}</td>
                  <td>{new Date(task.due_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="panel compact-panel">
        <h3>High-Priority Signals</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Family</th>
              <th>Score</th>
              <th>Reality</th>
              <th>Freshness</th>
            </tr>
          </thead>
          <tbody>
            {desk.high_priority_signals.map((signal) => (
              <tr
                key={signal.signal_id}
                onClick={() => {
                  onSelectSymbol(signal.symbol);
                  onOpenSignal(signal.signal_id);
                }}
              >
                <td>{signal.symbol}</td>
                <td>{signal.signal_type}</td>
                <td>{signal.score.toFixed(1)}</td>
                <td>{signal.data_reality?.provenance.realism_grade ?? "n/a"}</td>
                <td>{signal.data_reality?.freshness_state ?? "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="panel compact-panel">
        <h3>Open Tickets</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>State</th>
              <th>Approval</th>
              <th>Checklist</th>
            </tr>
          </thead>
          <tbody>
            {desk.open_tickets.map((ticket) => (
              <tr key={ticket.ticket_id} onClick={() => onSelectTicket(ticket.ticket_id)}>
                <td>{ticket.symbol}</td>
                <td>{ticket.status}</td>
                <td>{ticket.approval_status}</td>
                <td>{ticket.checklist_status.completed ? "clear" : "blocked"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="panel compact-panel">
        <h3>Open Trades</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Trade</th>
              <th>State</th>
              <th>Review</th>
              <th>PnL</th>
            </tr>
          </thead>
          <tbody>
            {desk.active_paper_trades.map((trade) => (
              <tr key={trade.trade_id} onClick={() => onSelectTrade(trade.trade_id)}>
                <td>{trade.symbol}</td>
                <td>{trade.status}</td>
                <td>{trade.review_due ? "due" : "clear"}</td>
                <td>{compact(trade.outcome?.realized_pnl_pct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="panel compact-panel">
        <h3>Degraded Sources</h3>
        {desk.degraded_sources.length === 0 ? (
          <p className="muted-copy">No degraded sources in the current view.</p>
        ) : (
          <div className="stack">
            {desk.degraded_sources.map((item) => (
              <button className="news-item" key={`${item.symbol}-${item.source_type}`} onClick={() => onSelectSymbol(item.symbol)} type="button">
                <strong>{item.symbol}</strong>
                <small>{item.source_type} / {item.source_timing} / {item.freshness_state}</small>
                <small>{item.warning}</small>
              </button>
            ))}
          </div>
        )}
      </article>

      <article className="panel compact-panel">
        <h3>Shadow Divergence</h3>
        {desk.shadow_divergence.length === 0 ? (
          <p className="muted-copy">No active shadow divergence hotspots.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Asset</th>
                <th>Reason</th>
                <th>Gap</th>
              </tr>
            </thead>
            <tbody>
              {desk.shadow_divergence.map((item, index) => (
                <tr key={`${String(item.ticket_id)}-${index}`} onClick={() => onSelectTicket(String(item.ticket_id))}>
                  <td>{String(item.ticket_id)}</td>
                  <td>{String(item.symbol)}</td>
                  <td>{String(item.reason)}</td>
                  <td>{compact(Number(item.observed_vs_plan_pct))}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="panel compact-panel">
        <h3>Focus Queue</h3>
        <div className="stack">
          {desk.focus_opportunities.map((item) => (
            <button
              className="news-item"
              key={`${item.symbol}-${item.queue}`}
              onClick={() => {
                onSelectSymbol(item.symbol);
                if (item.signal_id) {
                  onOpenSignal(item.signal_id);
                }
                if (item.risk_report_id) {
                  onOpenRisk(item.risk_report_id);
                }
              }}
              type="button"
            >
              <strong>{item.symbol}</strong>
              <small>{item.queue} / score {item.score.toFixed(1)} / {item.data_reality?.provenance.realism_grade ?? "n/a"}</small>
              <small>{item.promotion_reasons.join(" / ")}</small>
            </button>
          ))}
        </div>
      </article>

      <article className="panel compact-panel">
        <h3>Adapter Health + Audit</h3>
        <div className="stack">
          {desk.adapter_health.map((item) => (
            <div className="metric-row compact-row" key={item.health_id}>
              <span>{item.adapter_name}</span>
              <span>{item.status}</span>
            </div>
          ))}
          {desk.audit_log_tail.map((item) => (
            <small key={item.audit_id}>{item.event_type} / {item.entity_id}</small>
          ))}
        </div>
      </article>
    </section>
  );
}
