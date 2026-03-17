import type { ExecutionGateView, HealthView, OperationalBacklogView, RibbonView } from "../types/api";
import { formatTimeIST } from "../lib/time";

interface TopRibbonProps {
  health: HealthView;
  ribbon: RibbonView;
  backlog?: OperationalBacklogView | null;
  executionGate?: ExecutionGateView | null;
}

export function TopRibbon({ health, ribbon, backlog, executionGate }: TopRibbonProps) {
  const nextEvent = ribbon.next_event as { title?: string; impact?: string } | null;
  const backendBadge = health.status === "ok" ? "backend connected" : `backend ${health.status}`;
  const sourceBadge = `mode ${ribbon.market_data_mode}`;
  const provenanceBadge = `source ${ribbon.source_mode}`;
  const pipelineBadge = `pipeline ${ribbon.pipeline_status}`;
  const freshnessBadge = `freshness ${ribbon.freshness_status}`;

  return (
    <header className="top-ribbon" data-testid="top-ribbon">
      <div className="ribbon-block">
        <span className="ribbon-label">Status</span>
        <strong>{formatTimeIST(ribbon.last_refresh)}</strong>
        <div className="inline-tags" data-testid="top-ribbon-status-badges">
          <span className="status-pill active" data-testid="backend-connection-badge">{backendBadge}</span>
          <span className="status-pill" data-testid="source-mode-badge">{sourceBadge}</span>
          <span className="status-pill">{provenanceBadge}</span>
          <span className="status-pill" data-testid="pipeline-status-badge">{pipelineBadge}</span>
          <span className="status-pill" data-testid="freshness-status-badge">{freshnessBadge}</span>
        </div>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Regime</span>
        <strong>{ribbon.macro_regime}</strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Freshness</span>
        <strong>
          {ribbon.data_freshness_minutes}m / {ribbon.freshness_status}
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Risk Budget</span>
        <strong>
          {ribbon.risk_budget_used_pct.toFixed(2)} / {ribbon.risk_budget_total_pct.toFixed(2)}%
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Pipeline</span>
        <strong>
          {ribbon.pipeline_status} / {ribbon.market_data_mode}
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Review Queue</span>
        <strong>
          {backlog?.overdue_count ?? 0} overdue / {backlog?.high_priority_count ?? 0} high
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Gate</span>
        <strong>
          {executionGate?.status ?? "loading"} / {executionGate?.blockers.length ?? 0} blockers
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Next Event</span>
        <strong>{nextEvent?.title ?? "none"}</strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Mode</span>
        <strong>
          {ribbon.source_mode} / {formatTimeIST(ribbon.last_refresh)}
        </strong>
      </div>
    </header>
  );
}
