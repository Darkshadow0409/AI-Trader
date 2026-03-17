import { useState } from "react";
import { apiClient } from "../api/client";
import type { CommandCenterStatusView, OpsActionSpecView, OpsActionView, OpsSummaryView } from "../types/api";

interface CommandCenterProps {
  status: CommandCenterStatusView;
  summary: OpsSummaryView;
  onRefreshAll: () => Promise<void>;
}

function formatTimestamp(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "n/a";
}

function renderActionStatus(action: OpsActionView | null | undefined): string {
  if (!action) {
    return "n/a";
  }
  return `${action.status} / ${formatTimestamp(action.finished_at ?? action.started_at)}`;
}

export function CommandCenter({ status, summary, onRefreshAll }: CommandCenterProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAction(action: OpsActionSpecView) {
    if (action.is_heavy) {
      const confirmed = window.confirm(`${action.label} is a heavier maintenance action.\n\n${action.warning}\n\nContinue?`);
      if (!confirmed) {
        return;
      }
    }
    setBusy(action.action_name);
    setMessage(null);
    try {
      const result = await apiClient.runSystemAction(action.action_name, { confirm_heavy: action.is_heavy });
      await onRefreshAll();
      setMessage(`${action.label}: ${result.status} - ${result.summary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${action.label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  function renderActionButtons(actions: OpsActionSpecView[]) {
    return (
      <div className="command-grid">
        {actions.map((action) => (
          <button
            className="action-button"
            disabled={busy === action.action_name}
            key={action.action_name}
            onClick={() => void handleAction(action)}
            title={action.warning}
            type="button"
          >
            {busy === action.action_name ? `${action.label}…` : action.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <section className="panel command-center">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Command Center</p>
          <h2>Operations Console</h2>
        </div>
        <div className="inline-tags">
          <span className="tag">{status.runtime_status}</span>
          <span className="tag">{status.source_mode}</span>
          <span className="tag">{status.pipeline_status}</span>
          <span className="tag">{status.backend_health}</span>
        </div>
      </div>

      <div className="metric-grid">
        <div>
          <span className="metric-label">Pipeline Freshness</span>
          <strong>{status.pipeline_freshness_minutes}m</strong>
        </div>
        <div>
          <span className="metric-label">Last Refresh</span>
          <strong>{formatTimestamp(status.last_refresh)}</strong>
        </div>
        <div>
          <span className="metric-label">Frontend Runtime</span>
          <strong>{status.frontend_runtime_status}</strong>
        </div>
        <div>
          <span className="metric-label">Diagnostics</span>
          <strong>{formatTimestamp(status.diagnostics_updated_at)}</strong>
        </div>
      </div>

      <div className="desk-grid">
        <article className="panel compact-panel">
          <h3>Safe / Common</h3>
          <p className="muted-copy">Normal daily operations that keep fixture-first workflows current.</p>
          {renderActionButtons(status.safe_actions)}
        </article>

        <article className="panel compact-panel">
          <h3>Heavy / Maintenance</h3>
          <p className="muted-copy">Explicit confirmation required before slower verification or bundle tasks run.</p>
          {renderActionButtons(status.heavy_actions)}
        </article>

        <article className="panel compact-panel">
          <h3>Latest Runs</h3>
          <div className="stack">
            <div className="metric-row compact-row">
              <span>Fast Verify</span>
              <span>{renderActionStatus(status.latest_fast_verify)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>Full Verify</span>
              <span>{renderActionStatus(status.latest_full_verify)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>Pilot Export</span>
              <span>{renderActionStatus(status.latest_export)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>Review Bundle</span>
              <span>{renderActionStatus(status.latest_bundle)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>Contract Snapshots</span>
              <span>{renderActionStatus(status.latest_contract_snapshot)}</span>
            </div>
          </div>
        </article>

        <article className="panel compact-panel">
          <h3>Action History</h3>
          {summary.action_history.length === 0 ? (
            <p className="muted-copy">No recent command-center actions recorded.</p>
          ) : (
            <div className="stack">
              {summary.action_history.slice(0, 8).map((item) => (
                <div className="news-item" key={item.action_id}>
                  <strong>{item.action_name}</strong>
                  <small>
                    {item.status} / {formatTimestamp(item.finished_at ?? item.started_at)}
                  </small>
                  <small>{item.summary}</small>
                  {item.log_path ? <small>{item.log_path}</small> : null}
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <div className="stack">
        {status.latest_export_path ? <small>latest export: {status.latest_export_path}</small> : null}
        {status.latest_review_bundle_path ? <small>review bundle: {status.latest_review_bundle_path}</small> : null}
        {status.notes.map((item) => (
          <small key={item}>{item}</small>
        ))}
        {message ? <small>{message}</small> : null}
      </div>
    </section>
  );
}
