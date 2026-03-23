import { useEffect, useState } from "react";
import type { ExecutionGateView, HealthView, OperationalBacklogView, RibbonView } from "../types/api";
import { formatDateTimeIST, formatTimeIST } from "../lib/time";
import { gateStatusLabel, systemRefreshLabel } from "../lib/uiLabels";

interface TopRibbonProps {
  health: HealthView;
  ribbon: RibbonView;
  backlog?: OperationalBacklogView | null;
  executionGate?: ExecutionGateView | null;
  loading?: boolean;
  error?: string | null;
}

export function TopRibbon({ health, ribbon, backlog, executionGate, loading = false, error = null }: TopRibbonProps) {
  const [now, setNow] = useState(() => new Date().toISOString());
  const nextEvent = ribbon.next_event as { title?: string; impact?: string } | null;
  const backendBadge = health.status === "ok" ? "backend connected" : `backend ${health.status}`;
  const sourceBadge = `data mode ${ribbon.data_mode_label}`;
  const provenanceBadge = `feed source ${ribbon.feed_source_label}`;
  const pipelineBadge = `pipeline ${ribbon.pipeline_status}`;
  const freshnessBadge = `market freshness ${ribbon.freshness_status}`;
  const gateLabel = gateStatusLabel(executionGate?.status);
  const hasHydratedSnapshot = Boolean(
    ribbon.last_refresh
      || ribbon.market_data_as_of
      || (ribbon.source_mode && ribbon.source_mode !== "syncing"),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!hasHydratedSnapshot && loading) {
    return (
      <header className="top-ribbon" data-testid="top-ribbon">
        <div className="ribbon-block ribbon-primary">
          <span className="ribbon-label">Commodities Desk</span>
          <strong>Syncing operator snapshot</strong>
          <small className="compact-copy">
            Pulling the current market-data truth, board state, and system health from the active local backend.
          </small>
        </div>
        <div className="ribbon-block">
          <span className="ribbon-label">Now</span>
          <strong>{formatTimeIST(now)}</strong>
        </div>
      </header>
    );
  }

  if (!hasHydratedSnapshot && error) {
    return (
      <header className="top-ribbon" data-testid="top-ribbon">
        <div className="ribbon-block ribbon-primary">
          <span className="ribbon-label">Commodities Desk</span>
          <strong>Operator snapshot unavailable</strong>
          <small className="compact-copy">
            The shell is reconnecting to the active backend. Last-known workspace context stays usable while it recovers.
          </small>
        </div>
        <div className="ribbon-block">
          <span className="ribbon-label">Now</span>
          <strong>{formatTimeIST(now)}</strong>
        </div>
      </header>
    );
  }

  return (
    <header className="top-ribbon" data-testid="top-ribbon">
      <div className="ribbon-block ribbon-primary">
        <span className="ribbon-label">Commodities Desk</span>
        <strong>{backendBadge}</strong>
        <div className="inline-tags" data-testid="top-ribbon-status-badges">
          <span className="status-pill active" data-testid="backend-connection-badge">{backendBadge}</span>
          <span className="status-pill" data-testid="source-mode-badge">{sourceBadge}</span>
          <span className="status-pill">{provenanceBadge}</span>
          <span className="status-pill" data-testid="pipeline-status-badge">{pipelineBadge}</span>
          <span className="status-pill" data-testid="freshness-status-badge">{freshnessBadge}</span>
        </div>
        <small className="compact-copy">Primary board: USOUSD, XAUUSD, XAGUSD. BTC and ETH remain secondary context inside the same shell.</small>
        <small className="compact-copy">{ribbon.mode_explainer}</small>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Regime</span>
        <strong>{ribbon.macro_regime}</strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Market Freshness</span>
        <strong>
          {ribbon.data_freshness_minutes}m / {ribbon.freshness_status}
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Market As Of</span>
        <strong>{formatDateTimeIST(ribbon.market_data_as_of)}</strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">System Refresh</span>
        <strong>{formatDateTimeIST(ribbon.last_refresh)}</strong>
        <small className="compact-copy">
          {ribbon.system_refresh_minutes === null
            ? "n/a"
            : `${ribbon.system_refresh_minutes}m ago / ${systemRefreshLabel(ribbon.system_refresh_status)}`}
        </small>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Risk Budget</span>
        <strong>
          {ribbon.risk_budget_used_pct.toFixed(2)} / {ribbon.risk_budget_total_pct.toFixed(2)}%
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
          {gateLabel} / {executionGate?.blockers.length ?? 0} blockers
        </strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Next Event</span>
        <strong>{nextEvent?.title ?? "none"}</strong>
      </div>
      <div className="ribbon-block">
        <span className="ribbon-label">Now</span>
        <strong>{formatTimeIST(now)}</strong>
      </div>
    </header>
  );
}
