import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import { WorkspaceJumpRow } from "../components/WorkspaceJumpRow";
import { compactWorkflowId, duplicateWorkflowIdentityBases, duplicateWorkflowSymbols, operatorFamilyLabel, workflowIdentityLabel } from "../lib/workflowIdentity";
import { compareTimestamps, formatDateTimeIST } from "../lib/time";
import {
  assetWorkspaceTarget,
  riskContextTarget,
  signalContextTarget,
  tradeThreadTarget,
  type WorkspaceRouteState,
  type WorkspaceTarget,
} from "../lib/workspaceNavigation";
import type {
  PaperTradeFailureCategoryView,
  JournalReviewView,
  PaperTradeAnalyticsBucketView,
  PaperTradeAnalyticsView,
  PaperTradeDetailView,
  PaperTradeHygieneSummaryView,
  PaperTradeReviewRequest,
  PaperTradeReviewView,
  PaperTradeView,
  ReviewSummaryView,
} from "../types/api";

interface JournalTabProps {
  rows: JournalReviewView[];
  reviews: PaperTradeReviewView[];
  reviewsLoading?: boolean;
  reviewsError?: string | null;
  reviewSummary?: ReviewSummaryView | null;
  trades: PaperTradeView[];
  detail: PaperTradeDetailView | null;
  analytics: PaperTradeAnalyticsView;
  analyticsLoading?: boolean;
  analyticsError?: string | null;
  error?: string | null;
  selectedSymbol: string;
  selectedDisplaySymbol?: string | null;
  selectedTradeId: string | null;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
  onSelectTrade: (tradeId: string | null) => void;
  onChanged: () => Promise<void>;
  onNavigateWorkspaceTarget?: (target: WorkspaceTarget) => void;
  workspaceBaseState?: WorkspaceRouteState;
}

function encodeBool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "unknown";
  }
  return value ? "yes" : "no";
}

function decodeBool(value: string): boolean | null {
  if (value === "yes") {
    return true;
  }
  if (value === "no") {
    return false;
  }
  return null;
}

function titleize(value: string): string {
  return value.replace(/_/g, " ");
}

function friendlyJournalError(error: string | null | undefined): string | null {
  if (!error) {
    return null;
  }
  if (error.includes("Failed to fetch") || error.includes("CORS")) {
    return "Journal data is temporarily unavailable. The rest of the operator workflow remains usable while it reconnects.";
  }
  if (error.includes("/journal") || error.includes("500")) {
    return "Journal history is temporarily unavailable. Try refreshing the local stack if the issue persists.";
  }
  return "Journal data is temporarily unavailable right now.";
}

function tradeFamilyLabel(trade: PaperTradeView | null | undefined): string {
  return operatorFamilyLabel(trade?.linked_signal_family ?? trade?.strategy_id ?? "manual");
}

function qualityStateLabel(value: string | null | undefined): string {
  if (!value) {
    return "not established";
  }
  return value.replace(/_/g, " ");
}

function journalIdentityLabel(row: JournalReviewView): string {
  return workflowIdentityLabel(
    {
      symbol: row.display_symbol ?? row.symbol,
      family: operatorFamilyLabel(row.linked_signal_family ?? "manual"),
      side: row.side ?? "n/a",
      lifecycle: row.trade_status ?? row.review_status,
      accountabilityState: row.accountability_state ?? row.review_status,
      timestamp: row.updated_at,
      compactId: compactWorkflowId(row.journal_id),
    },
    new Set<string>(),
    "journal",
    new Set<string>(),
  );
}

function journalIdentityLabelWithTime(
  row: JournalReviewView,
  duplicateSymbols: Set<string>,
  duplicateBaseIdentities: Set<string>,
): string {
  return workflowIdentityLabel(
    {
      symbol: row.display_symbol ?? row.symbol,
      family: operatorFamilyLabel(row.linked_signal_family ?? "manual"),
      side: row.side ?? "n/a",
      lifecycle: row.trade_status ?? row.review_status,
      accountabilityState: row.accountability_state ?? row.review_status,
      timestamp: row.updated_at,
      compactId: compactWorkflowId(row.journal_id),
    },
    duplicateSymbols,
    "journal",
    duplicateBaseIdentities,
  );
}

function completedLoopIdentity(reviewSummary: ReviewSummaryView | null | undefined): string {
  const proof = reviewSummary?.discipline_loop_proof;
  if (!proof || proof.loop_completion_state !== "completed") {
    return "";
  }
  const identity = [
    proof.display_symbol ?? proof.latest_reviewed_trade_symbol ?? "paper loop",
    operatorFamilyLabel(proof.signal_family ?? "manual"),
    proof.side ?? "n/a",
    proof.trade_status ?? "reviewed",
  ];
  if (proof.review_status && proof.review_status !== proof.trade_status) {
    identity.push(proof.review_status);
  }
  return identity.join(" / ");
}

function proofSelectionNote(value: string | null | undefined): string | null {
  if (value === "latest_fully_linked") {
    return "Showing latest fully linked reviewed loop.";
  }
  if (value === "best_available") {
    return "Showing best available reviewed loop while flagship proof is still building.";
  }
  return null;
}

const compactId = compactWorkflowId;

function AnalyticsTable({ title, rows }: { title: string; rows: PaperTradeAnalyticsBucketView[] }) {
  return (
    <article className="panel compact-panel terminal-console-panel accountability-secondary-panel">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="showcase-note showcase-note-inline">
          <p className="showcase-note-body">No closed-trade outcomes yet.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Bucket</th>
              <th>Trades</th>
              <th>Hit</th>
              <th>Expect.</th>
              <th>Target</th>
              <th>Invalid.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.grouping}-${row.key}`}>
                <td>{operatorFamilyLabel(row.key)}</td>
                <td>{row.trade_count}</td>
                <td>{(row.hit_rate * 100).toFixed(0)}%</td>
                <td>{row.expectancy_proxy.toFixed(2)}%</td>
                <td>{(row.target_attainment_rate * 100).toFixed(0)}%</td>
                <td>{(row.invalidation_rate * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function HygienePanel({
  summary,
  syncing,
  note,
}: {
  summary: PaperTradeHygieneSummaryView;
  syncing?: boolean;
  note?: string | null;
}) {
  return (
    <article className="panel compact-panel terminal-console-panel">
      <h3>Decision Hygiene</h3>
      {syncing ? (
        <div className="stack">
          <p className="muted-copy">Review evidence is loaded. Decision hygiene metrics are refreshing.</p>
          {note ? <small>{note}</small> : null}
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <div>
              <span className="metric-label">Adherence rate</span>
              <strong>{(summary.adherence_rate * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Invalidation discipline</span>
              <strong>{(summary.invalidation_discipline_rate * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Realism violations</span>
              <strong>{summary.realism_warning_violation_count}</strong>
            </div>
            <div>
              <span className="metric-label">Review completion</span>
              <strong>{(summary.review_completion_rate * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Poor-adherence streak</span>
              <strong>{summary.poor_adherence_streak}</strong>
            </div>
            <div>
              <span className="metric-label">Promoted drift</span>
              <strong>{summary.promoted_strategy_drift_count}</strong>
            </div>
          </div>
          {summary.promoted_strategy_drift.length > 0 ? (
            <p className="muted-copy">Drift watch: {summary.promoted_strategy_drift.join(", ")}</p>
          ) : (
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">No promoted-strategy drift flags in the current fixture cohort.</p>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function FailureTable({ rows }: { rows: PaperTradeFailureCategoryView[] }) {
  return (
    <article className="panel compact-panel terminal-console-panel accountability-secondary-panel">
      <h3>Failure Attribution</h3>
      {rows.length === 0 ? (
        <div className="showcase-note showcase-note-inline">
          <p className="showcase-note-body">No structured failure tags yet.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Trades</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category}>
                <td>{titleize(row.category)}</td>
                <td>{row.trade_count}</td>
                <td>{row.operator_error ? "operator" : "system/context"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

export function JournalTab({
  rows,
  reviews,
  reviewsLoading = false,
  reviewsError = null,
  reviewSummary = null,
  trades,
  detail,
  analytics,
  analyticsLoading = false,
  analyticsError = null,
  error: journalError,
  selectedSymbol,
  selectedDisplaySymbol = null,
  selectedTradeId,
  selectedSignalId,
  selectedRiskReportId,
  onSelectTrade,
  onChanged,
  onNavigateWorkspaceTarget,
  workspaceBaseState,
}: JournalTabProps) {
  const closedTrades = useMemo(() => trades.filter((row) => row.closed_at), [trades]);
  const selectedTrade = detail ?? trades.find((row) => row.trade_id === selectedTradeId) ?? closedTrades[0] ?? trades[0] ?? null;
  const duplicateJournalShapes = useMemo(
    () =>
      rows.map((row) => ({
        symbol: row.display_symbol ?? row.symbol,
        family: operatorFamilyLabel(row.linked_signal_family ?? "manual"),
        side: row.side ?? "n/a",
          lifecycle: row.trade_status ?? row.review_status,
          accountabilityState: row.accountability_state ?? row.review_status,
          timestamp: row.updated_at,
          compactId: compactWorkflowId(row.journal_id),
      })),
    [rows],
  );
  const duplicateJournalSymbols = useMemo(() => duplicateWorkflowSymbols(duplicateJournalShapes), [duplicateJournalShapes]);
  const duplicateJournalBaseIdentities = useMemo(
    () => duplicateWorkflowIdentityBases(duplicateJournalShapes),
    [duplicateJournalShapes],
  );
  const selectedReview = reviews.find((row) => row.trade_id === selectedTrade?.trade_id) ?? detail?.review ?? null;
  const hasCompletedLoopEvidence = rows.length > 0 || reviews.length > 0 || closedTrades.length > 0;
  const analyticsSyncing = hasCompletedLoopEvidence && (analyticsLoading || (!!analyticsError && analytics.hygiene_summary.reviewed_trade_count === 0));
  const analyticsSyncNote = analyticsError
    ? "Analytics are still reconnecting, so the panel is preserving review evidence without showing misleading zeroed metrics."
    : "Closed trades or structured reviews are already present. Metrics will repopulate when analytics finish refreshing.";
  const reviewsDue = closedTrades.filter((trade) => trade.review_due).length;
  const reviewsDone = Math.max(closedTrades.length - reviewsDue, 0);
  const latestCompletedLoop = useMemo(
    () =>
      [...rows]
        .filter((row) => ["reviewed", "resolved"].includes((row.accountability_state ?? row.review_status).toLowerCase()))
        .sort((left, right) => compareTimestamps(right.updated_at, left.updated_at))[0] ?? null,
    [rows],
  );
  const disciplineProof = reviewSummary?.discipline_loop_proof ?? null;
  const reviewChainAnalytics = reviewSummary?.review_chain_analytics ?? null;
  const resolvedCompletedLoopAt = disciplineProof?.latest_completed_loop_at ?? latestCompletedLoop?.updated_at ?? null;
  const resolvedCompletedLoopIdentity = completedLoopIdentity(reviewSummary)
    || (latestCompletedLoop ? journalIdentityLabel(latestCompletedLoop) : "");
  const journalHeroNote = analyticsSyncing
    ? analyticsSyncNote
    : disciplineProof?.loop_completion_state === "completed"
      ? "The latest reviewed paper-trade loop is linked across trade, ticket, and review evidence here so the operator can verify discipline without guessing."
    : hasCompletedLoopEvidence
      ? "Closed-trade evidence, review completion, and discipline metrics are aligned here so the operator can close the loop without leaving the workspace."
      : "The journal stays compact until closed paper trades and structured reviews start feeding the loop.";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedJournalError = error ?? friendlyJournalError(journalError);
  const [reviewDraft, setReviewDraft] = useState<PaperTradeReviewRequest>({
    thesis_respected: selectedReview?.thesis_respected ?? null,
    invalidation_respected: selectedReview?.invalidation_respected ?? null,
    entered_inside_suggested_zone: selectedReview?.entered_inside_suggested_zone ?? selectedTrade?.adherence?.entered_inside_suggested_zone ?? null,
    time_stop_respected: selectedReview?.time_stop_respected ?? selectedTrade?.adherence?.time_stop_respected ?? null,
    entered_too_early: selectedReview?.entered_too_early ?? null,
    entered_too_late: selectedReview?.entered_too_late ?? null,
    oversized: selectedReview?.oversized ?? null,
    undersized: selectedReview?.undersized ?? null,
    realism_warning_ignored: selectedReview?.realism_warning_ignored ?? null,
    size_plan_respected: selectedReview?.size_plan_respected ?? selectedTrade?.adherence?.size_plan_respected ?? null,
    exited_per_plan: selectedReview?.exited_per_plan ?? selectedTrade?.adherence?.exited_per_plan ?? null,
    catalyst_mattered: selectedReview?.catalyst_mattered ?? null,
    failure_category: selectedReview?.failure_category ?? "",
    failure_categories: selectedReview?.failure_categories ?? [],
    operator_notes: selectedReview?.operator_notes ?? "",
  });

  useEffect(() => {
    setReviewDraft({
      thesis_respected: selectedReview?.thesis_respected ?? null,
      invalidation_respected: selectedReview?.invalidation_respected ?? null,
      entered_inside_suggested_zone: selectedReview?.entered_inside_suggested_zone ?? selectedTrade?.adherence?.entered_inside_suggested_zone ?? null,
      time_stop_respected: selectedReview?.time_stop_respected ?? selectedTrade?.adherence?.time_stop_respected ?? null,
      entered_too_early: selectedReview?.entered_too_early ?? null,
      entered_too_late: selectedReview?.entered_too_late ?? null,
      oversized: selectedReview?.oversized ?? null,
      undersized: selectedReview?.undersized ?? null,
      realism_warning_ignored: selectedReview?.realism_warning_ignored ?? null,
      size_plan_respected: selectedReview?.size_plan_respected ?? selectedTrade?.adherence?.size_plan_respected ?? null,
      exited_per_plan: selectedReview?.exited_per_plan ?? selectedTrade?.adherence?.exited_per_plan ?? null,
      catalyst_mattered: selectedReview?.catalyst_mattered ?? null,
      failure_category: selectedReview?.failure_category ?? "",
      failure_categories: selectedReview?.failure_categories ?? [],
      operator_notes: selectedReview?.operator_notes ?? "",
    });
  }, [selectedReview, selectedTrade]);

  async function handleSaveReview() {
    if (!selectedTrade) {
      setError("Select a paper trade before saving a structured review.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.upsertPaperTradeReview(selectedTrade.trade_id, reviewDraft);
      await onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Review save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split-stack accountability-grid accountability-console-tab">
      <div className="stack">
        <StateBlock error={resolvedJournalError} />
        <article className="panel compact-panel hero-panel terminal-console-panel">
          <span className="eyebrow">Trade Review</span>
          <div className="panel-title-row">
            <div>
              <h2>Journal Console</h2>
              <p className="muted-copy accountability-kicker">{journalHeroNote}</p>
            </div>
          </div>
          <div className="metric-grid accountability-strip">
            <div>
              <span className="metric-label">Reviews due</span>
              <strong>{reviewsDue}</strong>
            </div>
            <div>
              <span className="metric-label">Review backlog</span>
              <strong>{analytics.hygiene_summary.review_backlog}</strong>
            </div>
            <div>
              <span className="metric-label">Review completion</span>
              <strong>{(analytics.hygiene_summary.review_completion_rate * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Adherence rate</span>
              <strong>{(analytics.hygiene_summary.adherence_rate * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Closed trades</span>
              <strong>{closedTrades.length}</strong>
            </div>
            <div>
              <span className="metric-label">Reviews done</span>
              <strong>{reviewsDone}</strong>
            </div>
          </div>
        </article>

        <article className="panel compact-panel terminal-console-panel detail-table-panel">
          <span className="eyebrow">Closed Trade Backlog</span>
          <h3>Review Queue</h3>
          {closedTrades.length === 0 ? (
            <div className="showcase-note">
              <strong className="showcase-note-title">Closed-trade review lane is quiet</strong>
              <p className="showcase-note-body">
                {reviewsLoading
                  ? "Closed-trade review evidence is still hydrating."
                  : reviewsError
                    ? `Structured review rows did not load yet. ${reviewsError}`
                    : "No closed paper trades yet."}
              </p>
            </div>
          ) : (
            <div className="stack wire-list accountability-wire">
              {closedTrades.map((trade) => (
                <button
                  className={`wire-row review-queue-row ${selectedTrade?.trade_id === trade.trade_id ? "is-selected" : ""}`}
                  key={trade.trade_id}
                  onClick={() => onSelectTrade(trade.trade_id)}
                  type="button"
                >
                  <div className="panel-title-row">
                    <strong title={trade.trade_id}>{compactId(trade.trade_id)}</strong>
                    <div className="metric-row compact-row">
                      <span className="status-pill">{trade.status}</span>
                      <span className={`status-pill ${trade.review_due ? "warn" : "ok"}`}>{trade.review_due ? "due" : "done"}</span>
                    </div>
                  </div>
                  <div className="metric-row compact-row">
                    <span>{`${trade.display_symbol ?? trade.data_reality?.provenance.tradable_symbol ?? trade.symbol} / ${tradeFamilyLabel(trade)} / ${trade.side} / ${trade.status.replace(/_/g, " ")}`}</span>
                    <span>PnL {trade.outcome?.realized_pnl_pct.toFixed(2)}%</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>
        <HygienePanel note={analyticsSyncNote} summary={analytics.hygiene_summary} syncing={analyticsSyncing} />
        <AnalyticsTable rows={analytics.by_signal_family} title="Outcomes by Signal Family" />
        <FailureTable rows={analytics.failure_categories} />
        {disciplineProof?.loop_completion_state === "completed" ? (
          <article className="panel compact-panel terminal-console-panel discipline-loop-panel detail-proof-panel">
            <h3>Flagship Completed Loop</h3>
            <small>{resolvedCompletedLoopIdentity}</small>
            {proofSelectionNote(disciplineProof.selection_policy) ? (
              <small>{proofSelectionNote(disciplineProof.selection_policy)}</small>
            ) : null}
            <small>
              {disciplineProof.journal_attached
                ? "Trade, review, and journal evidence are all attached for this loop."
                : "Trade and structured review evidence are attached. Journal note is not attached yet."}
            </small>
            <small>
              {disciplineProof.ticket_id
                ? `Ticket linked: ${disciplineProof.ticket_id}`
                : "Ticket linkage pending"}
            </small>
            <small>
              {disciplineProof.latest_review_chain_summary}
              {resolvedCompletedLoopAt ? ` • ${formatDateTimeIST(resolvedCompletedLoopAt)}` : ""}
            </small>
            {reviewChainAnalytics ? (
              <small>
                Linkage quality {qualityStateLabel(reviewChainAnalytics.quality_state)}
                {" • "}
                {reviewChainAnalytics.quality_note}
              </small>
            ) : null}
          </article>
        ) : hasCompletedLoopEvidence ? (
          <article className="panel compact-panel terminal-console-panel discipline-loop-panel detail-proof-panel">
            <h3>Flagship Completed Loop</h3>
            <small>
              {selectedTrade?.display_symbol ?? selectedTrade?.data_reality?.provenance.tradable_symbol ?? selectedDisplaySymbol ?? selectedSymbol}
              {" "}completed review evidence is present, but the journal detail row is still refreshing.
            </small>
            <small>Paper-mode journal evidence only.</small>
          </article>
        ) : disciplineProof ? (
          <article className="panel compact-panel terminal-console-panel discipline-loop-panel detail-proof-panel">
            <h3>Flagship Completed Loop</h3>
            <small>{disciplineProof.latest_review_chain_summary || "A full reviewed paper-trade loop is not yet established in the current record."}</small>
            <small>{disciplineProof.loop_completion_state.replace(/_/g, " ")}</small>
          </article>
        ) : null}

        {reviewChainAnalytics ? (
          <article className="panel compact-panel terminal-console-panel accountability-secondary-panel detail-subpanel">
            <h3>Review Chain</h3>
            <div className="metric-grid accountability-strip">
              <div>
                <span className="metric-label">Closed / due</span>
                <strong>{reviewChainAnalytics.review_due_closed_trade_count}</strong>
              </div>
              <div>
                <span className="metric-label">Reviewed</span>
                <strong>{reviewChainAnalytics.reviewed_trade_count}</strong>
              </div>
              <div>
                <span className="metric-label">Missing ticket</span>
                <strong>{reviewChainAnalytics.reviewed_without_ticket_count}</strong>
              </div>
              <div>
                <span className="metric-label">Missing journal</span>
                <strong>{reviewChainAnalytics.reviewed_without_journal_count}</strong>
              </div>
              <div>
                <span className="metric-label">Fully linked</span>
                <strong>{reviewChainAnalytics.fully_linked_completed_loop_count}</strong>
              </div>
              <div>
                <span className="metric-label">Partially linked</span>
                <strong>{reviewChainAnalytics.partially_linked_reviewed_loop_count}</strong>
              </div>
              <div>
                <span className="metric-label">Reopened</span>
                <strong>{reviewChainAnalytics.reopened_after_review_count}</strong>
              </div>
              <div>
                <span className="metric-label">Archived w/o completion</span>
                <strong>{reviewChainAnalytics.archived_without_completion_count}</strong>
              </div>
              <div>
                <span className="metric-label">Latest linkage</span>
                <strong>{reviewChainAnalytics.latest_loop_linkage_state.replace(/_/g, " ")}</strong>
              </div>
              <div>
                <span className="metric-label">Quality</span>
                <strong>{qualityStateLabel(reviewChainAnalytics.quality_state)}</strong>
              </div>
            </div>
            <small className="muted-copy">{reviewChainAnalytics.quality_note}</small>
            {reviewChainAnalytics.debt_examples.length > 0 ? (
              <div className="stack wire-list accountability-wire">
                {reviewChainAnalytics.debt_examples.map((item) => (
                  <div className="wire-row review-queue-row" key={item.trade_id}>
                    <div className="panel-title-row">
                      <strong>{`${item.display_symbol} / ${operatorFamilyLabel(item.family)} / ${item.side} / ${item.trade_status.replace(/_/g, " ")}`}</strong>
                      <div className="metric-row compact-row">
                        {item.missing_ticket ? <span className="status-pill warn">ticket missing</span> : null}
                        {item.missing_journal ? <span className="status-pill warn">journal missing</span> : null}
                      </div>
                    </div>
                    <small>{item.reason}</small>
                    <small>{item.next_step}</small>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ) : null}

        {rows.length > 0 ? (
          <article className="panel compact-panel terminal-console-panel accountability-secondary-panel detail-subpanel">
            <h3>Audit / History Trail</h3>
            <div className="stack wire-list accountability-wire">
              {rows.slice(0, 4).map((row) => (
                <div className="wire-row review-queue-row" key={row.journal_id}>
                  <div className="panel-title-row">
                    <strong>{journalIdentityLabelWithTime(row, duplicateJournalSymbols, duplicateJournalBaseIdentities)}</strong>
                    <span className="status-pill">{row.accountability_state ?? row.review_status}</span>
                  </div>
                  <small>{row.note}</small>
                  <div className="metric-row compact-row">
                    <span>{formatDateTimeIST(row.updated_at)}</span>
                    <span>{row.entry_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ) : null}
      </div>

      <div className="stack">
        <article className="panel compact-panel terminal-console-panel hero-panel detail-shell-panel journal-review-shell">
          <span className="eyebrow">Structured Review</span>
          <h3>Structured Trade Review</h3>
          {selectedTrade ? (
            <>
              <section className="detail-section">
                <div className="panel-title-row">
                  <strong>Run Identity</strong>
                </div>
                <div className="metric-grid">
                  <div>
                    <span className="metric-label">Trade</span>
                    <strong title={selectedTrade.trade_id}>{compactId(selectedTrade.trade_id)}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Asset</span>
                    <strong>{selectedTrade.display_symbol ?? selectedTrade.data_reality?.provenance.tradable_symbol ?? selectedTrade.symbol}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Setup family</span>
                    <strong>{tradeFamilyLabel(selectedTrade)}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Linked Signal</span>
                    <strong title={selectedTrade.signal_id ?? selectedSignalId ?? "manual"}>{compactId(selectedTrade.signal_id ?? selectedSignalId ?? "manual")}</strong>
                  </div>
                </div>
                <WorkspaceJumpRow
                  actions={[
                    {
                      key: "journal-asset",
                      label: "Open asset workspace",
                      target: assetWorkspaceTarget({
                        symbol: selectedTrade.symbol,
                        signalId: selectedTrade.signal_id ?? selectedSignalId,
                        riskReportId: selectedTrade.risk_report_id ?? selectedRiskReportId,
                        tradeId: selectedTrade.trade_id,
                      }),
                    },
                    {
                      key: "journal-signal",
                      label: "Open signal",
                      target: signalContextTarget({
                        symbol: selectedTrade.symbol,
                        signalId: selectedTrade.signal_id ?? selectedSignalId,
                        riskReportId: selectedTrade.risk_report_id ?? selectedRiskReportId,
                      }),
                      disabled: !(selectedTrade.signal_id ?? selectedSignalId),
                    },
                    {
                      key: "journal-risk",
                      label: "Open risk",
                      target: riskContextTarget({
                        symbol: selectedTrade.symbol,
                        riskReportId: selectedTrade.risk_report_id ?? selectedRiskReportId,
                        signalId: selectedTrade.signal_id ?? selectedSignalId,
                      }),
                      disabled: !(selectedTrade.risk_report_id ?? selectedRiskReportId),
                    },
                    {
                      key: "journal-trade",
                      label: "Open trade thread",
                      target: tradeThreadTarget({
                        symbol: selectedTrade.symbol,
                        signalId: selectedTrade.signal_id ?? selectedSignalId,
                        riskReportId: selectedTrade.risk_report_id ?? selectedRiskReportId,
                        tradeId: selectedTrade.trade_id,
                      }),
                    },
                  ]}
                  baseState={workspaceBaseState}
                  onNavigate={onNavigateWorkspaceTarget}
                />
                {!selectedTrade.data_reality?.execution_grade_allowed ? (
                  <small className="muted-copy">Degraded commodity truth was active for this trade path. Keep this review explicitly paper-only and not execution-grade.</small>
                ) : null}
                <small className="muted-copy">Unknown means the operator has not scored that review field yet.</small>
              </section>
              <section className="detail-section">
                <div className="panel-title-row">
                  <strong>Discipline Inputs</strong>
                </div>
                <div className="field-grid detail-field-grid">
                <label className="field">
                  <span>Thesis Respected</span>
                  <select
                    value={encodeBool(reviewDraft.thesis_respected)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, thesis_respected: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Invalidation Respected</span>
                  <select
                    value={encodeBool(reviewDraft.invalidation_respected)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, invalidation_respected: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Entered Inside Zone</span>
                  <select
                    value={encodeBool(reviewDraft.entered_inside_suggested_zone)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, entered_inside_suggested_zone: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Time Stop Respected</span>
                  <select
                    value={encodeBool(reviewDraft.time_stop_respected)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, time_stop_respected: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Entered Too Early</span>
                  <select
                    value={encodeBool(reviewDraft.entered_too_early)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, entered_too_early: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Entered Too Late</span>
                  <select
                    value={encodeBool(reviewDraft.entered_too_late)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, entered_too_late: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Oversized</span>
                  <select
                    value={encodeBool(reviewDraft.oversized)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, oversized: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Undersized</span>
                  <select
                    value={encodeBool(reviewDraft.undersized)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, undersized: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Realism Warning Ignored</span>
                  <select
                    value={encodeBool(reviewDraft.realism_warning_ignored)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, realism_warning_ignored: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Size Plan Respected</span>
                  <select
                    value={encodeBool(reviewDraft.size_plan_respected)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, size_plan_respected: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Exited Per Plan</span>
                  <select
                    value={encodeBool(reviewDraft.exited_per_plan)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, exited_per_plan: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Catalyst Mattered</span>
                  <select
                    value={encodeBool(reviewDraft.catalyst_mattered)}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, catalyst_mattered: decodeBool(event.target.value) }))}
                  >
                    <option value="unknown">unknown</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
                <label className="field">
                  <span>Primary Failure Category</span>
                  <input
                    value={reviewDraft.failure_category ?? ""}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, failure_category: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Failure Tags</span>
                  <input
                    value={(reviewDraft.failure_categories ?? []).join(", ")}
                    onChange={(event) =>
                      setReviewDraft((current) => ({
                        ...current,
                        failure_categories: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </label>
                </div>
              </section>
              {selectedTrade.adherence ? (
                <section className="detail-section">
                  <div className="panel-title-row">
                    <strong>Derived Adherence Summary</strong>
                  </div>
                  <div className="metric-row compact-row">
                  <span>Derived adherence {(selectedTrade.adherence.adherence_score * 100).toFixed(0)}%</span>
                  <span>
                    {selectedTrade.adherence.breached_rules.length > 0
                      ? selectedTrade.adherence.breached_rules.map((item) => titleize(item)).join(", ")
                      : "no derived breaches"}
                  </span>
                  </div>
                </section>
              ) : null}
              <section className="detail-section">
                <div className="panel-title-row">
                  <strong>Operator Notes</strong>
                </div>
                <label className="field">
                  <span>Operator Notes</span>
                  <textarea
                    value={reviewDraft.operator_notes ?? ""}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, operator_notes: event.target.value }))}
                  />
                </label>
                <div className="metric-row detail-action-row">
                  <button className="text-button" disabled={busy} onClick={() => void handleSaveReview()} type="button">
                    {busy ? "Saving…" : "Save Review"}
                  </button>
                  <small>
                    {selectedReview
                      ? "Review recorded. Edit the fields below if you need to revise it."
                      : selectedTrade.review_due
                        ? "Structured review is due. Unknown means the operator has not scored that field yet."
                        : "Structured review not recorded yet. Unknown means the operator has not scored that field yet."}
                  </small>
                </div>
              </section>
            </>
          ) : (
            <div className="showcase-note">
              <strong className="showcase-note-title">Select a paper trade to review</strong>
              <p className="showcase-note-body">No paper trade selected for review. Current symbol: {selectedDisplaySymbol ?? selectedSymbol}.</p>
            </div>
          )}
        </article>

        <AnalyticsTable rows={analytics.by_asset_class} title="Outcomes by Asset Class" />
        <AnalyticsTable rows={analytics.by_strategy} title="Outcomes by Strategy" />
        <AnalyticsTable rows={analytics.by_strategy_lifecycle_state} title="Outcomes by Strategy Lifecycle" />
        <AnalyticsTable rows={analytics.by_score_bucket} title="Outcomes by Score Bucket" />
        <AnalyticsTable rows={analytics.by_realism_bucket} title="Outcomes by Realism Bucket" />
        <AnalyticsTable rows={analytics.by_realism_grade} title="Outcomes by Realism Grade" />
        <AnalyticsTable rows={analytics.by_freshness_state} title="Outcomes by Freshness State" />
        <AnalyticsTable rows={analytics.by_asset} title="Outcomes by Asset" />

        <article className="panel compact-panel terminal-console-panel">
          <span className="eyebrow">Journal Archive</span>
          <h3>Legacy Journal Notes</h3>
          {rows.length === 0 ? (
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">No free-form journal entries seeded.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.journal_id}>
                    <td>{row.display_symbol ?? row.symbol}</td>
                    <td>{row.entry_type}</td>
                    <td>{row.review_status}</td>
                    <td>{row.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </div>
    </div>
  );
}
