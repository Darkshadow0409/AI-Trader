import { type MouseEvent, useState } from "react";
import { apiClient } from "../api/client";
import { buildWorkspaceHref, operatorWireTarget, type WorkspaceRouteState, type WorkspaceTarget } from "../lib/workspaceNavigation";
import { formatDateTimeIST } from "../lib/time";
import { operatorWireCategoryLabel, operatorWireFreshnessLabel, recoveryReasonLabel, recoveryStatusLabel, titleCase } from "../lib/uiLabels";
import type { CommandCenterStatusView, CommodityTruthStatusView, OperatorWireItemView, OpsActionSpecView, OpsActionView, OpsSummaryView } from "../types/api";
import { RealityStrip } from "./RealityStrip";

interface CommandCenterProps {
  status: CommandCenterStatusView;
  summary: OpsSummaryView;
  onRefreshAll: () => Promise<void>;
  onOpenWireItem?: (item: OperatorWireItemView) => void;
  onNavigateWorkspaceTarget?: (target: WorkspaceTarget) => void;
  selectedSymbol?: string | null;
  workspaceBaseState?: WorkspaceRouteState;
}

function formatTimestamp(value: string | null | undefined): string {
  return formatDateTimeIST(value);
}

function renderActionStatus(action: OpsActionView | null | undefined): string {
  if (!action) {
    return "n/a";
  }
  return `${action.status} / ${formatTimestamp(action.finished_at ?? action.started_at)}`;
}

function shouldHandleInAppNavigation(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function CommandCenter({
  status,
  summary,
  onRefreshAll,
  onOpenWireItem,
  onNavigateWorkspaceTarget,
  selectedSymbol = null,
  workspaceBaseState,
}: CommandCenterProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const effectiveLastRefresh =
    status.last_refresh
    ?? status.latest_refresh_action?.finished_at
    ?? status.latest_refresh_action?.started_at
    ?? status.diagnostics_updated_at
    ?? null;
  const recovery = status.recovery_telemetry;
  const priorityWire = status.priority_wire?.items ?? [];
  const recoveryTruth: CommodityTruthStatusView | null = recovery
    ? {
      truth_state: recovery.truth_state,
      truth_label: recovery.truth_label,
      truth_note: recovery.recovery_reason ? recoveryReasonLabel(recovery.recovery_reason) : recovery.truth_label,
      last_verified_at: null,
      last_verified_age_minutes: null,
      recovery_in_progress: recovery.recovery_active ?? false,
      blocking_reason: recovery.blocking_reason ?? undefined,
    }
    : null;

  function displayLabel(action: OpsActionSpecView): string {
    if (action.action_name === "fixture_refresh") {
      return "Reset Fixture Data";
    }
    return action.label;
  }

  function needsConfirmation(action: OpsActionSpecView): boolean {
    return action.is_heavy || action.action_name === "fixture_refresh";
  }

  async function handleAction(action: OpsActionSpecView) {
    if (needsConfirmation(action)) {
      const prompt =
        action.action_name === "fixture_refresh"
          ? "Reset Fixture Data will reseed deterministic local sample data and refresh derived views.\n\nThis is safe for fixture mode, but it will overwrite the current local fixture-backed state.\n\nContinue?"
          : `${action.label} is a heavier maintenance action.\n\n${action.warning}\n\nContinue?`;
      const confirmed = window.confirm(prompt);
      if (!confirmed) {
        return;
      }
    }
    setBusy(action.action_name);
    setMessage(null);
    try {
      const result = await apiClient.runSystemAction(action.action_name, { confirm_heavy: needsConfirmation(action) });
      await onRefreshAll();
      setMessage(`${displayLabel(action)}: ${result.status} - ${result.summary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${displayLabel(action)} failed.`);
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
            {busy === action.action_name ? `${displayLabel(action)}…` : displayLabel(action)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <section className="panel command-center terminal-console-panel showcase-command-center">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Global Wire</p>
          <h2>Operator Command Center</h2>
        </div>
        <div className="inline-tags">
          <span className="tag">{status.runtime_status}</span>
          <span className="tag">{status.source_mode}</span>
          <span className="tag">{status.pipeline_status}</span>
          <span className="tag">{status.backend_health}</span>
        </div>
      </div>

      <div className="metric-grid command-center-metrics console-strip analyst-console-strip">
        <div>
          <span className="metric-label">Pipeline</span>
          <strong>{status.pipeline_freshness_minutes}m</strong>
        </div>
        <div>
          <span className="metric-label">Last refresh</span>
          <strong>{formatTimestamp(effectiveLastRefresh)}</strong>
        </div>
        <div>
          <span className="metric-label">Frontend</span>
          <strong>{status.frontend_runtime_status}</strong>
        </div>
        <div>
          <span className="metric-label">Diagnostics</span>
          <strong>{formatTimestamp(status.diagnostics_updated_at)}</strong>
        </div>
      </div>

      <div className="command-center-grid focus-layout">
        <div className="command-center-main">
          <article className="panel compact-panel terminal-subpanel hero-panel command-center-wire-panel detail-shell-panel">
            <div className="panel-header">
              <div>
                <h3>Priority Wire</h3>
                <p className="muted-copy">The few changes that still alter desk posture right now.</p>
              </div>
              <span className="tag">{priorityWire.length} item{priorityWire.length === 1 ? "" : "s"}</span>
            </div>
            {priorityWire.length === 0 ? (
              <div className="showcase-note showcase-note-inline">
                <p className="showcase-note-body">No priority wire items are published for this runtime yet.</p>
              </div>
            ) : (
              <div className="stack wire-list">
                {priorityWire.map((item, index) => (
                  <a
                    className="news-item wire-row command-wire-row"
                    href={buildWorkspaceHref(operatorWireTarget(item, selectedSymbol), { baseState: workspaceBaseState })}
                    key={`${item.category}-${item.headline}-${index}`}
                    onClick={(event) => {
                      if (!shouldHandleInAppNavigation(event)) {
                        return;
                      }
                      event.preventDefault();
                      const target = operatorWireTarget(item, selectedSymbol);
                      if (onNavigateWorkspaceTarget) {
                        onNavigateWorkspaceTarget(target);
                        return;
                      }
                      onOpenWireItem?.(item);
                    }}
                  >
                    <div className="metric-row compact-row">
                      <strong>{item.headline}</strong>
                      <span>{operatorWireCategoryLabel(item.category)}</span>
                    </div>
                    <small>{item.summary}</small>
                    <div className="metric-row compact-row">
                      <span>{item.symbol ?? "desk-wide"}</span>
                      <span>{item.action_label ?? operatorWireFreshnessLabel(item)}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </article>

          <article className="panel compact-panel terminal-subpanel command-center-history-panel detail-subpanel">
            <div className="panel-header">
              <div>
                <h3>Recent Actions</h3>
                <p className="muted-copy">Verification, export, and maintenance activity in one short tape.</p>
              </div>
            </div>
            {summary.action_history.length === 0 ? (
              <div className="showcase-note showcase-note-inline">
                <p className="showcase-note-body">No recent command-center actions recorded.</p>
              </div>
            ) : (
              <div className="stack wire-list">
                {summary.action_history.slice(0, 8).map((item) => (
                  <div className="news-item wire-row" key={item.action_id}>
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

        <div className="command-center-support">
          <article className="panel compact-panel terminal-subpanel command-center-actions-panel detail-subpanel">
            <div className="panel-header">
              <div>
                <h3>Daily Actions</h3>
                <p className="muted-copy">Fast, normal operations for keeping the local desk current.</p>
              </div>
            </div>
            {renderActionButtons(status.safe_actions)}
          </article>

          <article className="panel compact-panel terminal-subpanel command-center-actions-panel detail-subpanel">
            <div className="panel-header">
              <div>
                <h3>Heavy Actions</h3>
                <p className="muted-copy">Slower maintenance paths that require explicit confirmation.</p>
              </div>
            </div>
            {renderActionButtons(status.heavy_actions)}
          </article>

          <article className="panel compact-panel terminal-subpanel command-center-support-group detail-subpanel">
            <section className="command-center-support-section">
              <div className="panel-header">
                <div>
                  <h3>Commodity Recovery</h3>
                  <p className="muted-copy">Current commodity-truth recovery posture and retry timing.</p>
                </div>
              </div>
              {recovery ? (
                <div className="stack">
                  <RealityStrip commodityTruth={recoveryTruth} recovery={recovery} className="command-reality-strip" />
                  <div className="metric-row compact-row">
                    <span>Attempts</span>
                    <span>{recovery.recovery_attempt_count ?? 0}</span>
                  </div>
                  <div className="metric-row compact-row">
                    <span>Last / Next</span>
                    <span>{formatTimestamp(recovery.recovery_last_attempt_at)} {"->"} {formatTimestamp(recovery.recovery_next_attempt_at)}</span>
                  </div>
                  <small>{recoveryReasonLabel(recovery.recovery_reason)}</small>
                  {recovery.blocking_reason ? <small>Blocking reason: {titleCase(recovery.blocking_reason)}</small> : null}
                </div>
              ) : (
                <div className="showcase-note showcase-note-inline">
                  <p className="showcase-note-body">Recovery telemetry is not published for this runtime yet.</p>
                </div>
              )}
            </section>

            <section className="command-center-support-section">
              <div className="panel-header">
                <div>
                  <h3>Latest Runs</h3>
                  <p className="muted-copy">Latest verification, export, and contract snapshot outcomes.</p>
                </div>
              </div>
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
            </section>
          </article>
        </div>
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
