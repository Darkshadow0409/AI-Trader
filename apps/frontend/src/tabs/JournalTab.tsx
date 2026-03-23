import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
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
} from "../types/api";

interface JournalTabProps {
  rows: JournalReviewView[];
  reviews: PaperTradeReviewView[];
  trades: PaperTradeView[];
  detail: PaperTradeDetailView | null;
  analytics: PaperTradeAnalyticsView;
  error?: string | null;
  selectedSymbol: string;
  selectedTradeId: string | null;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
  onSelectTrade: (tradeId: string | null) => void;
  onChanged: () => Promise<void>;
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

function compactId(value: string | null | undefined): string {
  if (!value) {
    return "manual";
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
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

function AnalyticsTable({ title, rows }: { title: string; rows: PaperTradeAnalyticsBucketView[] }) {
  return (
    <article className="panel compact-panel">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted-copy">No closed-trade outcomes yet.</p>
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
                <td>{row.key}</td>
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

function HygienePanel({ summary }: { summary: PaperTradeHygieneSummaryView }) {
  return (
    <article className="panel compact-panel">
      <h3>Decision Hygiene</h3>
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
        <p className="muted-copy">No promoted-strategy drift flags in the current fixture cohort.</p>
      )}
    </article>
  );
}

function FailureTable({ rows }: { rows: PaperTradeFailureCategoryView[] }) {
  return (
    <article className="panel compact-panel">
      <h3>Failure Attribution</h3>
      {rows.length === 0 ? (
        <p className="muted-copy">No structured failure tags yet.</p>
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
  trades,
  detail,
  analytics,
  error: journalError,
  selectedSymbol,
  selectedTradeId,
  selectedSignalId,
  selectedRiskReportId,
  onSelectTrade,
  onChanged,
}: JournalTabProps) {
  const closedTrades = useMemo(() => trades.filter((row) => row.closed_at), [trades]);
  const selectedTrade = detail ?? trades.find((row) => row.trade_id === selectedTradeId) ?? closedTrades[0] ?? trades[0] ?? null;
  const selectedReview = reviews.find((row) => row.trade_id === selectedTrade?.trade_id) ?? detail?.review ?? null;

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
    <div className="split-stack">
      <div className="stack">
        <StateBlock error={resolvedJournalError} />
        <article className="panel compact-panel">
          <h3>Review Queue</h3>
          {closedTrades.length === 0 ? (
            <p className="muted-copy">No closed paper trades yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th>Asset</th>
                  <th>Status</th>
                  <th>PnL</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map((trade) => (
                  <tr
                    className={selectedTrade?.trade_id === trade.trade_id ? "row-selected" : ""}
                    key={trade.trade_id}
                    onClick={() => onSelectTrade(trade.trade_id)}
                  >
                    <td title={trade.trade_id}>{compactId(trade.trade_id)}</td>
                    <td>{trade.symbol}</td>
                    <td>{trade.status}</td>
                    <td>{trade.outcome?.realized_pnl_pct.toFixed(2)}%</td>
                    <td>{trade.review_due ? "due" : "done"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
        <HygienePanel summary={analytics.hygiene_summary} />
        <AnalyticsTable rows={analytics.by_signal_family} title="Outcomes by Signal Family" />
        <AnalyticsTable rows={analytics.by_asset_class} title="Outcomes by Asset Class" />
        <AnalyticsTable rows={analytics.by_strategy} title="Outcomes by Strategy" />
        <AnalyticsTable rows={analytics.by_strategy_lifecycle_state} title="Outcomes by Strategy Lifecycle" />
        <AnalyticsTable rows={analytics.by_score_bucket} title="Outcomes by Score Bucket" />
        <AnalyticsTable rows={analytics.by_realism_bucket} title="Outcomes by Realism Bucket" />
        <AnalyticsTable rows={analytics.by_realism_grade} title="Outcomes by Realism Grade" />
        <AnalyticsTable rows={analytics.by_freshness_state} title="Outcomes by Freshness State" />
        <AnalyticsTable rows={analytics.by_asset} title="Outcomes by Asset" />
        <FailureTable rows={analytics.failure_categories} />
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Structured Trade Review</h3>
          {selectedTrade ? (
            <>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Trade</span>
                  <strong title={selectedTrade.trade_id}>{compactId(selectedTrade.trade_id)}</strong>
                </div>
                <div>
                  <span className="metric-label">Asset</span>
                  <strong>{selectedTrade.symbol}</strong>
                </div>
                <div>
                  <span className="metric-label">Linked Signal</span>
                  <strong title={selectedTrade.signal_id ?? selectedSignalId ?? "manual"}>{compactId(selectedTrade.signal_id ?? selectedSignalId ?? "manual")}</strong>
                </div>
                <div>
                  <span className="metric-label">Linked Risk</span>
                  <strong title={selectedTrade.risk_report_id ?? selectedRiskReportId ?? "manual"}>{compactId(selectedTrade.risk_report_id ?? selectedRiskReportId ?? "manual")}</strong>
                </div>
              </div>
              <small className="muted-copy">Unknown means the operator has not scored that review field yet.</small>
              <div className="field-grid">
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
              {selectedTrade.adherence ? (
                <div className="metric-row compact-row">
                  <span>Derived adherence {(selectedTrade.adherence.adherence_score * 100).toFixed(0)}%</span>
                  <span>
                    {selectedTrade.adherence.breached_rules.length > 0
                      ? selectedTrade.adherence.breached_rules.map((item) => titleize(item)).join(", ")
                      : "no derived breaches"}
                  </span>
                </div>
              ) : null}
              <label className="field">
                <span>Operator Notes</span>
                <textarea
                  value={reviewDraft.operator_notes ?? ""}
                  onChange={(event) => setReviewDraft((current) => ({ ...current, operator_notes: event.target.value }))}
                />
              </label>
              <div className="metric-row">
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
            </>
          ) : (
            <p className="muted-copy">No paper trade selected for review. Current symbol: {selectedSymbol}.</p>
          )}
        </article>

        <article className="panel compact-panel">
          <h3>Legacy Journal Notes</h3>
          {rows.length === 0 ? (
            <p className="muted-copy">No free-form journal entries seeded.</p>
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
                    <td>{row.symbol}</td>
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
