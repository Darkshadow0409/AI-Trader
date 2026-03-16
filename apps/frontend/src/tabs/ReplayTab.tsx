import type { ReplayView, ScenarioStressSummaryView, TradeTimelineView } from "../types/api";

interface ReplayTabProps {
  replay: ReplayView;
  timeline: TradeTimelineView | null;
  scenarioStress: ScenarioStressSummaryView;
}

function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

export function ReplayTab({ replay, timeline, scenarioStress }: ReplayTabProps) {
  return (
    <div className="split-stack">
      <div className="stack">
        <article className="panel compact-panel">
          <h3>Replay Frames</h3>
          {replay.frames.length === 0 ? (
            <p className="muted-copy">No replay frames available for the current selection.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cursor</th>
                  <th>Bars</th>
                  <th>Signals</th>
                  <th>Risks</th>
                  <th>Alerts</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody>
                {replay.frames.map((frame) => (
                  <tr key={frame.cursor}>
                    <td>{new Date(frame.cursor).toLocaleString()}</td>
                    <td>{frame.bars.length}</td>
                    <td>{frame.signals.length}</td>
                    <td>{frame.risks.length}</td>
                    <td>{frame.alerts.length}</td>
                    <td>{frame.paper_trades.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="panel compact-panel">
          <h3>Scenario Stress</h3>
          <div className="metric-row compact-row">
            <span>signal impacts {scenarioStress.signal_impacts.length}</span>
            <span>trade impacts {scenarioStress.active_trade_impacts.length}</span>
            <span>promoted strategy impacts {scenarioStress.promoted_strategy_impacts.length}</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Scenario</th>
                <th>Shock</th>
                <th>PnL</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {[...scenarioStress.signal_impacts, ...scenarioStress.active_trade_impacts, ...scenarioStress.promoted_strategy_impacts].map((item) => (
                <tr key={`${item.entity_type}-${item.entity_id}-${item.scenario}`}>
                  <td>{item.entity_type}:{item.entity_id}</td>
                  <td>{item.scenario}</td>
                  <td>{compact(item.shock_pct)}%</td>
                  <td>{compact(item.pnl_impact_pct)}%</td>
                  <td>{item.severity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Trade Timeline</h3>
          {timeline ? (
            <div className="stack">
              {[...timeline.pre_event, ...timeline.event_trigger, ...timeline.trade_actions, ...timeline.progression, ...timeline.post_event]
                .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
                .map((event) => (
                  <div className="metric-row compact-row" key={`${event.phase}-${event.event_type}-${event.timestamp}`}>
                    <span>{event.phase}</span>
                    <span>{event.title}</span>
                    <span>{event.price !== null ? compact(event.price) : "n/a"}</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted-copy">Select a paper trade to inspect its event-aware timeline.</p>
          )}
        </article>
      </div>
    </div>
  );
}
