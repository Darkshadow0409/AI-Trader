import { formatDateTimeIST } from "../lib/time";
import { aiAnswerSourceLabel, aiProviderLabel, aiRunModeLabel, aiRunStageLabel, durationLabel, recentRunStageTrailLabel, researchConfidenceLabel, researchModeLabel, researchValidationLabel } from "../lib/uiLabels";
import type { ResearchRunView } from "../types/api";

interface ResearchRunPanelProps {
  run: ResearchRunView;
  title?: string;
  statusNote?: string | null;
}

export function ResearchRunPanel({ run, title = "Research Run", statusNote = null }: ResearchRunPanelProps) {
  const stageTrail = recentRunStageTrailLabel(run.stage_history, 5);
  return (
    <article className="panel compact-panel terminal-console-panel research-run-console">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Persistence Console</p>
          <h3>{title}</h3>
        </div>
        <div className="inline-tags">
          <span className="tag">{researchModeLabel(run.mode)}</span>
          {run.run_stage ? <span className="tag">{aiRunStageLabel(run.run_stage)}</span> : null}
          <span className="tag">{aiProviderLabel(run.provider)}</span>
          <span className="tag">{run.selected_model}</span>
          {run.latency_ms !== null && run.latency_ms !== undefined ? <span className="tag">{durationLabel(run.latency_ms)}</span> : null}
        </div>
      </div>
      <div className="console-strip analyst-console-strip">
        <div>
          <span className="metric-label">Provider</span>
          <strong>{aiProviderLabel(run.provider)}</strong>
        </div>
        <div>
          <span className="metric-label">Model</span>
          <strong>{run.selected_model}</strong>
        </div>
        <div>
          <span className="metric-label">Answer source</span>
          <strong>{aiAnswerSourceLabel(run.answer_source, run.provider, run.answer_source === "openai_response")}</strong>
        </div>
        <div>
          <span className="metric-label">Validation</span>
          <strong>{researchValidationLabel(run.validation.validation_status)}</strong>
        </div>
        <div>
          <span className="metric-label">Confidence</span>
          <strong>{researchConfidenceLabel(run.validation.confidence_label)}</strong>
        </div>
        {run.run_mode ? (
          <div>
            <span className="metric-label">Run path</span>
            <strong>{aiRunModeLabel(run.run_mode)}</strong>
          </div>
        ) : null}
      </div>
      <div className="analyst-console-grid analyst-console-grid-tight">
        <article className="signal-companion-section signal-companion-summary">
          <p className="eyebrow">Current Result</p>
          <div className="stack">
            <small>Run created {formatDateTimeIST(run.created_at)}</small>
            {run.started_at ? <small>Started {formatDateTimeIST(run.started_at)}</small> : null}
            {run.completed_at ? <small>Completed {formatDateTimeIST(run.completed_at)}</small> : null}
            {run.run_stage ? <small>Stage: {aiRunStageLabel(run.run_stage)}</small> : null}
            {stageTrail ? <small>Recent stages: {stageTrail}</small> : null}
          </div>
        </article>
        <article className="signal-companion-section">
          <p className="eyebrow">History / Retry Lineage</p>
          <div className="stack">
            {run.retry_of_run_id ? <small>Retry of run {run.retry_of_run_id}.</small> : <small>No retry parent is attached to this run.</small>}
            {run.restart_family_id ? <small>Retry family {run.restart_family_id}.</small> : <small>This run stands on its own restart family.</small>}
            {run.status_note ? <small>{run.status_note}</small> : null}
            {run.validation_summary_note ? <small>{run.validation_summary_note}</small> : null}
            {statusNote ? <small>{statusNote}</small> : null}
          </div>
        </article>
      </div>
      <article className="signal-companion-section signal-companion-summary">
        <p className="eyebrow">Last Good / Persisted Result</p>
        <div className="stack">
          <p className="compact-copy">{run.final_summary}</p>
          {run.final_answer ? <p className="compact-copy">{run.final_answer}</p> : null}
          {run.error_message ? <small>{run.error_message}</small> : null}
        </div>
      </article>
      {run.validation.notes.length > 0 ? (
        <div className="stack analyst-console-notes">
          <p className="eyebrow">Validation Notes</p>
          {run.validation.notes.map((note) => (
            <small key={note}>{note}</small>
          ))}
        </div>
      ) : null}
      <div className="split-stack analyst-console-detail-grid">
        <article className="signal-companion-section">
          <p className="eyebrow">Plan Steps</p>
          <div className="stack">
            {run.plan_steps.map((step) => (
              <small key={step.key}>
                <strong>{step.label}:</strong> {step.summary}
              </small>
            ))}
          </div>
        </article>
        <article className="signal-companion-section">
          <p className="eyebrow">Evidence Used</p>
          <div className="stack">
            {run.evidence_summary.map((item) => (
              <small key={`${item.label}-${item.source_type}`}>
                <strong>{item.label}:</strong> {item.summary}
                {item.truth_note ? ` ${item.truth_note}` : ""}
              </small>
            ))}
          </div>
        </article>
        <article className="signal-companion-section">
          <p className="eyebrow">Operator-Safe Trace</p>
          <div className="stack">
            {run.provenance.map((line) => (
              <small key={line}>{line}</small>
            ))}
          </div>
        </article>
      </div>
    </article>
  );
}
