import { useState } from "react";
import { AssetReadinessBanner } from "../components/AssetReadinessBanner";
import type { AssetReadinessView } from "../lib/assetReadiness";
import { formatDateTimeIST } from "../lib/time";
import {
  commodityTruthIsReadyCurrent,
  commodityTruthStateLabel,
  commodityTruthSummaryLabel,
  gateStatusLabel,
  operatorWireCategoryLabel,
  operatorWireFreshnessLabel,
  proposalStateLabel,
  recoveryReasonLabel,
  recoveryStatusLabel,
  titleCase,
  traderFreshnessStateLabel,
} from "../lib/uiLabels";
import type {
  CommodityTruthStatusView,
  DeskSummaryView,
  ExecutionGateView,
  HomeOperatorSummaryView,
  OperationalBacklogView,
  ReviewSummaryView,
} from "../types/api";

interface DeskTabProps {
  desk: DeskSummaryView;
  homeSummary: HomeOperatorSummaryView;
  executionGate: ExecutionGateView;
  operationalBacklog: OperationalBacklogView;
  reviewSummary?: ReviewSummaryView | null;
  commodityTruth?: CommodityTruthStatusView | null;
  selectedAssetReadiness: AssetReadinessView;
  selectedInstrumentLabel: string;
  selectedUnderlyingLabel?: string | null;
  selectedMappingNote?: string | null;
  selectedHasSignal: boolean;
  selectedHasRisk: boolean;
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

function sumCounts(counts: Record<string, number> | null | undefined): number {
  return Object.values(counts ?? {}).reduce((sum, value) => sum + value, 0);
}

function recoveryTimestamp(value: string | null | undefined): string {
  const formatted = formatDateTimeIST(value);
  return formatted === "n/a" ? "not scheduled" : formatted;
}

function blockerCategoryLabel(category: string | null | undefined): string {
  switch (category) {
    case "review":
      return "review";
    case "baseline":
      return "baseline";
    case "data":
      return "data";
    case "performance":
      return "path quality";
    default:
      return category ? category.replace(/_/g, " ") : "operator";
  }
}

export function DeskTab({
  desk,
  homeSummary,
  executionGate,
  operationalBacklog,
  reviewSummary = null,
  commodityTruth = null,
  selectedAssetReadiness,
  selectedInstrumentLabel,
  selectedUnderlyingLabel = null,
  selectedMappingNote = null,
  selectedHasSignal,
  selectedHasRisk,
  onNavigate,
  onOpenSignal,
  onOpenCommandCenter,
  onSelectSymbol,
  onSelectTicket,
  onSelectTrade,
  paperCapitalSummary,
}: DeskTabProps) {
  const [showHelp, setShowHelp] = useState(false);
  const gateLabel = gateStatusLabel(executionGate.status);
  const openTicketCount = homeSummary.operator_state_summary?.open_tickets ?? sumCounts(homeSummary.open_ticket_counts);
  const openTradeCount = homeSummary.operator_state_summary?.active_trades ?? sumCounts(homeSummary.active_trade_counts);
  const openReviewCount = homeSummary.operator_state_summary?.open_review_items ?? homeSummary.review_backlog_counts.open_reviews ?? desk.review_tasks.length;
  const snapshotNote = desk.runtime_snapshot?.using_last_good_snapshot
    ? `Using the last good operator snapshot from ${desk.runtime_snapshot.age_minutes}m ago while refresh completes.`
    : null;
  const rankedGateBlockers = [...executionGate.blocker_details].sort((left, right) => left.rank - right.rank || left.code.localeCompare(right.code));
  const topGateBlocker = rankedGateBlockers[0] ?? null;
  const selectedAssetHeading = selectedUnderlyingLabel ? `${selectedInstrumentLabel} using ${selectedUnderlyingLabel} context` : selectedInstrumentLabel;
  const recovery = desk.recovery_telemetry;
  const operatorWire = desk.operator_wire?.items ?? [];
  const topReviewTasks = desk.review_tasks.slice(0, 3);
  const topSignals = desk.high_priority_signals.slice(0, 4);
  const accountabilityMetrics = reviewSummary?.accountability_metrics ?? null;
  const gateImpact = reviewSummary?.gate_impact ?? null;
  const clearTheseFirst = gateImpact?.clear_these_first.slice(0, 2) ?? [];
  const reviewQueueBlocking = (gateImpact?.gate_blocking_count ?? 0) > 0 || topGateBlocker?.category === "review";
  const baselineOrDataBlocking = !reviewQueueBlocking && executionGate.status !== "execution_candidate" && topGateBlocker !== null;
  const nextActionHeading =
    reviewQueueBlocking
      ? "Review Queue first"
      : baselineOrDataBlocking
        ? "Resolve gate blockers first"
      : selectedAssetReadiness.kind === "research_only_today"
        ? `Research ${selectedInstrumentLabel} first`
        : selectedAssetReadiness.kind === "no_actionable_setup"
          ? `Load a setup for ${selectedInstrumentLabel}`
          : `Advance ${selectedInstrumentLabel} into risk or tickets`;
  const nextActionSummary =
    reviewQueueBlocking
      ? topGateBlocker?.next_step ?? "Review pressure is explicitly blocking promotion or execution. Clear that queue before widening workflow."
      : baselineOrDataBlocking
        ? topGateBlocker?.next_step ?? "Resolve the current gate blocker before widening ticket or trade workflow."
      : selectedAssetReadiness.kind === "research_only_today"
        ? "Keep the selected asset chart-first and research-first until truth and risk posture improve."
        : selectedAssetReadiness.kind === "no_actionable_setup"
          ? "There is no current setup/risk frame pinned, so stay in the board and signals flow instead of pretending the ticket path is ready."
          : selectedHasRisk
            ? "The asset is already carrying risk context, so the next move should stay in the same operator thread."
            : "The asset is the clearest current path, but it still needs a confirmed setup or risk frame before ticket work.";
  const reviewHeadline =
    reviewQueueBlocking
      ? `${operationalBacklog.overdue_count} overdue review item(s) are blocking progression.`
      : openReviewCount > 0
        ? `${openReviewCount} review item(s) remain open, but the desk is still usable.`
        : "Review pressure is currently contained.";
  const helpCopy = [
    "Desk is the chart-first operator surface. Use it to decide what matters, then move into Signals, Risk, Tickets, Review, and AI Desk without losing the selected asset thread.",
    "USOUSD is the trader-facing oil board. WTI remains research-only context. XAGUSD is the trader-facing silver board.",
    "Truth, freshness, degraded state, and paper-only workflow framing remain explicit because they are part of the operator discipline, not decorative metadata.",
  ];
  const primaryActionIsTickets = !reviewQueueBlocking && !baselineOrDataBlocking && selectedAssetReadiness.kind === "primary_path" && selectedHasRisk;

  return (
    <section className="desk-grid desk-terminal-grid">
      <AssetReadinessBanner readiness={selectedAssetReadiness} title={selectedAssetHeading} />
      {selectedMappingNote ? <small>{selectedMappingNote}</small> : null}

      <article className="panel compact-panel terminal-subpanel desk-what-matters">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Desk Focus</p>
            <h3>What Matters Now</h3>
          </div>
          <div className="inline-tags">
            <span className="tag">{gateLabel}</span>
            <span className="tag">{operationalBacklog.overdue_count} overdue</span>
            <span className="tag">{homeSummary.degraded_source_count} degraded</span>
          </div>
        </div>
        {commodityTruth && !commodityTruthIsReadyCurrent(commodityTruth) ? (
          <div className="state-block">
            <strong>{commodityTruthStateLabel(commodityTruth)}</strong>
            <div>{commodityTruthSummaryLabel(commodityTruth)}</div>
          </div>
        ) : null}
        {recovery ? (
          <div className="state-block" data-testid="desk-recovery-telemetry">
            <strong>{recoveryStatusLabel(recovery)}</strong>
            <div>{recovery.truth_label}</div>
            <small>
              Attempts {recovery.recovery_attempt_count ?? 0} / Last {recoveryTimestamp(recovery.recovery_last_attempt_at)} / Next {recoveryTimestamp(recovery.recovery_next_attempt_at)}
            </small>
            <small>{recoveryReasonLabel(recovery.recovery_reason)}</small>
          </div>
        ) : null}
        <div className="metric-grid desk-priority-grid">
          <div>
            <span className="metric-label">Gate</span>
            <strong>{gateLabel}</strong>
          </div>
          <div>
            <span className="metric-label">Review Queue</span>
            <strong>{openReviewCount}</strong>
          </div>
          <div>
            <span className="metric-label">Open Tickets</span>
            <strong>{openTicketCount}</strong>
          </div>
          <div>
            <span className="metric-label">Open Trades</span>
            <strong>{openTradeCount}</strong>
          </div>
          <div>
            <span className="metric-label">Paper Risk</span>
            <strong>{compact(paperCapitalSummary.riskPct)}%</strong>
          </div>
          <div>
            <span className="metric-label">Paper Equity</span>
            <strong>{compact(paperCapitalSummary.equity)}</strong>
          </div>
        </div>
        <div className="stack">
          <small>{reviewHeadline}</small>
          {snapshotNote ? <small>{snapshotNote}</small> : null}
          {executionGate.blockers.slice(0, 2).map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
      </article>

      <article className="panel compact-panel terminal-subpanel desk-wire-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Terminal Wire</p>
            <h3>Priority Wire</h3>
          </div>
          <span className="tag">{operatorWire.length} items</span>
        </div>
        {operatorWire.length === 0 ? (
          <div className="showcase-note">
            <strong className="showcase-note-title">Priority wire is calm</strong>
            <small className="showcase-note-body">No priority wire items are published for this desk snapshot yet.</small>
          </div>
        ) : (
          <div className="stack wire-list">
            {operatorWire.map((item, index) => (
              <button
                className="news-item wire-row"
                key={`${item.category}-${item.headline}-${index}`}
                onClick={() => {
                  if (item.symbol) {
                    onSelectSymbol(item.symbol);
                  }
                  if (item.signal_id) {
                    onOpenSignal(item.signal_id);
                  }
                  if (item.trade_id) {
                    onSelectTrade(item.trade_id);
                  }
                  if (item.target_tab) {
                    onNavigate(item.target_tab);
                  }
                }}
                type="button"
              >
                <div className="metric-row compact-row">
                  <strong>{item.headline}</strong>
                  <span>{operatorWireCategoryLabel(item.category)}</span>
                </div>
                <small>{item.summary}</small>
                <div className="metric-row compact-row">
                  <span>{item.symbol ?? "desk-wide"}</span>
                  <span>{operatorWireFreshnessLabel(item)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </article>

      <article className="panel compact-panel terminal-subpanel desk-gate-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Gate Resolution</p>
            <h3>What Clears Next</h3>
          </div>
          <button className="text-button" onClick={() => onNavigate(topGateBlocker?.category === "review" ? "session" : "pilot_ops")} type="button">
            {topGateBlocker?.category === "review" ? "Open Review Queue" : "Open Pilot Ops"}
          </button>
        </div>
        <div className="metric-grid desk-review-grid">
          <div>
            <span className="metric-label">Gate</span>
            <strong>{gateLabel}</strong>
          </div>
          <div>
            <span className="metric-label">Ranked blockers</span>
            <strong>{rankedGateBlockers.length}</strong>
          </div>
          <div>
            <span className="metric-label">Clears next</span>
            <strong>{topGateBlocker ? blockerCategoryLabel(topGateBlocker.category) : "clear"}</strong>
          </div>
          <div>
            <span className="metric-label">Gate-blocking reviews</span>
            <strong>{accountabilityMetrics?.gate_blocking_count ?? gateImpact?.gate_blocking_count ?? 0}</strong>
          </div>
        </div>
        {rankedGateBlockers.length === 0 ? (
          <div className="showcase-note">
            <strong className="showcase-note-title">Gate is clear</strong>
            <small className="showcase-note-body">No structured gate blockers are active right now.</small>
          </div>
        ) : (
          <div className="stack">
            {rankedGateBlockers.slice(0, 3).map((blocker) => (
              <div className="news-item wire-row" key={blocker.code}>
                <div className="metric-row compact-row">
                  <strong>{blocker.code.replace(/_/g, " ")}</strong>
                  <span>{blocker.severity}</span>
                  <span>{blockerCategoryLabel(blocker.category)}</span>
                </div>
                <small>{blocker.next_step}</small>
              </div>
            ))}
            {clearTheseFirst.length > 0 ? (
              <div className="stack">
                {clearTheseFirst.map((item) => (
                  <div className="news-item wire-row" key={item.task_id}>
                    <div className="metric-row compact-row">
                      <strong>{item.title}</strong>
                      <span>{item.family.replace(/_/g, " ")}</span>
                    </div>
                    <small>{item.display_symbol ?? "desk-wide"} / {item.reason}</small>
                    <small>{item.next_step}</small>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </article>

      <article className="panel compact-panel terminal-subpanel desk-review-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Review Pressure</p>
            <h3>Queue Pressure</h3>
          </div>
          <button className="text-button" onClick={() => onNavigate("session")} type="button">
            Open Review Queue
          </button>
        </div>
        <div className="metric-grid desk-review-grid">
          <div>
            <span className="metric-label">Overdue</span>
            <strong>{operationalBacklog.overdue_count}</strong>
          </div>
          <div>
            <span className="metric-label">High Priority</span>
            <strong>{operationalBacklog.high_priority_count}</strong>
          </div>
          <div>
            <span className="metric-label">Open Reviews</span>
            <strong>{openReviewCount}</strong>
          </div>
          <div>
            <span className="metric-label">Oldest overdue</span>
            <strong>{accountabilityMetrics?.oldest_overdue_hours !== null && accountabilityMetrics?.oldest_overdue_hours !== undefined ? `${accountabilityMetrics.oldest_overdue_hours}h` : "n/a"}</strong>
          </div>
          <div>
            <span className="metric-label">Clearance</span>
            <strong>{accountabilityMetrics?.clearance_status ?? "clear"}</strong>
          </div>
        </div>
        {topReviewTasks.length === 0 ? (
          <div className="showcase-note">
            <strong className="showcase-note-title">Review queue is quiet</strong>
            <small className="showcase-note-body">No detailed review rows are loaded right now.</small>
          </div>
        ) : (
          <div className="stack">
            {topReviewTasks.map((task) => (
              <button className="news-item wire-row" key={task.task_id} onClick={() => onNavigate("session")} type="button">
                <div className="metric-row compact-row">
                  <strong>{task.title}</strong>
                  <span>{task.priority}</span>
                </div>
                <small>{task.display_symbol || task.linked_symbol || "desk-wide"} / {task.session_state.replace(/_/g, " ")} / due {formatDateTimeIST(task.due_at)}</small>
              </button>
            ))}
          </div>
        )}
      </article>

      <article className="panel compact-panel terminal-subpanel desk-signals-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Signal Surface</p>
            <h3>High-Priority Signals</h3>
          </div>
          <button className="text-button" onClick={() => onNavigate("signals")} type="button">
            Open Signals
          </button>
        </div>
        {topSignals.length === 0 ? (
          <div className="showcase-note">
            <strong className="showcase-note-title">No live setup pressure</strong>
            <small className="showcase-note-body">No high-priority desk setups are in scope right now.</small>
          </div>
        ) : (
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
              {topSignals.map((signal) => (
                <tr
                  key={signal.signal_id}
                  onClick={() => {
                    onSelectSymbol(signal.symbol);
                    onOpenSignal(signal.signal_id);
                  }}
                >
                  <td>{signal.display_symbol ?? signal.data_reality?.provenance.tradable_symbol ?? signal.symbol}</td>
                  <td>{titleCase(String(signal.features.setup_family ?? signal.signal_type))}</td>
                  <td>{signal.score.toFixed(1)}</td>
                  <td>{signal.data_reality?.provenance.realism_grade ?? "n/a"}</td>
                  <td>{traderFreshnessStateLabel(signal.data_reality?.freshness_state, signal.data_reality?.execution_grade_allowed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="panel compact-panel terminal-subpanel desk-next-actions-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Next Action</p>
            <h3>{nextActionHeading}</h3>
          </div>
          <button className="text-button" onClick={() => setShowHelp((current) => !current)} type="button">
            {showHelp ? "Hide Help" : "Help / Workflow"}
          </button>
        </div>
        <div className="stack">
          <small>{nextActionSummary}</small>
          <small>{selectedAssetReadiness.nextStep}</small>
          <small>
            Paper account {paperCapitalSummary.accountSize.toFixed(0)} / {paperCapitalSummary.openExposureCount} active exposures / open risk {compact(paperCapitalSummary.openRisk)}
          </small>
          {paperCapitalSummary.overAllocated ? <small>Allocated capital is above the 10k paper account. Treat this as an over-allocation warning, not available buying power.</small> : null}
          <small>Advisory-only. Paper workflow only.</small>
        </div>
        <div className="command-grid">
          {reviewQueueBlocking ? (
            <button className="action-button" onClick={() => onNavigate("session")} type="button">
              Open Review Queue
            </button>
          ) : baselineOrDataBlocking ? (
            <button className="action-button" onClick={() => onNavigate("pilot_ops")} type="button">
              Open Pilot Ops
            </button>
          ) : selectedAssetReadiness.kind === "research_only_today" ? (
            <>
              <button className="action-button" onClick={() => onNavigate("research")} type="button">
                Open Research
              </button>
              <button className="action-button" onClick={() => onNavigate("watchlist")} type="button">
                Open Commodity Board
              </button>
            </>
          ) : selectedAssetReadiness.kind === "no_actionable_setup" ? (
            <>
              <button className="action-button" onClick={() => onNavigate("watchlist")} type="button">
                Open Commodity Board
              </button>
              <button
                className="action-button"
                onClick={() => {
                  const signalId = desk.high_priority_signals[0]?.signal_id;
                  if (signalId) {
                    onNavigate("signals");
                    onOpenSignal(signalId);
                  } else {
                    onNavigate("signals");
                  }
                }}
                type="button"
              >
                Review Selected Setup
              </button>
            </>
          ) : (
            <>
              <button className="action-button" onClick={() => onNavigate(selectedHasRisk ? "trade_tickets" : "risk")} type="button">
                {selectedHasRisk ? "Open Tickets" : "Open Risk"}
              </button>
              <button
                className="action-button"
                onClick={() => {
                  const signalId = desk.high_priority_signals[0]?.signal_id;
                  if (signalId) {
                    onNavigate("signals");
                    onOpenSignal(signalId);
                  } else {
                    onNavigate("signals");
                  }
                }}
                type="button"
              >
                Review Selected Setup
              </button>
            </>
          )}
          <button className="action-button" onClick={onOpenCommandCenter} type="button">
            Open Ops Console
          </button>
          {!primaryActionIsTickets ? (
            <button
              className="action-button"
              onClick={() => {
                onSelectTicket(desk.open_tickets[0]?.ticket_id ?? null);
                onNavigate("trade_tickets");
              }}
              type="button"
            >
              Open Tickets
            </button>
          ) : null}
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
        </div>
      </article>

      {showHelp ? (
        <article className="panel compact-panel terminal-subpanel desk-help-panel" data-testid="desk-help-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Operator Help</p>
              <h3>Workflow Notes</h3>
            </div>
            <span className="tag">collapsed by default</span>
          </div>
          <div className="stack">
            {helpCopy.map((item) => (
              <small key={item}>{item}</small>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
