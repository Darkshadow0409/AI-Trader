import { useEffect, useState } from "react";
import type { ExecutionGateView, HealthView, OperationalBacklogView, RibbonView, SelectedAssetTruthView } from "../types/api";
import {
  selectedAssetTruthFallbackLabel,
  selectedAssetTruthFreshnessLabel,
  selectedAssetTruthSourceFamilyLabel,
  selectedAssetTruthStateLabel,
} from "../lib/selectedAssetTruth";
import { formatDateTimeIST, formatTimeIST } from "../lib/time";
import { commodityTruthStateLabel, gateStatusLabel, marketFreshnessLabel, systemRefreshLabel } from "../lib/uiLabels";

interface TopRibbonProps {
  health: HealthView;
  ribbon: RibbonView;
  backlog?: OperationalBacklogView | null;
  executionGate?: ExecutionGateView | null;
  loading?: boolean;
  error?: string | null;
  shellBootstrapPending?: boolean;
  selectedAssetTruth?: SelectedAssetTruthView | null;
}

function reviewPressureLabel(backlog: OperationalBacklogView | null | undefined): string {
  const overdue = backlog?.overdue_count ?? 0;
  const high = backlog?.high_priority_count ?? 0;
  if (overdue > 0) {
    return `${overdue} overdue`;
  }
  if (high > 0) {
    return `${high} high`;
  }
  return "contained";
}

export function TopRibbon({
  health,
  ribbon,
  backlog,
  executionGate,
  loading = false,
  error = null,
  shellBootstrapPending,
  selectedAssetTruth = null,
}: TopRibbonProps) {
  const [now, setNow] = useState(() => new Date().toISOString());
  const commodityTruth = ribbon.commodity_truth ?? health.commodity_truth ?? null;
  const gateLabel = gateStatusLabel(executionGate?.status);
  const reviewPressure = reviewPressureLabel(backlog);
  const backendBadge = health.status === "ok" ? "backend connected" : `backend ${health.status}`;
  const nextPriority =
    executionGate?.status === "review_required"
      ? "Review queue is the first stop before any trade progression."
      : backlog && backlog.overdue_count > 0
        ? "Backlog pressure is elevated. Clear overdue review work before expanding workflow."
        : `${ribbon.macro_regime} is the current desk posture.`;
  const hasHydratedSnapshot = Boolean(
    ribbon.last_refresh
      || ribbon.market_data_as_of
      || (ribbon.source_mode && ribbon.source_mode !== "syncing"),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const showBootstrapShell = shellBootstrapPending ?? (!hasHydratedSnapshot && loading);

  if (showBootstrapShell) {
    return (
      <header className="top-ribbon showcase-top-ribbon top-ribbon-bootstrap" data-testid="top-ribbon" data-shell-bootstrap="true">
        <div className="ribbon-block ribbon-primary top-ribbon-shell ribbon-shell-primary ribbon-shell-boot">
          <div className="top-ribbon-title-row">
            <div>
              <span className="ribbon-label">Workspace Status</span>
              <strong>Syncing workspace snapshot</strong>
            </div>
            <span className="status-pill">initializing</span>
          </div>
          <div className="top-ribbon-priority top-ribbon-priority-note">Pulling desk truth, backlog pressure, and route-ready runtime posture.</div>
        </div>
        <div className="ribbon-block top-ribbon-cell ribbon-shell-support">
          <span className="ribbon-label">Now</span>
          <strong>{formatTimeIST(now)}</strong>
        </div>
      </header>
    );
  }

  if (!hasHydratedSnapshot && error) {
    return (
      <header className="top-ribbon showcase-top-ribbon top-ribbon-bootstrap" data-testid="top-ribbon" data-shell-bootstrap="true">
        <div className="ribbon-block ribbon-primary top-ribbon-shell ribbon-shell-primary ribbon-shell-boot">
          <div className="top-ribbon-title-row">
            <div>
              <span className="ribbon-label">Workspace Status</span>
              <strong>Workspace snapshot unavailable</strong>
            </div>
            <span className="status-pill warning">reconnecting</span>
          </div>
          <div className="top-ribbon-priority top-ribbon-priority-note">Last-known shell context stays usable while the local backend reconnects.</div>
        </div>
        <div className="ribbon-block top-ribbon-cell ribbon-shell-support">
          <span className="ribbon-label">Now</span>
          <strong>{formatTimeIST(now)}</strong>
        </div>
      </header>
    );
  }

  return (
    <header className="top-ribbon showcase-top-ribbon" data-testid="top-ribbon" data-shell-bootstrap="false">
      <div className="ribbon-block ribbon-primary top-ribbon-shell ribbon-shell-primary">
        <div className="top-ribbon-title-row">
          <div>
            <span className="ribbon-label">Workspace Status</span>
            <strong>Trader Operations Desk</strong>
          </div>
          <span className="status-pill active" data-testid="backend-connection-badge">{backendBadge}</span>
        </div>
        <div className="inline-tags top-ribbon-badge-row" data-testid="top-ribbon-status-badges">
          <span className="status-pill" data-testid="commodity-truth-badge">{commodityTruthStateLabel(commodityTruth)}</span>
          <span className="status-pill" data-testid="source-mode-badge">{selectedAssetTruthSourceFamilyLabel(selectedAssetTruth)}</span>
          <span className="status-pill">{selectedAssetTruthFallbackLabel(selectedAssetTruth)}</span>
        </div>
        <div className="top-ribbon-priority top-ribbon-priority-note">{nextPriority}</div>
      </div>

      <div className="ribbon-block top-ribbon-cell ribbon-shell-support">
        <span className="ribbon-label">Market Data</span>
        <strong data-testid="freshness-status-badge">{selectedAssetTruthStateLabel(selectedAssetTruth)}</strong>
        <small>{selectedAssetTruthFreshnessLabel(selectedAssetTruth)}</small>
      </div>

      <div className="ribbon-block top-ribbon-cell ribbon-shell-support">
        <span className="ribbon-label">Last Update</span>
        <strong>{formatDateTimeIST(selectedAssetTruth?.as_of ?? ribbon.market_data_as_of)}</strong>
        <small>{marketFreshnessLabel(ribbon.data_freshness_minutes, ribbon.freshness_status)}</small>
      </div>

      <div className="ribbon-block top-ribbon-cell ribbon-shell-support">
        <span className="ribbon-label">Review Status</span>
        <strong>{gateLabel}</strong>
        <small>{reviewPressure}</small>
      </div>

      <div className="ribbon-block top-ribbon-cell ribbon-shell-support">
        <span className="ribbon-label">System Refresh</span>
        <strong>{ribbon.system_refresh_minutes === null ? "n/a" : `${ribbon.system_refresh_minutes}m ago`}</strong>
        <small>{systemRefreshLabel(ribbon.system_refresh_status)}</small>
      </div>

      <div className="ribbon-block top-ribbon-cell ribbon-shell-support">
        <span className="ribbon-label">Now</span>
        <strong>{formatTimeIST(now)}</strong>
        <small>{ribbon.pipeline_status}</small>
      </div>
    </header>
  );
}
