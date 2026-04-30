import { formatDateTimeIST } from "../lib/time";
import { aiAnswerSourceLabel, aiProviderLabel, aiRunStageGuidance, aiRunStageLabel, durationLabel, recentRunStageTrailLabel } from "../lib/uiLabels";
import type { RunStageEventView } from "../types/api";

interface RunLifecycleCardProps {
  eyebrow: string;
  runStage: string | null | undefined;
  provider: string | null | undefined;
  model: string | null | undefined;
  answerSource?: string | null;
  elapsedMs: number;
  statusNote?: string | null;
  recoveryNote?: string | null;
  recoveryState?: string | null;
  canRetry?: boolean;
  updatedAt?: string | null;
  connected?: boolean;
  stageHistory?: RunStageEventView[] | null;
  onRefreshStatus?: () => void;
  onResumePolling?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  onStartFresh?: () => void;
  startFreshLabel?: string;
  onPrepareNext?: () => void;
  prepareNextLabel?: string;
}

export function RunLifecycleCard({
  eyebrow,
  runStage,
  provider,
  model,
  answerSource = null,
  elapsedMs,
  statusNote = null,
  recoveryNote = null,
  recoveryState = null,
  canRetry = false,
  updatedAt = null,
  connected = false,
  stageHistory = null,
  onRefreshStatus,
  onResumePolling,
  onRetry,
  retryLabel = "Retry this question",
  onStartFresh,
  startFreshLabel = "Start fresh run",
  onPrepareNext,
  prepareNextLabel = "Prepare next query",
}: RunLifecycleCardProps) {
  const guidance = aiRunStageGuidance(runStage, elapsedMs, statusNote);
  const stageTrail = recentRunStageTrailLabel(stageHistory, 5);
  const answerSourceLabel = answerSource ? aiAnswerSourceLabel(answerSource, provider, connected) : null;
  const recoveryLabel =
    recoveryState === "active"
      ? "Recovery active"
      : recoveryState === "stale_nonterminal"
        ? "Recovery stale"
        : recoveryState === "terminal"
          ? "Recovery terminal"
          : null;

  return (
    <article className="panel compact-panel terminal-console-panel run-lifecycle-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{aiRunStageLabel(runStage)}</h3>
        </div>
        {recoveryLabel ? <span className="tag">{recoveryLabel}</span> : null}
      </div>
      <div className="console-strip analyst-console-strip">
        <div>
          <span className="metric-label">Stage</span>
          <strong>{aiRunStageLabel(runStage)}</strong>
        </div>
        <div>
          <span className="metric-label">Provider</span>
          <strong>{aiProviderLabel(provider)}</strong>
        </div>
        {model ? (
          <div>
            <span className="metric-label">Model</span>
            <strong>{model}</strong>
          </div>
        ) : null}
        {answerSourceLabel ? (
          <div>
            <span className="metric-label">Answer Source</span>
            <strong>{answerSourceLabel}</strong>
          </div>
        ) : null}
        <div>
          <span className="metric-label">Latency</span>
          <strong>{durationLabel(elapsedMs)}</strong>
        </div>
        {updatedAt ? (
          <div>
            <span className="metric-label">Updated</span>
            <strong>{formatDateTimeIST(updatedAt)}</strong>
          </div>
        ) : null}
        {recoveryLabel ? (
          <div>
            <span className="metric-label">Recovery</span>
            <strong>{recoveryLabel}</strong>
          </div>
        ) : null}
        <div>
          <span className="metric-label">Retry</span>
          <strong>{canRetry ? "Retry ready" : "No retry needed"}</strong>
        </div>
      </div>
      <div className="stack analyst-console-notes">
        <small>{guidance.explanation}</small>
        {statusNote && statusNote !== guidance.explanation ? <small>{statusNote}</small> : null}
        <small>{guidance.nextStep}</small>
        {recoveryNote ? <small>{recoveryNote}</small> : null}
      </div>
      {stageTrail ? (
        <div className="run-stage-footer">
          <span className="metric-label">Recent stages</span>
          <small>Recent stages: {stageTrail}</small>
        </div>
      ) : null}
      <div className="metric-row analyst-console-actions">
        {onRefreshStatus ? (
          <button className="text-button" onClick={onRefreshStatus} type="button">
            Refresh status
          </button>
        ) : null}
        {onResumePolling ? (
          <button className="text-button" onClick={onResumePolling} type="button">
            Resume polling
          </button>
        ) : null}
        {onRetry ? (
          <button className="text-button" onClick={onRetry} type="button">
            {retryLabel}
          </button>
        ) : null}
        {onStartFresh ? (
          <button className="text-button" onClick={onStartFresh} type="button">
            {startFreshLabel}
          </button>
        ) : null}
        {onPrepareNext ? (
          <button className="text-button" onClick={onPrepareNext} type="button">
            {prepareNextLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}
