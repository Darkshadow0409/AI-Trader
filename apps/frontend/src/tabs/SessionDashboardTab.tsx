import { useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import { WorkspaceJumpRow } from "../components/WorkspaceJumpRow";
import { operatorFamilyLabel } from "../lib/workflowIdentity";
import {
  reviewTaskAssetTarget,
  reviewTaskPrimaryTarget,
  type WorkspaceRouteState,
  type WorkspaceTarget,
} from "../lib/workspaceNavigation";
import { formatDateTimeIST } from "../lib/time";
import type {
  DailyBriefingView,
  ExecutionGateView,
  OperationalBacklogView,
  ReviewSummaryView,
  ReviewTaskView,
  SessionOverviewView,
  WeeklyReviewView,
} from "../types/api";

interface SessionDashboardTabProps {
  overview: SessionOverviewView;
  reviewTasks: ReviewTaskView[];
  loading?: boolean;
  reviewError?: string | null;
  reviewCount?: number;
  reviewSummary?: ReviewSummaryView | null;
  executionGate?: ExecutionGateView | null;
  reviewQueueState?: "ready" | "loading_expected_rows" | "reconciling" | "load_failed" | "empty";
  reviewQueueNote?: string | null;
  dailyBriefing: DailyBriefingView;
  weeklyReview: WeeklyReviewView;
  backlog: OperationalBacklogView;
  selectedReviewTaskId?: string | null;
  onChanged: () => Promise<void>;
  onNavigateWorkspaceTarget?: (target: WorkspaceTarget) => void;
  workspaceBaseState?: WorkspaceRouteState;
}

function fmtDue(value: string | null): string {
  return formatDateTimeIST(value);
}

function taskIdentityLabel(task: ReviewTaskView): string | null {
  const segments: string[] = [];
  if (task.linked_entity_type && task.linked_entity_id) {
    segments.push(`${task.linked_entity_type.replace(/_/g, " ")}: ${task.linked_entity_id}`);
  }
  if (task.created_at) {
    segments.push(`created ${formatDateTimeIST(task.created_at)}`);
  }
  return segments.length > 0 ? segments.join(" | ") : null;
}

function reviewQueueStatusLabel(state: SessionDashboardTabProps["reviewQueueState"]): string | null {
  switch (state) {
    case "loading_expected_rows":
      return "Queue summary live, detail hydrating";
    case "reconciling":
      return "Queue summary live, detail reconciling";
    case "load_failed":
      return "Load failed, retry available";
    default:
      return null;
  }
}

function isArchivedReviewState(state: string): boolean {
  return ["archived", "dismissed", "resolved", "done"].includes(state);
}

function isGateBlockingTask(task: ReviewTaskView, gateBlockingTaskIds: Set<string> | null): boolean {
  if (gateBlockingTaskIds) {
    return gateBlockingTaskIds.has(task.task_id);
  }
  return task.overdue;
}

function taskRank(task: ReviewTaskView): number {
  const priorityRank = task.priority === "high" ? 0 : task.priority === "medium" ? 1 : 2;
  const overdueRank = task.overdue ? 0 : 1;
  return overdueRank * 10 + priorityRank;
}

function sortReviewTasks(tasks: ReviewTaskView[], mode: "gate" | "oldest" | "overdue"): ReviewTaskView[] {
  const rows = [...tasks];
  rows.sort((left, right) => {
    if (mode === "oldest") {
      return left.created_at.localeCompare(right.created_at) || left.due_at.localeCompare(right.due_at);
    }
    if (mode === "overdue") {
      return Number(right.overdue) - Number(left.overdue) || left.due_at.localeCompare(right.due_at) || taskRank(left) - taskRank(right);
    }
    return taskRank(left) - taskRank(right) || left.due_at.localeCompare(right.due_at) || left.created_at.localeCompare(right.created_at);
  });
  return rows;
}

function blockerCategoryLabel(category: string): string {
  switch (category) {
    case "review":
      return "review";
    case "baseline":
      return "baseline";
    case "data":
      return "data";
    case "performance":
      return "path quality";
    default:
      return category.replace(/_/g, " ");
  }
}

function hoursLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${value}h`;
}

function pctLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(0)}%`;
}

function linkageStateLabel(value: string | null | undefined): string {
  if (!value) {
    return "not yet established";
  }
  return value.replace(/_/g, " ");
}

function qualityStateLabel(value: string | null | undefined): string {
  if (!value) {
    return "not established";
  }
  return value.replace(/_/g, " ");
}

function proofSelectionNote(value: string | null | undefined): string | null {
  if (value === "latest_fully_linked") {
    return "Showing latest fully linked reviewed loop.";
  }
  if (value === "best_available") {
    return "Showing best available reviewed loop while flagship proof is still building.";
  }
  return null;
}

function completedLoopIdentity(summary: ReviewSummaryView | null | undefined): string {
  const proof = summary?.discipline_loop_proof;
  if (!proof || proof.loop_completion_state !== "completed") {
    return "";
  }
  const identity = [
    proof.display_symbol ?? proof.latest_reviewed_trade_symbol ?? "paper loop",
    operatorFamilyLabel(proof.signal_family),
    proof.side ?? "n/a",
    (proof.trade_status ?? "reviewed").replace(/_/g, " "),
  ];
  if (proof.review_status && proof.review_status !== proof.trade_status) {
    identity.push(proof.review_status.replace(/_/g, " "));
  }
  return identity.join(" / ");
}

export function SessionDashboardTab({
  overview,
  reviewTasks,
  loading = false,
  reviewError = null,
  reviewCount = 0,
  reviewSummary = null,
  executionGate = null,
  reviewQueueState = "ready",
  reviewQueueNote = null,
  dailyBriefing,
  weeklyReview,
  backlog,
  selectedReviewTaskId = null,
  onChanged,
  onNavigateWorkspaceTarget,
  workspaceBaseState,
}: SessionDashboardTabProps) {
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueFocus, setQueueFocus] = useState<"gate" | "oldest" | "overdue">("gate");
  const visibleReviewTasks = reviewTasks;
  const rankedBlockers = [...(executionGate?.blocker_details ?? [])].sort((left, right) => left.rank - right.rank || left.code.localeCompare(right.code));
  const gateBlockingTaskIds = reviewSummary?.gate_impact
    ? new Set(reviewSummary.gate_impact.gate_blocking_task_ids)
    : null;
  const activeReviewTasks = visibleReviewTasks.filter((task) => !isArchivedReviewState(task.state));
  const archivedReviewTasks = visibleReviewTasks.filter((task) => isArchivedReviewState(task.state));
  const gateBlockingTasks = sortReviewTasks(
    activeReviewTasks.filter((task) => isGateBlockingTask(task, gateBlockingTaskIds)),
    queueFocus,
  );
  const inProgressTasks = sortReviewTasks(
    activeReviewTasks.filter((task) => task.state === "in_progress" && !isGateBlockingTask(task, gateBlockingTaskIds)),
    queueFocus,
  );
  const importantTasks = sortReviewTasks(
    activeReviewTasks.filter((task) => task.state !== "in_progress" && !isGateBlockingTask(task, gateBlockingTaskIds)),
    queueFocus,
  );
  const historyTasks = sortReviewTasks(archivedReviewTasks, "oldest");
  const reviewQueueStatus = reviewQueueStatusLabel(reviewQueueState);
  const accountabilityMetrics = reviewSummary?.accountability_metrics ?? null;
  const gateImpact = reviewSummary?.gate_impact ?? null;
  const reviewFamilyCounts = reviewSummary?.review_family_counts ?? [];
  const historyBuckets = reviewSummary?.history_buckets ?? [];
  const disciplineProof = reviewSummary?.discipline_loop_proof ?? null;
  const reviewChainAnalytics = reviewSummary?.review_chain_analytics ?? null;
  const queueCounts = reviewSummary?.task_counts ?? {
    rendered_open: activeReviewTasks.filter((task) => task.state === "open" || task.state === "overdue").length,
    overdue: activeReviewTasks.filter((task) => task.overdue).length,
    high_priority: activeReviewTasks.filter((task) => task.priority === "high").length,
    in_progress: activeReviewTasks.filter((task) => task.state === "in_progress").length,
    done: visibleReviewTasks.filter((task) => task.state === "done").length,
    archived: archivedReviewTasks.length,
    resolved_hidden: 0,
  };
  const accountabilityNote = reviewQueueState === "loading_expected_rows"
    ? reviewQueueNote ?? `Queue summary shows ${reviewCount} review item(s). Detailed queue rows are still hydrating.`
    : reviewQueueState === "load_failed"
      ? reviewQueueNote ?? `Summary state shows ${reviewCount} review item(s), but the detailed queue failed to load. ${reviewError ?? ""}`.trim()
      : reviewQueueState === "reconciling"
        ? reviewQueueNote ?? `Queue summary shows ${reviewCount} review item(s), and the detailed queue is still reconciling.`
        : queueCounts.overdue > 0
          ? `${queueCounts.overdue} overdue review item(s) need operator attention before the discipline loop falls behind.`
          : queueCounts.rendered_open > 0
            ? `${queueCounts.rendered_open} review item(s) remain open, but none are overdue right now.`
            : "Review pressure is currently contained. Keep the loop moving as trades close.";
  const gateResolutionNote = rankedBlockers[0]?.next_step
    ?? (executionGate?.status === "execution_candidate"
      ? "Gate is clear enough to keep the paper-trade loop moving."
      : "No structured blocker detail is available yet.");
  const readableLoopIdentity = completedLoopIdentity(reviewSummary);

  async function updateTask(taskId: string, payload: { state?: string; action?: string; snooze_minutes?: number | null }) {
    setBusyTaskId(taskId);
    setError(null);
    try {
      await apiClient.updateReviewTask(taskId, payload);
      await onChanged();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Task update failed");
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="split-stack accountability-grid accountability-console-tab">
      <div className="stack">
        <StateBlock error={error} />
        <article className="panel compact-panel hero-panel terminal-console-panel">
          <span className="eyebrow">Review Loop</span>
          <div className="panel-title-row">
            <div>
              <h2>Accountability Console</h2>
              <p className="muted-copy accountability-kicker">{accountabilityNote}</p>
            </div>
          </div>
          <div className="metric-grid accountability-strip">
            <div>
              <span className="metric-label">Overdue</span>
              <strong>{accountabilityMetrics?.overdue_count ?? queueCounts.overdue}</strong>
            </div>
            <div>
              <span className="metric-label">Oldest overdue</span>
              <strong>{hoursLabel(accountabilityMetrics?.oldest_overdue_hours)}</strong>
            </div>
            <div>
              <span className="metric-label">Gate-blocking</span>
              <strong>{accountabilityMetrics?.gate_blocking_count ?? gateImpact?.gate_blocking_count ?? gateBlockingTasks.length}</strong>
            </div>
            <div>
              <span className="metric-label">In progress</span>
              <strong>{accountabilityMetrics?.in_progress_count ?? queueCounts.in_progress}</strong>
            </div>
            <div>
              <span className="metric-label">Archived</span>
              <strong>{accountabilityMetrics?.archived_count ?? queueCounts.archived}</strong>
            </div>
            <div>
              <span className="metric-label">7d completion</span>
              <strong>{pctLabel(accountabilityMetrics?.completion_rate_7d)}</strong>
            </div>
            <div>
              <span className="metric-label">7d clearance</span>
              <strong>{accountabilityMetrics ? accountabilityMetrics.clearance_velocity_7d.toFixed(1) : "0.0"}</strong>
            </div>
            <div>
              <span className="metric-label">Clearance</span>
              <strong>{accountabilityMetrics?.clearance_status ?? "clear"}</strong>
            </div>
          </div>
        </article>

        <article className="panel compact-panel terminal-console-panel">
          <span className="eyebrow">Gate Resolution</span>
          <h3>What clears next</h3>
          <p className="muted-copy accountability-kicker">{gateResolutionNote}</p>
          <div className="metric-grid accountability-strip">
            <div>
              <span className="metric-label">Gate</span>
              <strong>{executionGate?.status?.replace(/_/g, " ") ?? "loading"}</strong>
            </div>
            <div>
              <span className="metric-label">Ranked blockers</span>
              <strong>{rankedBlockers.length}</strong>
            </div>
            <div>
              <span className="metric-label">Gate-blocking tasks</span>
              <strong>{gateImpact?.gate_blocking_count ?? gateBlockingTasks.length}</strong>
            </div>
            <div>
              <span className="metric-label">Queue focus</span>
              <strong>{queueFocus}</strong>
            </div>
            <div>
              <span className="metric-label">Stale open</span>
              <strong>{accountabilityMetrics?.stale_open_count ?? 0}</strong>
            </div>
          </div>
          {rankedBlockers.length === 0 ? (
            <div className="showcase-note">
              <strong className="showcase-note-title">Gate blocker feed is clear</strong>
              <small className="showcase-note-body">No structured blocker details are published for the gate right now.</small>
            </div>
          ) : (
            <div className="stack wire-list accountability-wire">
              {rankedBlockers.slice(0, 4).map((blocker) => (
                <article className="wire-row review-queue-row" key={blocker.code}>
                  <div className="panel-title-row">
                    <strong>{blocker.code.replace(/_/g, " ")}</strong>
                    <div className="metric-row compact-row">
                      <span className="status-pill">{blocker.severity}</span>
                      <span className="status-pill">{blockerCategoryLabel(blocker.category)}</span>
                      <span className="status-pill">rank {blocker.rank}</span>
                    </div>
                  </div>
                  <div className="stack">
                    <small>{blocker.explanation}</small>
                    <div className="metric-row compact-row">
                      <span>metric {blocker.metric_value.toFixed(2)}</span>
                      <span>threshold {blocker.threshold.toFixed(2)}</span>
                      <span>scope {blocker.scope_count}</span>
                    </div>
                    <small>{blocker.next_step}</small>
                  </div>
                </article>
              ))}
              {gateImpact?.clear_these_first?.length ? (
                <article className="wire-row review-queue-row">
                  <div className="panel-title-row">
                    <strong>Clear these first</strong>
                    <span className="status-pill">{gateImpact.clear_these_first.length}</span>
                  </div>
                  <div className="stack">
                    {gateImpact.clear_these_first.slice(0, 3).map((item) => (
                      <div className="stack" key={item.task_id}>
                        <small>{item.title}</small>
                        <div className="metric-row compact-row">
                          <span>{item.display_symbol ?? "desk-wide"}</span>
                          <span>{item.family.replace(/_/g, " ")}</span>
                          <span>rank {item.rank}</span>
                        </div>
                        <small>{item.next_step}</small>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}
            </div>
          )}
        </article>

        <article className="panel compact-panel terminal-console-panel accountability-secondary-panel">
          <span className="eyebrow">Review Chain</span>
          <h3>Linkage Quality</h3>
          {reviewChainAnalytics ? (
            <div className="stack">
              <div className="metric-grid accountability-strip">
                <div>
                  <span className="metric-label">Closed / due</span>
                  <strong>{reviewChainAnalytics.review_due_closed_trade_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Reviewed trades</span>
                  <strong>{reviewChainAnalytics.reviewed_trade_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Missing ticket</span>
                  <strong>{reviewChainAnalytics.reviewed_without_ticket_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Missing journal</span>
                  <strong>{reviewChainAnalytics.reviewed_without_journal_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Fully linked</span>
                  <strong>{reviewChainAnalytics.fully_linked_completed_loop_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Partially linked</span>
                  <strong>{reviewChainAnalytics.partially_linked_reviewed_loop_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Reopened</span>
                  <strong>{reviewChainAnalytics.reopened_after_review_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Archived w/o completion</span>
                  <strong>{reviewChainAnalytics.archived_without_completion_count}</strong>
                </div>
                <div>
                  <span className="metric-label">Latest linkage</span>
                  <strong>{linkageStateLabel(reviewChainAnalytics.latest_loop_linkage_state)}</strong>
                </div>
                <div>
                  <span className="metric-label">Quality</span>
                  <strong>{qualityStateLabel(reviewChainAnalytics.quality_state)}</strong>
                </div>
              </div>
              <small className="muted-copy">{reviewChainAnalytics.quality_note}</small>
              {reviewChainAnalytics.debt_examples.length > 0 ? (
                <div className="stack wire-list accountability-wire">
                  {reviewChainAnalytics.debt_examples.map((item) => (
                    <article className="wire-row review-queue-row" key={item.trade_id}>
                      <div className="panel-title-row">
                        <strong>{`${item.display_symbol} / ${operatorFamilyLabel(item.family)} / ${item.side} / ${item.trade_status.replace(/_/g, " ")}`}</strong>
                        <div className="metric-row compact-row">
                          {item.missing_ticket ? <span className="status-pill warn">ticket missing</span> : null}
                          {item.missing_journal ? <span className="status-pill warn">journal missing</span> : null}
                        </div>
                      </div>
                      <small>{item.reason}</small>
                      <small>{item.next_step}</small>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="showcase-note">
              <strong className="showcase-note-title">Linkage proof is hydrating</strong>
              <small className="showcase-note-body">Review-chain linkage metrics are still hydrating.</small>
            </div>
          )}
        </article>

        <article className="panel compact-panel terminal-console-panel">
          <span className="eyebrow">Review Backlog</span>
          <div className="panel-title-row">
            <h3>Review Queue</h3>
            <div className="metric-row compact-row">
              <button className={`text-button ${queueFocus === "gate" ? "is-active" : ""}`} onClick={() => setQueueFocus("gate")} type="button">gate-blocking first</button>
              <button className={`text-button ${queueFocus === "oldest" ? "is-active" : ""}`} onClick={() => setQueueFocus("oldest")} type="button">oldest first</button>
              <button className={`text-button ${queueFocus === "overdue" ? "is-active" : ""}`} onClick={() => setQueueFocus("overdue")} type="button">overdue first</button>
            </div>
          </div>
          <div className="metric-grid accountability-strip">
            <div>
              <span className="metric-label">Open</span>
              <strong>{queueCounts.rendered_open}</strong>
            </div>
            <div>
              <span className="metric-label">Overdue</span>
              <strong>{queueCounts.overdue}</strong>
            </div>
            <div>
              <span className="metric-label">High Priority</span>
              <strong>{queueCounts.high_priority}</strong>
            </div>
            <div>
              <span className="metric-label">In Progress</span>
              <strong>{queueCounts.in_progress}</strong>
            </div>
            <div>
              <span className="metric-label">Done</span>
              <strong>{queueCounts.done}</strong>
            </div>
            <div>
              <span className="metric-label">Archived</span>
              <strong>{queueCounts.archived}</strong>
            </div>
            <div>
              <span className="metric-label">Resolved Hidden</span>
              <strong>{queueCounts.resolved_hidden}</strong>
            </div>
          </div>
          {visibleReviewTasks.length === 0 ? (
            <div className="stack">
              {reviewQueueStatus ? <strong>{reviewQueueStatus}</strong> : null}
              <div className="showcase-note">
                <p className="showcase-note-body">
                {reviewQueueState === "loading_expected_rows"
                  ? reviewQueueNote ?? `Queue summary shows ${reviewCount} review item(s). Detailed queue rows are still hydrating.`
                  : reviewQueueState === "load_failed"
                    ? reviewQueueNote ?? `Summary state shows ${reviewCount} review item(s), but the detailed queue failed to load. ${reviewError ?? ""}`.trim()
                    : reviewQueueState === "reconciling"
                      ? reviewQueueNote ?? `Queue summary shows ${reviewCount} review item(s), and the detailed queue is still reconciling.`
                      : "No review tasks generated."}
                </p>
              </div>
              {reviewQueueState !== "empty" ? <button className="text-button" onClick={() => void onChanged()} type="button">Retry review queue</button> : null}
            </div>
          ) : (
            <div className="stack">
              {reviewQueueState !== "ready" || reviewQueueNote ? (
                <div className="stack">
                  {reviewQueueStatus ? <strong>{reviewQueueStatus}</strong> : null}
                  <p className="muted-copy">
                    {reviewQueueNote
                      ?? (reviewQueueState === "load_failed"
                        ? `Detailed queue refresh failed. ${reviewError ?? "Retry to resync the queue."}`.trim()
                        : reviewQueueState === "reconciling"
                          ? "Detailed queue rows are still reconciling against backlog state."
                          : loading
                            ? "Detailed queue rows are refreshing."
                            : null)}
                  </p>
                  {(reviewQueueState === "load_failed" || reviewQueueState === "reconciling" || loading) ? (
                    <button className="text-button" onClick={() => void onChanged()} type="button">Retry review queue</button>
                  ) : null}
                </div>
              ) : null}
              {[
                { title: "Gate Blocking", rows: gateBlockingTasks, history: false },
                { title: "Important", rows: importantTasks, history: false },
                { title: "In Progress", rows: inProgressTasks, history: false },
                { title: "Archived / History", rows: historyTasks, history: true },
              ].map((section) => (
                <div className="stack" key={section.title}>
                  <div className="panel-title-row">
                    <strong>{section.title}</strong>
                    <span className="status-pill">{section.rows.length}</span>
                  </div>
                  {section.rows.length === 0 ? (
                    <div className="showcase-note showcase-note-inline">
                      <small className="showcase-note-body">
                        {section.history
                          ? "No archived review items are visible right now."
                          : section.title === "Gate Blocking" && rankedBlockers.length > 0
                            ? "Gate is currently blocked by baseline or data blockers, not by review tasks."
                            : `No ${section.title.toLowerCase()} items.`}
                      </small>
                    </div>
                  ) : (
                    <div className="stack wire-list accountability-wire">
                      {section.rows.map((task) => (
                        <article className={`wire-row review-queue-row ${selectedReviewTaskId === task.task_id ? "is-selected" : ""}`} key={task.task_id}>
                          <div className="panel-title-row">
                            <strong>{task.title}</strong>
                            <div className="metric-row compact-row">
                              <span className="status-pill">{task.state}</span>
                              <span className="status-pill">{task.priority}</span>
                              <span className="status-pill">{task.session_state}</span>
                              {gateImpact?.gate_blocking_task_ids.includes(task.task_id) ? <span className="status-pill warn">gate-blocking</span> : null}
                            </div>
                          </div>
                          <div className="stack">
                            <div className="muted-copy">{task.summary}</div>
                            {task.display_symbol ? <div className="muted-copy">{task.display_symbol}</div> : null}
                            {taskIdentityLabel(task) ? <div className="muted-copy">{taskIdentityLabel(task)}</div> : null}
                            <div className="metric-row compact-row">
                              <span>Due {fmtDue(task.due_at)}</span>
                              <span>{task.overdue ? "overdue" : "in window"}</span>
                            </div>
                          </div>
                          <div className="metric-row compact-row">
                            <WorkspaceJumpRow
                              actions={[
                                {
                                  key: `review-open-${task.task_id}`,
                                  label: "open",
                                  target: reviewTaskPrimaryTarget(task),
                                },
                                {
                                  key: `review-asset-${task.task_id}`,
                                  label: "asset workspace",
                                  target: reviewTaskAssetTarget(task, undefined, workspaceBaseState?.timeframe),
                                },
                              ]}
                              baseState={workspaceBaseState}
                              onNavigate={onNavigateWorkspaceTarget}
                            />
                            {section.history ? (
                              <>
                                <button className="text-button" disabled={busyTaskId === task.task_id} onClick={() => void updateTask(task.task_id, { state: "open" })} type="button">reopen</button>
                                <button className="text-button" disabled={busyTaskId === task.task_id} onClick={() => void updateTask(task.task_id, { action: "done" })} type="button">mark reviewed</button>
                              </>
                            ) : (
                              <>
                                <button className="text-button" disabled={busyTaskId === task.task_id} onClick={() => void updateTask(task.task_id, { action: "in_progress" })} type="button">in progress</button>
                                <button className="text-button" disabled={busyTaskId === task.task_id} onClick={() => void updateTask(task.task_id, { action: "done" })} type="button">mark reviewed</button>
                                <button className="text-button" disabled={busyTaskId === task.task_id} onClick={() => void updateTask(task.task_id, { action: "snooze", snooze_minutes: 240 })} type="button">snooze 4h</button>
                                <button className="text-button" disabled={busyTaskId === task.task_id} onClick={() => void updateTask(task.task_id, { action: "archive" })} type="button">archive</button>
                              </>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {section.history && historyBuckets.length > 0 ? (
                    <div className="metric-row compact-row">
                      {historyBuckets.map((bucket) => (
                        <span key={bucket.bucket}>{bucket.label}: {bucket.count}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel compact-panel terminal-console-panel">
          <span className="eyebrow">Loop Visibility</span>
          <h3>Signal To Review Loop</h3>
          <p className="muted-copy accountability-kicker">Keep the loop tight: strong signals create trades, trades create review pressure, and overdue review work should become obvious before drift builds up.</p>
          <div className="metric-grid accountability-strip">
            <div>
              <span className="metric-label">Top signals</span>
              <strong>{dailyBriefing.top_ranked_signals.length}</strong>
            </div>
            <div>
              <span className="metric-label">Trade attention</span>
              <strong>{dailyBriefing.open_trades_needing_attention.length}</strong>
            </div>
            <div>
              <span className="metric-label">Review backlog</span>
              <strong>{queueCounts.rendered_open}</strong>
            </div>
            <div>
              <span className="metric-label">Backlog spillover</span>
              <strong>{backlog.items.length}</strong>
            </div>
          </div>
        </article>

        <article className="panel compact-panel terminal-console-panel accountability-secondary-panel">
          <span className="eyebrow">Session States</span>
          <h3>Session States</h3>
          <div className="metric-grid">
            {overview.states.map((state) => (
              <div key={state.state}>
                <span className="metric-label">{state.title}</span>
                <strong>{state.item_count}</strong>
                <small>{state.summary}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel compact-panel terminal-console-panel accountability-secondary-panel">
          <span className="eyebrow">Daily Briefing</span>
          <h3>Daily Briefing</h3>
          <div className="metric-grid">
            <div>
              <span className="metric-label">Top signals</span>
              <strong>{dailyBriefing.top_ranked_signals.length}</strong>
            </div>
            <div>
              <span className="metric-label">High-risk setups</span>
              <strong>{dailyBriefing.high_risk_setups.length}</strong>
            </div>
            <div>
              <span className="metric-label">Trade attention</span>
              <strong>{dailyBriefing.open_trades_needing_attention.length}</strong>
            </div>
            <div>
              <span className="metric-label">Degraded sources</span>
              <strong>{dailyBriefing.degraded_data_sources.length}</strong>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Score</th>
                <th>Confidence</th>
                <th>Freshness</th>
              </tr>
            </thead>
            <tbody>
              {dailyBriefing.top_ranked_signals.map((signal) => (
                <tr key={signal.signal_id}>
                  <td>{signal.display_symbol ?? signal.symbol} {signal.signal_type}</td>
                  <td>{signal.score.toFixed(1)}</td>
                  <td>{signal.confidence.toFixed(2)}</td>
                  <td>{signal.freshness_minutes}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="stack">
        <article className="panel compact-panel terminal-console-panel">
          <span className="eyebrow">Weekly Discipline</span>
          <h3>Weekly Review</h3>
          <div className="metric-grid">
            <div>
              <span className="metric-label">Adherence</span>
              <strong>{(weeklyReview.adherence_trend.adherence_rate * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Review completion</span>
              <strong>{(weeklyReview.adherence_trend.review_completion_rate * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="metric-label">Violation count</span>
              <strong>{weeklyReview.adherence_trend.realism_warning_violation_count}</strong>
            </div>
            <div>
              <span className="metric-label">Invalidation breaches</span>
              <strong>{weeklyReview.adherence_trend.invalidation_breach_count}</strong>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Family</th>
                <th>Trades</th>
                <th>Hit</th>
                <th>Expect.</th>
              </tr>
            </thead>
            <tbody>
              {weeklyReview.signal_family_outcomes.map((row) => (
                <tr key={row.key}>
                  <td>{operatorFamilyLabel(row.key)}</td>
                  <td>{row.trade_count}</td>
                  <td>{(row.hit_rate * 100).toFixed(0)}%</td>
                  <td>{row.expectancy_proxy.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="metric-row compact-row">
            {Object.entries(weeklyReview.paper_trade_outcome_distribution).map(([key, value]) => (
              <span key={key}>{key}: {value}</span>
            ))}
          </div>
        </article>

        <article className="panel compact-panel terminal-console-panel">
          <span className="eyebrow">Discipline Proof</span>
          <h3>Flagship Completed Loop</h3>
          {disciplineProof && disciplineProof.loop_completion_state !== "not_yet_established" ? (
            <div className="stack">
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Last completed</span>
                  <strong>{fmtDue(disciplineProof.latest_completed_loop_at)}</strong>
                </div>
                <div>
                  <span className="metric-label">Reviewed trade</span>
                  <strong>{disciplineProof.latest_reviewed_trade_symbol ?? "n/a"}</strong>
                </div>
                <div>
                  <span className="metric-label">State</span>
                  <strong>{disciplineProof.loop_completion_state.replace(/_/g, " ")}</strong>
                </div>
              </div>
              <small>{readableLoopIdentity || disciplineProof.latest_review_chain_summary}</small>
              {proofSelectionNote(disciplineProof.selection_policy) ? (
                <small>{proofSelectionNote(disciplineProof.selection_policy)}</small>
              ) : null}
              <small>
                {disciplineProof.ticket_id
                  ? `Ticket linked: ${disciplineProof.ticket_id}`
                  : "Ticket linkage pending"}
              </small>
            </div>
          ) : (
            <small className="muted-copy">Completed paper-trade discipline loop not yet established.</small>
          )}
        </article>

        <article className="panel compact-panel terminal-console-panel accountability-secondary-panel">
          <span className="eyebrow">Review Families</span>
          <h3>Pressure by Family</h3>
          {reviewFamilyCounts.length === 0 ? (
            <div className="showcase-note showcase-note-inline">
              <small className="showcase-note-body">No family-level accountability counts published yet.</small>
            </div>
          ) : (
            <div className="stack">
              {reviewFamilyCounts.map((row) => (
                <div className="metric-row compact-row" key={row.family}>
                  <span>{operatorFamilyLabel(row.family)}</span>
                  <span>open {row.count}</span>
                  <span>gate {row.gate_blocking_count}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel compact-panel terminal-console-panel accountability-secondary-panel">
          <span className="eyebrow">Operational Backlog</span>
          <h3>Operational Backlog</h3>
          <div className="metric-grid">
            <div>
              <span className="metric-label">Overdue</span>
              <strong>{backlog.overdue_count}</strong>
            </div>
            <div>
              <span className="metric-label">High Priority</span>
              <strong>{backlog.high_priority_count}</strong>
            </div>
          </div>
          {backlog.items.length === 0 ? (
            <div className="showcase-note">
              <p className="showcase-note-body">
                {backlog.overdue_count > 0 || backlog.high_priority_count > 0
                  ? "Backlog summary shows outstanding work, but item-level rows are not loaded in this panel yet."
                  : "No operational backlog items."}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {backlog.items.map((item) => (
                  <tr key={item.item_id}>
                    <td>{item.category}</td>
                    <td>{item.title}</td>
                    <td>{item.status}</td>
                    <td>{item.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </div>
    </div>
  );
}
