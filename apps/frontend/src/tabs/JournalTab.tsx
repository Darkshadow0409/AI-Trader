import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import type { JournalEntryCreateRequest, JournalEntryUpdateRequest, JournalReviewView } from "../types/api";

interface JournalTabProps {
  rows: JournalReviewView[];
  selectedSymbol: string;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
  selectedTradeId: string | null;
  onChanged: () => Promise<void>;
}

export function JournalTab({ rows, selectedSymbol, selectedSignalId, selectedRiskReportId, selectedTradeId, onChanged }: JournalTabProps) {
  const selectedEntry = rows.find((row) => row.symbol === selectedSymbol) ?? rows[0] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<JournalEntryCreateRequest>({
    symbol: selectedSymbol || "BTC",
    entered_at: new Date().toISOString(),
    entry_type: "pre_trade",
    note: "",
    mood: "focused",
    tags: [],
    signal_id: selectedSignalId,
    risk_report_id: selectedRiskReportId,
    trade_id: selectedTradeId,
    setup_quality: 0,
    execution_quality: 0,
    follow_through: "",
    outcome: "",
    lessons: "",
    review_status: "logged",
  });
  const [editDraft, setEditDraft] = useState<JournalEntryUpdateRequest>({
    note: selectedEntry?.note,
    mood: selectedEntry?.mood,
    tags: selectedEntry?.tags,
    signal_id: selectedEntry?.signal_id,
    risk_report_id: selectedEntry?.risk_report_id,
    trade_id: selectedEntry?.trade_id,
    setup_quality: selectedEntry?.setup_quality,
    execution_quality: selectedEntry?.execution_quality,
    follow_through: selectedEntry?.follow_through,
    outcome: selectedEntry?.outcome,
    lessons: selectedEntry?.lessons,
    review_status: selectedEntry?.review_status,
  });

  useEffect(() => {
    setCreateDraft((current) => ({
      ...current,
      symbol: selectedSymbol || current.symbol,
      signal_id: selectedSignalId,
      risk_report_id: selectedRiskReportId,
      trade_id: selectedTradeId,
    }));
  }, [selectedRiskReportId, selectedSignalId, selectedSymbol, selectedTradeId]);

  useEffect(() => {
    setEditDraft({
      note: selectedEntry?.note,
      mood: selectedEntry?.mood,
      tags: selectedEntry?.tags,
      signal_id: selectedEntry?.signal_id,
      risk_report_id: selectedEntry?.risk_report_id,
      trade_id: selectedEntry?.trade_id,
      setup_quality: selectedEntry?.setup_quality,
      execution_quality: selectedEntry?.execution_quality,
      follow_through: selectedEntry?.follow_through,
      outcome: selectedEntry?.outcome,
      lessons: selectedEntry?.lessons,
      review_status: selectedEntry?.review_status,
    });
  }, [selectedEntry]);

  async function handleCreate() {
    setBusy("create");
    setError(null);
    try {
      await apiClient.createJournalEntry(createDraft);
      await onChanged();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Journal create failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdate() {
    if (!selectedEntry) {
      return;
    }
    setBusy("update");
    setError(null);
    try {
      await apiClient.updateJournalEntry(selectedEntry.journal_id, editDraft);
      await onChanged();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Journal update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="split-stack">
      <div className="stack">
        <StateBlock error={error} />
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Entered</th>
              <th>Type</th>
              <th>Mood</th>
              <th>Setup</th>
              <th>Execution</th>
              <th>Outcome</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={selectedEntry?.journal_id === row.journal_id ? "row-selected" : ""} key={row.journal_id}>
                <td>{row.symbol}</td>
                <td>{new Date(row.entered_at).toLocaleString()}</td>
                <td>{row.entry_type}</td>
                <td>{row.mood}</td>
                <td>{row.setup_quality}/5</td>
                <td>{row.execution_quality}/5</td>
                <td>{row.outcome}</td>
                <td>{row.review_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Create Journal Entry</h3>
          <label className="field">
            <span>Pre / Post Trade Note</span>
            <textarea value={createDraft.note} onChange={(event) => setCreateDraft((current) => ({ ...current, note: event.target.value }))} />
          </label>
          <label className="field">
            <span>Lessons</span>
            <textarea value={createDraft.lessons ?? ""} onChange={(event) => setCreateDraft((current) => ({ ...current, lessons: event.target.value }))} />
          </label>
          <div className="metric-row">
            <button className="text-button" disabled={busy === "create"} onClick={() => void handleCreate()} type="button">
              {busy === "create" ? "Saving…" : "Create Entry"}
            </button>
            <small>Links current symbol, signal, risk, and trade context.</small>
          </div>
        </article>

        <article className="panel compact-panel">
          <h3>Update Selected Review</h3>
          {selectedEntry ? (
            <>
              <label className="field">
                <span>Note</span>
                <textarea value={editDraft.note ?? ""} onChange={(event) => setEditDraft((current) => ({ ...current, note: event.target.value }))} />
              </label>
              <label className="field">
                <span>Follow-through</span>
                <textarea
                  value={editDraft.follow_through ?? ""}
                  onChange={(event) => setEditDraft((current) => ({ ...current, follow_through: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Lessons</span>
                <textarea value={editDraft.lessons ?? ""} onChange={(event) => setEditDraft((current) => ({ ...current, lessons: event.target.value }))} />
              </label>
              <div className="metric-row">
                <button className="text-button" disabled={busy === "update"} onClick={() => void handleUpdate()} type="button">
                  {busy === "update" ? "Saving…" : "Update Review"}
                </button>
              </div>
            </>
          ) : (
            <p className="muted-copy">No journal entry selected.</p>
          )}
        </article>
      </div>
    </div>
  );
}
