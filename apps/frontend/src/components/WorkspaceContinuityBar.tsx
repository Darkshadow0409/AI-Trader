import type { WorkspaceRouteState, WorkspaceTarget } from "../lib/workspaceNavigation";
import { WorkspaceJumpRow, type WorkspaceJumpAction } from "./WorkspaceJumpRow";

interface WorkspaceContinuityBarProps {
  actions: WorkspaceJumpAction[];
  assetLabel: string;
  baseState: WorkspaceRouteState;
  currentTab: WorkspaceRouteState["tab"];
  reviewLabel?: string | null;
  riskLabel?: string | null;
  signalLabel?: string | null;
  tradeLabel?: string | null;
  underlyingLabel?: string | null;
  onNavigate: (target: WorkspaceTarget) => void;
}

export function WorkspaceContinuityBar({
  actions,
  assetLabel,
  baseState,
  currentTab,
  reviewLabel = null,
  riskLabel = null,
  signalLabel = null,
  tradeLabel = null,
  underlyingLabel = null,
  onNavigate,
}: WorkspaceContinuityBarProps) {
  return (
    <section className="panel compact-panel terminal-console-panel workspace-continuity-bar">
      <div className="workspace-continuity-head">
        <div className="workspace-continuity-thread">
          <span className="eyebrow">Operator Thread</span>
          <strong>{assetLabel}</strong>
          {underlyingLabel ? <small>{underlyingLabel} stays research-only context.</small> : <small>Asset focus stays pinned across surfaces.</small>}
        </div>
        <span className="tag">surface {currentTab}</span>
      </div>
      <div className="workspace-thread-strip">
        <div className="workspace-thread-chip">
          <span className="metric-label">Signal</span>
          <strong>{signalLabel ?? "No signal pinned"}</strong>
        </div>
        <div className="workspace-thread-chip">
          <span className="metric-label">Risk</span>
          <strong>{riskLabel ?? "No risk frame pinned"}</strong>
        </div>
        <div className="workspace-thread-chip">
          <span className="metric-label">Trade</span>
          <strong>{tradeLabel ?? "No trade thread pinned"}</strong>
        </div>
        <div className="workspace-thread-chip">
          <span className="metric-label">Review</span>
          <strong>{reviewLabel ?? "No review item pinned"}</strong>
        </div>
      </div>
      <WorkspaceJumpRow
        actions={actions}
        baseState={baseState}
        className="workspace-continuity-jumps"
        disableCurrentTarget
        onNavigate={onNavigate}
      />
    </section>
  );
}
