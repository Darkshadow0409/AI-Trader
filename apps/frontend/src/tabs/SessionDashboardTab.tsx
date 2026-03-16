import { useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import type {
  DailyBriefingView,
  OperationalBacklogView,
  ReviewTaskView,
  SessionOverviewView,
  WeeklyReviewView,
} from "../types/api";

interface SessionDashboardTabProps {
  overview: SessionOverviewView;
  reviewTasks: ReviewTaskView[];
  dailyBriefing: DailyBriefingView;
  weeklyReview: WeeklyReviewView;
  backlog: OperationalBacklogView;
  onChanged: () => Promise<void>;
}

function fmtDue(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "n/a";
}

export function SessionDashboardTab({
  overview,
  reviewTasks,
  dailyBriefing,
  weeklyReview,
  backlog,
  onChanged,
}: SessionDashboardTabProps) {
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateTask(taskId: string, state: string) {
    setBusyTaskId(taskId);
    setError(null);
    try {
      await apiClient.updateReviewTask(taskId, { state });
      await onChanged();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Task update failed");
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="split-stack">
      <div className="stack">
        <StateBlock error={error} />
        <article className="panel compact-panel">
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

        <article className="panel compact-panel">
          <h3>Review Queue</h3>
          {reviewTasks.length === 0 ? (
            <p className="muted-copy">No review tasks generated.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>State</th>
                  <th>Priority</th>
                  <th>Session</th>
                  <th>Due</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviewTasks.map((task) => (
                  <tr key={task.task_id}>
                    <td>
                      <strong>{task.title}</strong>
                      <div className="muted-copy">{task.summary}</div>
                    </td>
                    <td>{task.state}</td>
                    <td>{task.priority}</td>
                    <td>{task.session_state}</td>
                    <td>{fmtDue(task.due_at)}</td>
                    <td>
                      <div className="metric-row compact-row">
                        <button
                          className="text-button"
                          disabled={busyTaskId === task.task_id}
                          onClick={() => void updateTask(task.task_id, "done")}
                          type="button"
                        >
                          done
                        </button>
                        <button
                          className="text-button"
                          disabled={busyTaskId === task.task_id}
                          onClick={() => void updateTask(task.task_id, "dismissed")}
                          type="button"
                        >
                          dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="panel compact-panel">
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
                  <td>{signal.symbol} {signal.signal_type}</td>
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
        <article className="panel compact-panel">
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
            <p className="muted-copy">No operational backlog items.</p>
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

        <article className="panel compact-panel">
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
                  <td>{row.key}</td>
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
      </div>
    </div>
  );
}
