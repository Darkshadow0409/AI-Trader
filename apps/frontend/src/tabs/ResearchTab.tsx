import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";
import { RunLifecycleCard } from "../components/RunLifecycleCard";
import { ResearchRunPanel } from "../components/ResearchRunPanel";
import { StateBlock } from "../components/StateBlock";
import { WorkspaceJumpRow } from "../components/WorkspaceJumpRow";
import { assetWorkspaceTarget, type WorkspaceRouteState, type WorkspaceTarget } from "../lib/workspaceNavigation";
import { formatDateTimeIST } from "../lib/time";
import { aiAnswerSourceLabel, aiProviderLabel, aiProviderStatusLabel, aiRunStageLabel, commodityTruthIsReadyCurrent, commodityTruthStateLabel, commodityTruthSummaryLabel, durationLabel, recentRunStageTrailLabel, researchConfidenceLabel, researchModeLabel, researchValidationLabel, scenarioSourceStatusLabel } from "../lib/uiLabels";
import type { AIProviderStatusView, CommodityTruthStatusView, ResearchRunStatusView, ResearchRunView, ResearchView, ScenarioResearchView } from "../types/api";

const SELECTED_RESEARCH_RUN_STORAGE_KEY = "ai-trader:selected-research-run-id";
const RESEARCH_BASE_POLL_INTERVAL_MS = 700;
const RESEARCH_RUNNING_POLL_INTERVAL_MS = 350;
const RESEARCH_VALIDATING_POLL_INTERVAL_MS = 180;
const RESEARCH_COMPLETION_VISIBILITY_MS = 4500;

function waitForResearchPollCycle(delayMs = RESEARCH_BASE_POLL_INTERVAL_MS) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function researchPollDelayMs(runStage: string | null | undefined): number {
  switch (runStage) {
    case "running_model":
    case "model_inference":
      return RESEARCH_RUNNING_POLL_INTERVAL_MS;
    case "validating_output":
    case "finalizing":
      return RESEARCH_VALIDATING_POLL_INTERVAL_MS;
    default:
      return RESEARCH_BASE_POLL_INTERVAL_MS;
  }
}

function runClockAnchorMs(status: ResearchRunStatusView): number {
  const anchor = status.started_at ?? status.created_at;
  const parsed = Date.parse(anchor);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

interface ResearchTabProps {
  focusedRiskReportId?: string | null;
  focusedSignalId?: string | null;
  onAIModelChange?: (model: string | null) => void;
  onAIProviderChange?: (provider: string) => void;
  rows: ResearchView[];
  runs: ResearchRunView[];
  runsLoading?: boolean;
  runsError?: string | null;
  scenario: ScenarioResearchView | null;
  commodityTruth?: CommodityTruthStatusView | null;
  selectedAIModel?: string | null;
  selectedAIProvider?: string;
  selectedSymbol: string;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
  selectedTradeId: string | null;
  timeframe: string;
  onRefreshRuns: () => Promise<void>;
  onNavigateWorkspaceTarget?: (target: WorkspaceTarget) => void;
  onSelectSymbol: (symbol: string) => void;
  workspaceBaseState?: WorkspaceRouteState;
}

export function ResearchTab({
  focusedRiskReportId = null,
  focusedSignalId = null,
  onAIModelChange = () => {},
  onAIProviderChange = () => {},
  rows,
  runs,
  runsLoading = false,
  runsError = null,
  scenario,
  commodityTruth = null,
  selectedAIModel = null,
  selectedAIProvider = "local",
  selectedSymbol,
  selectedSignalId,
  selectedRiskReportId,
  selectedTradeId,
  timeframe,
  onRefreshRuns,
  onNavigateWorkspaceTarget,
  onSelectSymbol,
  workspaceBaseState,
}: ResearchTabProps) {
  const [providerStatus, setProviderStatus] = useState<AIProviderStatusView | null>(null);
  const hasScenarioCases = Boolean(scenario?.base_case || scenario?.bull_case || scenario?.bear_case);
  const defaultQuery = useMemo(
    () => `Build a grounded research memo for ${selectedSymbol || "the selected commodity board"} with signal, risk, chart truth, catalysts, and crowd context.`,
    [selectedSymbol],
  );
  const [query, setQuery] = useState(defaultQuery);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRun, setLocalRun] = useState<ResearchRunView | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runElapsedMs, setRunElapsedMs] = useState(0);
  const [activeRunStatus, setActiveRunStatus] = useState<ResearchRunStatusView | null>(null);
  const [selectedRunStatus, setSelectedRunStatus] = useState<ResearchRunStatusView | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.sessionStorage.getItem(SELECTED_RESEARCH_RUN_STORAGE_KEY);
  });
  const [recoveredRun, setRecoveredRun] = useState<ResearchRunView | null>(null);
  const [historyStatusNote, setHistoryStatusNote] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const completionTimerRef = useRef<number | null>(null);
  const [recentCompletionRun, setRecentCompletionRun] = useState<ResearchRunView | null>(null);

  useEffect(() => () => {
    mountedRef.current = false;
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    setQuery(defaultQuery);
  }, [defaultQuery]);

  useEffect(() => {
    if (!submitting || runStartedAt === null) {
      setRunElapsedMs(0);
      return;
    }
    setRunElapsedMs(Math.max(Date.now() - runStartedAt, 0));
    const timer = window.setInterval(() => {
      setRunElapsedMs(Math.max(Date.now() - runStartedAt, 0));
    }, 500);
    return () => window.clearInterval(timer);
  }, [runStartedAt, submitting]);

  useEffect(() => {
    let active = true;
    async function loadProviderStatus() {
      try {
        const status = await apiClient.aiStatus(selectedAIProvider, selectedAIModel);
        if (!active || !mountedRef.current) {
          return;
        }
        setProviderStatus(status);
        onAIProviderChange(status.provider);
        if (status.selected_model !== selectedAIModel) {
          onAIModelChange(status.selected_model);
        }
      } catch {
        if (active && mountedRef.current) {
          setProviderStatus(null);
        }
      }
    }
    void loadProviderStatus();
    return () => {
      active = false;
    };
  }, [onAIModelChange, onAIProviderChange, selectedAIModel, selectedAIProvider]);

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].run_id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    try {
      if (selectedRunId) {
        window.sessionStorage.setItem(SELECTED_RESEARCH_RUN_STORAGE_KEY, selectedRunId);
      } else {
        window.sessionStorage.removeItem(SELECTED_RESEARCH_RUN_STORAGE_KEY);
      }
    } catch {
      // Ignore session storage failures in locked-down environments.
    }
  }, [selectedRunId]);

  useEffect(() => {
    const selectedRunAlreadyLoaded = selectedRunId ? runs.some((run) => run.run_id === selectedRunId) : false;
    if (!selectedRunId || selectedRunAlreadyLoaded) {
      setRecoveredRun(null);
      if (!runsLoading) {
        setHistoryStatusNote(runsError ? `Research history is temporarily unavailable. ${runsError}` : null);
      }
      return;
    }

    let active = true;
    setHistoryStatusNote(
      runsLoading
        ? "Research history is still syncing. Restoring the selected run directly."
        : "Recent research history did not include the selected run yet, so the detail panel is restoring it directly.",
    );

    void apiClient.researchRun(selectedRunId)
      .then((run) => {
        if (!active) {
          return;
        }
        setRecoveredRun(run);
        setHistoryStatusNote(
          runsLoading
            ? "Showing the selected research memo while the recent-runs list catches up."
            : runsError
              ? "Showing the selected research memo while the recent-runs list reconnects."
              : "Showing the selected research memo directly while the recent-runs list reconciles.",
        );
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        const message = loadError instanceof Error ? loadError.message : "Selected research run could not be restored.";
        if (message.includes("404")) {
          setSelectedRunId(null);
          setRecoveredRun(null);
          setHistoryStatusNote("The previously selected research run is no longer available, so the selection was cleared.");
          return;
        }
        setRecoveredRun(null);
        setHistoryStatusNote(`The selected research run could not be restored yet. ${message}`);
      });

    return () => {
      active = false;
    };
  }, [runs, runsError, runsLoading, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRunStatus(null);
      return;
    }
    if (activeRunStatus?.run_id === selectedRunId) {
      setSelectedRunStatus(activeRunStatus);
      return;
    }
    let active = true;
    void apiClient.researchRunStatus(selectedRunId)
      .then((status) => {
        if (!active || !mountedRef.current) {
          return;
        }
        setSelectedRunStatus(status);
      })
      .catch(() => {
        if (active && mountedRef.current) {
          setSelectedRunStatus(null);
        }
      });
    return () => {
      active = false;
    };
  }, [activeRunStatus, selectedRunId]);

  const visibleRuns = useMemo(() => {
    const pendingRuns = [localRun, recoveredRun].filter((run): run is ResearchRunView => Boolean(run));
    const nextRuns = [...runs];
    for (const pendingRun of pendingRuns) {
      if (!nextRuns.some((run) => run.run_id === pendingRun.run_id)) {
        nextRuns.unshift(pendingRun);
      }
    }
    return nextRuns;
  }, [localRun, recoveredRun, runs]);

  const selectedRun =
    visibleRuns.find((run) => run.run_id === selectedRunId)
    ?? recoveredRun
    ?? localRun
    ?? visibleRuns[0]
    ?? null;
  const selectedRunStatusDetail =
    activeRunStatus?.run_id === selectedRunId
      ? activeRunStatus
      : selectedRunStatus;
  const selectedRunElapsedMs = selectedRunStatusDetail
    ? selectedRunStatusDetail.latency_ms
      ?? Math.max(Date.now() - runClockAnchorMs(selectedRunStatusDetail), 0)
    : 0;

  async function pollResearchRun(runId: string) {
    for (;;) {
      const status = await apiClient.researchRunStatus(runId);
      if (!mountedRef.current) {
        return;
      }
      setActiveRunStatus(status);
      setSelectedRunStatus(status);
      if (status.run_stage === "complete") {
        const completedRun = status.research_run ?? await apiClient.researchRun(runId);
        if (!mountedRef.current) {
          return;
        }
        setLocalRun(completedRun);
        setSelectedRunId(completedRun.run_id);
        setSelectedRunStatus({ ...status, research_run: completedRun });
        await onRefreshRuns();
        if (!mountedRef.current) {
          return;
        }
        if (completionTimerRef.current !== null) {
          window.clearTimeout(completionTimerRef.current);
        }
        setRecentCompletionRun(completedRun);
        completionTimerRef.current = window.setTimeout(() => {
          setRecentCompletionRun((current) => (current?.run_id === completedRun.run_id ? null : current));
          completionTimerRef.current = null;
        }, RESEARCH_COMPLETION_VISIBILITY_MS);
        setActiveRunStatus(null);
        return;
      }
      if (status.run_stage === "failed") {
        if (!mountedRef.current) {
          return;
        }
        setError(status.error_message ?? status.status_note ?? "Research run failed.");
        return;
      }
      if (status.recovery_state === "stale_nonterminal") {
        if (!mountedRef.current) {
          return;
        }
        setError(null);
        return;
      }
      await waitForResearchPollCycle(researchPollDelayMs(status.run_stage));
      if (!mountedRef.current) {
        return;
      }
    }
  }

  async function beginResearchRun(status: ResearchRunStatusView, anchorMs = Date.now()) {
    setSubmitting(true);
    setError(null);
    setActiveRunStatus(status);
    setSelectedRunStatus(status);
    setSelectedRunId(status.run_id);
    setRunStartedAt(anchorMs);
    try {
      await pollResearchRun(status.run_id);
    } catch (runError) {
      if (mountedRef.current) {
        setError(runError instanceof Error ? runError.message : "Research run failed.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
        setRunStartedAt(null);
      }
    }
  }

  async function refreshActiveResearchRun() {
    if (!activeRunStatus?.run_id) {
      return;
    }
    try {
      const status = await apiClient.researchRunStatus(activeRunStatus.run_id);
      if (!mountedRef.current) {
        return;
      }
      setActiveRunStatus(status);
      setSelectedRunStatus(status);
    } catch (refreshError) {
      if (mountedRef.current) {
        setError(refreshError instanceof Error ? refreshError.message : "Research status refresh failed.");
      }
    }
  }

  async function submitResearchRun() {
    setError(null);
    setActiveRunStatus(null);
    setSelectedRunStatus(null);
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setRecentCompletionRun(null);
    try {
      const run = await apiClient.startResearchRunAsync({
        query,
        symbol: selectedSymbol,
        timeframe,
        provider: selectedAIProvider,
        model: selectedAIModel,
        mode: "research",
        active_tab: "research",
        selected_signal_id: selectedSignalId ?? focusedSignalId,
        selected_risk_report_id: selectedRiskReportId ?? focusedRiskReportId,
        selected_trade_id: selectedTradeId,
      });
      await beginResearchRun(run);
    } catch (runError) {
      if (mountedRef.current) {
        setSubmitting(false);
        setRunStartedAt(null);
        setError(runError instanceof Error ? runError.message : "Research run failed.");
      }
    }
  }

  async function resumeSelectedResearchRun() {
    const status = selectedRunStatus;
    if (!status || ["complete", "failed"].includes(status.run_stage)) {
      return;
    }
    await beginResearchRun(status, runClockAnchorMs(status));
  }

  async function retrySelectedResearchRun() {
    const runId = selectedRunStatus?.run_id ?? selectedRun?.run_id;
    if (!runId) {
      return;
    }
    setError(null);
    const status = await apiClient.retryResearchRun(runId);
    await beginResearchRun(status);
  }

  async function refreshSelectedResearchRunStatus() {
    const runId = selectedRunStatus?.run_id ?? selectedRun?.run_id;
    if (!runId) {
      return;
    }
    try {
      const status = await apiClient.researchRunStatus(runId);
      if (!mountedRef.current) {
        return;
      }
      setSelectedRunStatus(status);
      if (activeRunStatus?.run_id === runId) {
        setActiveRunStatus(status);
      }
    } catch (refreshError) {
      if (mountedRef.current) {
        setError(refreshError instanceof Error ? refreshError.message : "Research status refresh failed.");
      }
    }
  }

  function prepareFreshRun() {
    setQuery(selectedRun?.query ?? defaultQuery);
  }

  const noDeterministicRows = rows.length === 0;
  const noResearchHistory = visibleRuns.length === 0 && !runsLoading && !runsError && !selectedRunId;
  const activeRunStage = activeRunStatus?.run_stage ?? null;
  const activeModel = activeRunStatus?.selected_model ?? providerStatus?.selected_model ?? selectedAIModel ?? "deterministic_brief";
  const activeProvider = activeRunStatus?.provider ?? providerStatus?.provider ?? selectedAIProvider;
  const recentCompletionTrail = recentRunStageTrailLabel(recentCompletionRun?.stage_history, 5);

  return (
    <div className="stack analyst-console-tab">
      {commodityTruth && !commodityTruthIsReadyCurrent(commodityTruth) ? (
        <article className="panel compact-panel terminal-console-panel">
          <div className="state-block">
            <strong>{commodityTruthStateLabel(commodityTruth)}</strong>
            <div>{commodityTruthSummaryLabel(commodityTruth)}</div>
          </div>
          <small>Research stays usable, but commodity conclusions should be framed as delayed/public context or research-only until current-ready truth returns.</small>
        </article>
      ) : null}
      {scenario ? (
        <article className="panel compact-panel terminal-console-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scenario Sidecar</p>
              <h3>Research Snapshot</h3>
            </div>
            <span className="tag">{scenarioSourceStatusLabel(scenario.source_status)}</span>
          </div>
          {hasScenarioCases ? (
            <div className="split-stack">
              {scenario.base_case ? (
                <article className="panel compact-panel">
                  <p className="eyebrow">{scenario.base_case.title}</p>
                  <p className="compact-copy">{scenario.base_case.summary}</p>
                </article>
              ) : null}
              {scenario.bull_case ? (
                <article className="panel compact-panel">
                  <p className="eyebrow">{scenario.bull_case.title}</p>
                  <p className="compact-copy">{scenario.bull_case.summary}</p>
                </article>
              ) : null}
              {scenario.bear_case ? (
                <article className="panel compact-panel">
                  <p className="eyebrow">{scenario.bear_case.title}</p>
                  <p className="compact-copy">{scenario.bear_case.summary}</p>
                </article>
              ) : null}
            </div>
          ) : null}
          <div className="stack">
            {scenario.generated_at ? <small>Generated {formatDateTimeIST(scenario.generated_at)}</small> : null}
            {scenario.availability_note ? <small>{scenario.availability_note}</small> : null}
            {scenario.catalyst_chain.length > 0 ? <small>Catalyst chain: {scenario.catalyst_chain.slice(0, 3).join(" -> ")}</small> : null}
            {scenario.invalidation_triggers.length > 0 ? <small>Invalidation triggers: {scenario.invalidation_triggers.slice(0, 2).join(" / ")}</small> : null}
            {scenario.confidence_notes.length > 0 ? <small>{scenario.confidence_notes[0]}</small> : null}
          </div>
        </article>
      ) : null}

      <article className="panel compact-panel hero-panel terminal-console-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operator Terminal</p>
            <h3>Research Console</h3>
          </div>
          <span className="tag">{selectedSymbol || "board context"}</span>
        </div>
          <div className="stack">
            <div className="console-strip analyst-console-strip">
            <div>
              <span className="metric-label">Provider</span>
              <strong>{aiProviderLabel(providerStatus?.provider ?? selectedAIProvider)}</strong>
              <small>{providerStatus ? aiProviderStatusLabel(providerStatus.status, providerStatus.provider) : "Provider status unavailable"}</small>
            </div>
            <div>
              <span className="metric-label">Model</span>
              <strong>{providerStatus?.selected_model ?? selectedAIModel ?? "deterministic_brief"}</strong>
              <small>{providerStatus ? providerStatus.guidance : "Research console will show provider guidance once provider status loads."}</small>
            </div>
            <div>
              <span className="metric-label">Current default</span>
              <strong>{selectedAIProvider === "local" ? "Local default" : "Provider override"}</strong>
              <small>Retry lineage and research persistence stay visible in this terminal.</small>
              </div>
            </div>
            <WorkspaceJumpRow
              actions={[
                {
                  key: "research-asset",
                  label: "Open selected asset workspace",
                  target: assetWorkspaceTarget({
                    symbol: selectedSymbol,
                    signalId: focusedSignalId ?? selectedSignalId,
                    riskReportId: focusedRiskReportId ?? selectedRiskReportId,
                    tradeId: selectedTradeId,
                    timeframe,
                  }),
                },
              ]}
              baseState={workspaceBaseState}
              onNavigate={onNavigateWorkspaceTarget}
            />
            <small>Run A Grounded Memo keeps one lane for active run, current result, last good completion, and retry lineage.</small>
          <div className="field-grid">
            <label className="field">
              <span>Provider</span>
              <select
                value={selectedAIProvider}
                onChange={(event) => {
                  onAIProviderChange(event.target.value);
                  onAIModelChange(null);
                }}
              >
                {(providerStatus?.available_providers.length ? providerStatus.available_providers : ["local", "ollama", "openai"]).map((provider) => (
                  <option key={provider} value={provider}>
                    {aiProviderLabel(provider)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Model</span>
              <select
                value={providerStatus?.selected_model ?? selectedAIModel ?? "deterministic_brief"}
                onChange={(event) => onAIModelChange(event.target.value)}
              >
                {(providerStatus?.available_models.length ? providerStatus.available_models : [selectedAIModel ?? "deterministic_brief"]).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {providerStatus ? (
            <small>
              {aiProviderLabel(providerStatus.provider)} · {aiProviderStatusLabel(providerStatus.status, providerStatus.provider)} · {providerStatus.guidance}
            </small>
          ) : null}
          <label className="field">
            <span>Research question</span>
            <textarea rows={4} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="metric-row">
            <button className="action-button" disabled={submitting || query.trim().length === 0 || !selectedSymbol} onClick={() => void submitResearchRun()} type="button">
              {submitting ? "Running local research…" : "Start research run"}
            </button>
          </div>
          <div className="stack analyst-console-notes">
            <small>Run monitor</small>
          </div>
          {submitting ? (
            <RunLifecycleCard
              answerSource={activeRunStatus?.answer_source}
              canRetry={activeRunStatus?.can_retry}
              connected={providerStatus?.connected ?? false}
              elapsedMs={runElapsedMs}
              eyebrow="Active Run"
              model={activeModel}
              onStartFresh={prepareFreshRun}
              onPrepareNext={() => setQuery(defaultQuery)}
              onRefreshStatus={() => void refreshActiveResearchRun()}
              prepareNextLabel="Prepare next query"
              provider={activeProvider}
              recoveryNote={activeRunStatus?.recovery_note}
              recoveryState={activeRunStatus?.recovery_state}
              runStage={activeRunStage}
              stageHistory={activeRunStatus?.stage_history ?? null}
              startFreshLabel="Start fresh run"
              statusNote={activeRunStatus?.status_note}
              updatedAt={activeRunStatus?.updated_at}
            />
          ) : null}
          {!submitting && recentCompletionRun ? (
            <article className="panel compact-panel terminal-console-panel hero-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Recent Completion</p>
                  <h3>Latest Good Completion</h3>
                </div>
                <div className="inline-tags">
                  <span className="tag">{aiProviderLabel(recentCompletionRun.provider)}</span>
                  <span className="tag">{recentCompletionRun.selected_model}</span>
                  <span className="tag">{aiAnswerSourceLabel(recentCompletionRun.answer_source, recentCompletionRun.provider, recentCompletionRun.answer_source === "openai_response")}</span>
                  {recentCompletionRun.latency_ms !== null && recentCompletionRun.latency_ms !== undefined ? (
                    <span className="tag">{durationLabel(recentCompletionRun.latency_ms)}</span>
                  ) : null}
                </div>
              </div>
              <div className="stack">
                <small>{recentCompletionRun.validation_summary_note ?? recentCompletionRun.status_note ?? "Validated before display against delayed/public desk truth."}</small>
                {recentCompletionTrail ? <small>Recent stages: {recentCompletionTrail}</small> : null}
              </div>
            </article>
          ) : null}
          {error ? <small>{error}</small> : null}
          <small>Research runs remain advisory-only and never replace deterministic chart, signal, risk, ticket, or paper-trade truth.</small>
        </div>
      </article>

      {noResearchHistory ? (
        <article className="panel compact-panel terminal-console-panel">
          <StateBlock empty emptyLabel="No research runs are stored yet." />
          <small className="compact-copy">Start a research run from the current {selectedSymbol || "selected"} board to build a memo with evidence, validation, and provenance.</small>
        </article>
      ) : visibleRuns.length === 0 ? (
        <article className="panel compact-panel terminal-console-panel">
          <StateBlock
            error={runsError ? `Research history did not load. ${runsError}` : null}
            empty={!runsError}
            emptyLabel={
              runsLoading
                ? "Research history summary is live. Detailed run rows are hydrating."
                : historyStatusNote ?? "Research history needs reconciliation before recent runs can be shown."
            }
          />
          <small className="compact-copy">
            {runsLoading
              ? "Research history summary is live. Detailed run rows are hydrating."
              : historyStatusNote ?? "Research history needs reconciliation before recent runs can be shown."}
          </small>
          <div className="metric-row">
            <button className="text-button" onClick={() => void onRefreshRuns()} type="button">Retry research history</button>
          </div>
        </article>
      ) : (
        <>
          <article className="panel compact-panel terminal-console-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">History / Retry Lineage</p>
                <h3>Research History</h3>
              </div>
              <span className="tag">{visibleRuns.length} stored</span>
            </div>
            {historyStatusNote ? <small>{historyStatusNote}</small> : null}
            <div className="stack wire-list console-history-list">
              {visibleRuns.slice(0, 6).map((run) => (
                <button className="news-item wire-row console-history-row" key={run.run_id} onClick={() => setSelectedRunId(run.run_id)} type="button">
                  <strong>{run.selected_symbol}</strong>
                  <small>{run.run_id}</small>
                  <small>{researchModeLabel(run.mode)} · {aiAnswerSourceLabel(run.answer_source, run.provider, run.answer_source === "openai_response")}</small>
                  {run.run_stage ? <small>{aiRunStageLabel(run.run_stage)}{run.status_note ? ` · ${run.status_note}` : ""}</small> : null}
                  {run.stage_history?.length ? <small>Recent stages: {recentRunStageTrailLabel(run.stage_history, 5)}</small> : null}
                  <small>{researchValidationLabel(run.validation.validation_status)} · {researchConfidenceLabel(run.validation.confidence_label)}</small>
                  <small>{aiProviderLabel(run.provider)} · {run.selected_model}</small>
                  {run.retry_of_run_id ? <small>Retry of {run.retry_of_run_id}</small> : null}
                  <small>
                    {formatDateTimeIST(run.created_at)}
                    {run.latency_ms !== null && run.latency_ms !== undefined ? ` · ${durationLabel(run.latency_ms)}` : ""}
                  </small>
                  <small>{run.final_summary}</small>
                </button>
              ))}
            </div>
          </article>
          {!submitting && selectedRunStatusDetail && (selectedRunStatusDetail.can_retry || selectedRunStatusDetail.run_stage !== "complete") ? (
            <RunLifecycleCard
              answerSource={selectedRunStatusDetail.answer_source}
              canRetry={selectedRunStatusDetail.can_retry}
              connected={providerStatus?.connected ?? false}
              elapsedMs={selectedRunElapsedMs}
              eyebrow="Selected Run Status"
              model={selectedRunStatusDetail.selected_model}
              onRefreshStatus={() => void refreshSelectedResearchRunStatus()}
              onResumePolling={
                selectedRunStatusDetail.recovery_state === "active" && !["complete", "failed"].includes(selectedRunStatusDetail.run_stage)
                  ? () => void resumeSelectedResearchRun()
                  : undefined
              }
              onRetry={selectedRunStatusDetail.can_retry ? () => void retrySelectedResearchRun() : undefined}
              onStartFresh={prepareFreshRun}
              provider={selectedRunStatusDetail.provider}
              recoveryNote={selectedRunStatusDetail.recovery_note}
              recoveryState={selectedRunStatusDetail.recovery_state}
              retryLabel="Retry this question"
              runStage={selectedRunStatusDetail.run_stage}
              stageHistory={selectedRunStatusDetail.stage_history}
              startFreshLabel="Start fresh run"
              statusNote={selectedRunStatusDetail.status_note}
              updatedAt={selectedRunStatusDetail.updated_at}
            />
          ) : null}
          {selectedRun ? <ResearchRunPanel run={selectedRun} statusNote={historyStatusNote} title="Research Memo Detail" /> : null}
        </>
      )}

      {noDeterministicRows ? (
        <article className="panel compact-panel">
          <StateBlock empty emptyLabel="No deterministic research rows are loaded for the current board." />
          <small className="compact-copy">
            {scenario?.availability_note || "Deterministic research rows appear when the backend has a usable structure frame for the current assets."}
          </small>
        </article>
      ) : (
        <>
          <small className="compact-copy">Research keeps the deterministic asset scout surface visible so you can move from structure to memo without losing the commodity board.</small>
          <table className="data-table">
            <thead>
              <tr>
                <th>Trader Asset</th>
                <th>Underlying</th>
                <th>Last</th>
                <th>1D</th>
                <th>5D</th>
                <th>Trend</th>
                <th>Rel Vol</th>
                <th>ATR%</th>
                <th>Breakout%</th>
                <th>Crowd</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className={selectedSymbol === row.symbol ? "row-selected" : ""} key={row.symbol} onClick={() => onSelectSymbol(row.symbol)}>
                  <td>{row.label}</td>
                  <td>{row.symbol}</td>
                  <td>{row.last_price.toFixed(2)}</td>
                  <td>{row.return_1d_pct.toFixed(2)}%</td>
                  <td>{row.return_5d_pct.toFixed(2)}%</td>
                  <td>{row.trend_state}</td>
                  <td>{row.relative_volume.toFixed(2)}</td>
                  <td>{row.atr_pct.toFixed(2)}%</td>
                  <td>{row.breakout_distance.toFixed(2)}%</td>
                  <td>{row.related_polymarket_markets?.[0]?.outcomes?.[0] ? `${row.related_polymarket_markets[0].outcomes[0].label} ${(row.related_polymarket_markets[0].outcomes[0].probability * 100).toFixed(0)}%` : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
