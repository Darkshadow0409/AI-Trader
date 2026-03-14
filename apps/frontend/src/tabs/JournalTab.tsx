import { useState } from "react";
import type { JournalReviewView } from "../types/api";

export function JournalTab({ rows }: { rows: JournalReviewView[] }) {
  const [draft, setDraft] = useState({
    note: rows[0]?.note ?? "",
    followThrough: rows[0]?.follow_through ?? "",
    lessons: rows[0]?.lessons ?? "",
  });

  return (
    <div className="split-stack">
      <table className="data-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Entered</th>
            <th>Mood</th>
            <th>Setup</th>
            <th>Execution</th>
            <th>Outcome</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.symbol}-${row.entered_at}`}>
              <td>{row.symbol}</td>
              <td>{new Date(row.entered_at).toLocaleString()}</td>
              <td>{row.mood}</td>
              <td>{row.setup_quality}/5</td>
              <td>{row.execution_quality}/5</td>
              <td>{row.outcome}</td>
              <td>{row.review_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <article className="panel compact-panel">
        <h3>Trade Review Draft</h3>
        <label className="field">
          <span>Notes</span>
          <textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
        </label>
        <label className="field">
          <span>Follow-through</span>
          <textarea
            value={draft.followThrough}
            onChange={(event) => setDraft((current) => ({ ...current, followThrough: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Lessons</span>
          <textarea
            value={draft.lessons}
            onChange={(event) => setDraft((current) => ({ ...current, lessons: event.target.value }))}
          />
        </label>
        <p className="muted-copy">Local draft mode only. The current backend exposes seeded journal review reads but no write route yet.</p>
      </article>
    </div>
  );
}
