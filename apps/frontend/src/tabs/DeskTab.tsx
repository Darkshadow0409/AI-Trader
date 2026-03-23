import { useState } from "react";
import { formatDateTimeIST } from "../lib/time";
import { gateStatusLabel } from "../lib/uiLabels";
import type { DeskSummaryView, ExecutionGateView, HomeOperatorSummaryView, OperationalBacklogView } from "../types/api";

interface DeskTabProps {
  desk: DeskSummaryView;
  homeSummary: HomeOperatorSummaryView;
  executionGate: ExecutionGateView;
  operationalBacklog: OperationalBacklogView;
  onNavigate: (tab: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
  onOpenCommandCenter: () => void;
  onSelectSymbol: (symbol: string) => void;
  onSelectTicket: (ticketId: string | null) => void;
  onSelectTrade: (tradeId: string | null) => void;
  paperCapitalSummary: {
    accountSize: number;
    equity: number;
    allocated: number;
    openRisk: number;
    targetPnl: number;
    stretchPnl: number;
    stopLoss: number;
    riskPct: number;
    openExposureCount: number;
    overAllocated: boolean;
  };
}

function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

function sectionLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function DeskTab({
  desk,
  homeSummary,
  executionGate,
  operationalBacklog,
  onNavigate,
  onOpenSignal,
  onOpenRisk,
  onOpenCommandCenter,
  onSelectSymbol,
  onSelectTicket,
  onSelectTrade,
  paperCapitalSummary,
}: DeskTabProps) {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const gateLabel = gateStatusLabel(executionGate.status);
  const degradedDeskNotes = Object.entries(desk.section_notes).filter(([, note]) => note.trim().length > 0);
  const gateGuidance = executionGate.status === "review_required"
    ? `Review is blocking promotion or execution. Resolve ${Math.max(executionGate.blockers.length, 1)} outstanding review item(s) in Review Queue.`
    : executionGate.status === "execution_candidate"
      ? "Execution gate is clear enough for paper/pilot progression."
      : "Gate status reflects the current discipline and readiness checks.";

  return (
    <section className="desk-grid">
      {showOnboarding ? (
        <article className="panel compact-panel" data-testid="desk-onboarding">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Demo Start</p>
              <h3>Start Here</h3>
            </div>
            <button className="text-button" onClick={() => setShowOnboarding(false)} type="button">
              Dismiss
            </button>
          </div>
        <div className="stack">
          <small>Use Desk as the commodity handoff surface, then move through Signals, Risk, Tickets, Journal, and Pilot Ops.</small>
          <small>Start with USOUSD, XAUUSD, and XAGUSD. BTC and ETH remain secondary cross-asset confirmation, not the main product story.</small>
          <small>Command Center handles safe operational actions like refresh, fast verify, pilot export, and review bundle generation.</small>
          <small>This console is paper-trading and pilot mode only. No live broker execution is available here.</small>
          <small>For oil: click USOUSD in the left rail, inspect the chart, then use Related News, Risk Context, Crowd Narrative, and AI Desk before drafting a paper ticket.</small>
        </div>
      </article>
      ) : null}

      <article className="panel compact-panel hero-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Commodity Runbook</p>
            <h3>Board {"->"} Chart {"->"} Risk {"->"} Ticket {"->"} Review</h3>
          </div>
          <span className="tag">showcase-safe</span>
        </div>
        <div className="command-grid">
          <button className="action-button" onClick={() => onNavigate("watchlist")} type="button">
            1. Commodity Board
          </button>
          <button className="action-button" onClick={() => onNavigate("signals")} type="button">
            2. Signals
          </button>
          <button className="action-button" onClick={() => onNavigate("risk")} type="button">
            3. Risk
          </button>
          <button className="action-button" onClick={() => onNavigate("trade_tickets")} type="button">
            4. Tickets
          </button>
          <button className="action-button" onClick={() => onNavigate("session")} type="button">
            5. Review
          </button>
          <button className="action-button" onClick={() => onNavigate("ai_desk")} type="button">
            6. AI Desk
          </button>
        </div>
        <div className="stack">
          <small>Keep the chart as the main narrative surface, then confirm catalysts, invalidation, and risk before moving into ticket and review discipline.</small>
          <small>Data Reality, tradable alignment, proxy/live honesty, and 10k paper-account framing stay visible because they are part of the operator workflow, not hidden metadata.</small>
        </div>
      </article>

      <article className="panel compact-panel">
        <h3>What Matters Now</h3>
        <div className="metric-grid">
          <div>
            <span className="metric-label">Gate</span>
            <strong>{gateLabel}</strong>
          </div>
          <div>
            <span className="metric-label">Backlog</span>
            <strong>{operationalBacklog.overdue_count} overdue</strong>
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
          <small>{gateGuidance}</small>
          {(executionGate.blockers.length ? executionGate.blockers : ["No active execution-gate blockers."]).map((item) => (
            <small key={item}>{item}</small>
          ))}
          {executionGate.status === "review_required" ? (
            <button className="text-button" onClick={() => onNavigate("session")} type="button">
              Open Review Queue
            </button>
          ) : null}
        </div>
      </article>

      {degradedDeskNotes.length > 0 ? (
        <article className="panel compact-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Desk Readiness</p>
              <h3>Degraded But Usable</h3>
            </div>
            <span className="tag">partial</span>
          </div>
          <div className="stack">
            {degradedDeskNotes.slice(0, 3).map(([section, note]) => (
              <small key={section}>
                {sectionLabel(section)}: {note}
              </small>
            ))}
          </div>
        </article>
      ) : null}

      <article className="panel compact-panel">
        <h3>10k Paper Capital</h3>
        <div className="metric-grid">
          <div>
            <span className="metric-label">Paper Equity</span>
            <strong>{compact(paperCapitalSummary.equity)}</strong>
          </div>
          <div>
            <span className="metric-label">Allocated</span>
            <strong>{compact(paperCapitalSummary.allocated)}</strong>
          </div>
          <div>
            <span className="metric-label">Open Risk</span>
            <strong>{compact(paperCapitalSummary.openRisk)}</strong>
          </div>
          <div>
            <span className="metric-label">% at Risk</span>
            <strong>{compact(paperCapitalSummary.riskPct)}%</strong>
          </div>
          <div>
            <span className="metric-label">Base Target</span>
            <strong>{compact(paperCapitalSummary.targetPnl)}</strong>
          </div>
          <div>
            <span className="metric-label">Stretch / Stop</span>
            <strong>{compact(paperCapitalSummary.stretchPnl)} / {compact(paperCapitalSummary.stopLoss)}</strong>
          </div>
        </div>
        <div className="stack">
          <small>Account context: {paperCapitalSummary.accountSize.toFixed(0)} demo account / {paperCapitalSummary.openExposureCount} active exposures</small>
          {paperCapitalSummary.overAllocated ? (
            <small>Allocated capital is above the 10k paper account. This view reflects overlapping open paper positions and should be treated as an over-allocation warning, not available buying power.</small>
          ) : null}
          <small>Use this panel to explain risk per trade and portfolio-level open exposure in paper mode.</small>
        </div>
      </article>

      <article className="panel compact-panel">
        <h3>Next Actions</h3>
        <div className="command-grid">
          <button
            className="action-button"
            onClick={() => {
              onSelectTicket(desk.open_tickets[0]?.ticket_id ?? null);
              onNavigate("trade_tickets");
            }}
            type="button"
          >
            Review Tickets
          </button>
          <button
            className="action-button"
            onClick={() => {
              onSelectTrade(desk.active_paper_trades[0]?.trade_id ?? null);
              onNavigate("active_trades");
            }}
            type="button"
          >
            Open Active Trades
          </button>
          <button
            className="action-button"
            onClick={() => {
              const signalId = desk.high_priority_signals[0]?.signal_id;
              if (signalId) {
                onNavigate("signals");
                onOpenSignal(signalId);
              }
            }}
            type="button"
          >
            Open Lead Signal
          </button>
          <button className="action-button" onClick={onOpenCommandCenter} type="button">
            Open Ops Console
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
                  <td>{formatDateTimeIST(task.due_at)}</td>
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
