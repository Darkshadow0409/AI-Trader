import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import type {
  JournalReviewView,
  PaperTradeAnalyticsBucketView,
  PaperTradeAnalyticsView,
  PaperTradeDetailView,
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

export function JournalTab({
  rows,
  reviews,
  trades,
  detail,
  analytics,
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
  const [reviewDraft, setReviewDraft] = useState<PaperTradeReviewRequest>({
    thesis_respected: selectedReview?.thesis_respected ?? null,
    invalidation_respected: selectedReview?.invalidation_respected ?? null,
    entered_too_early: selectedReview?.entered_too_early ?? null,
    entered_too_late: selectedReview?.entered_too_late ?? null,
    oversized: selectedReview?.oversized ?? null,
    undersized: selectedReview?.undersized ?? null,
    realism_warning_ignored: selectedReview?.realism_warning_ignored ?? null,
    catalyst_mattered: selectedReview?.catalyst_mattered ?? null,
    failure_category: selectedReview?.failure_category ?? "",
    operator_notes: selectedReview?.operator_notes ?? "",
  });

  useEffect(() => {
    setReviewDraft({
      thesis_respected: selectedReview?.thesis_respected ?? null,
      invalidation_respected: selectedReview?.invalidation_respected ?? null,
      entered_too_early: selectedReview?.entered_too_early ?? null,
      entered_too_late: selectedReview?.entered_too_late ?? null,
      oversized: selectedReview?.oversized ?? null,
      undersized: selectedReview?.undersized ?? null,
      realism_warning_ignored: selectedReview?.realism_warning_ignored ?? null,
      catalyst_mattered: selectedReview?.catalyst_mattered ?? null,
      failure_category: selectedReview?.failure_category ?? "",
      operator_notes: selectedReview?.operator_notes ?? "",
    });
  }, [selectedReview]);

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
        <StateBlock error={error} />
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
                    <td>{trade.trade_id}</td>
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
        <AnalyticsTable rows={analytics.by_signal_family} title="Outcomes by Signal Family" />
        <AnalyticsTable rows={analytics.by_strategy} title="Outcomes by Strategy" />
        <AnalyticsTable rows={analytics.by_score_bucket} title="Outcomes by Score Bucket" />
        <AnalyticsTable rows={analytics.by_realism_bucket} title="Outcomes by Realism Bucket" />
        <AnalyticsTable rows={analytics.by_asset} title="Outcomes by Asset" />
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Structured Trade Review</h3>
          {selectedTrade ? (
            <>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Trade</span>
                  <strong>{selectedTrade.trade_id}</strong>
                </div>
                <div>
                  <span className="metric-label">Asset</span>
                  <strong>{selectedTrade.symbol}</strong>
                </div>
                <div>
                  <span className="metric-label">Linked Signal</span>
                  <strong>{selectedTrade.signal_id ?? selectedSignalId ?? "manual"}</strong>
                </div>
                <div>
                  <span className="metric-label">Linked Risk</span>
                  <strong>{selectedTrade.risk_report_id ?? selectedRiskReportId ?? "manual"}</strong>
                </div>
              </div>
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
                  <span>Failure Category</span>
                  <input
                    value={reviewDraft.failure_category ?? ""}
                    onChange={(event) => setReviewDraft((current) => ({ ...current, failure_category: event.target.value }))}
                  />
                </label>
              </div>
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
                <small>{selectedTrade.review_due ? "Review is due." : "Review already recorded."}</small>
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
