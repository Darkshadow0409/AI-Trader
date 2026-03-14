import type { AssetContextView, RibbonView } from "../types/api";
import { Panel } from "./Panel";

interface ContextSidebarProps {
  context: AssetContextView;
  ribbon: RibbonView;
  onSelectSymbol: (symbol: string) => void;
}

export function ContextSidebar({ context, ribbon, onSelectSymbol }: ContextSidebarProps) {
  const event = ribbon.next_event as { title?: string; impact?: string; event_time?: string } | null;

  return (
    <div className="context-stack">
      <Panel title="Macro Context" eyebrow="Right Pane">
        <div className="metric-row">
          <span>{ribbon.macro_regime}</span>
          <span>{ribbon.pipeline_status}</span>
        </div>
        {event ? (
          <div className="context-event">
            <strong>{event.title}</strong>
            <small>
              {event.impact} / {event.event_time ? new Date(event.event_time).toLocaleString() : "n/a"}
            </small>
          </div>
        ) : (
          <p className="muted-copy">No scheduled macro event is currently in scope.</p>
        )}
      </Panel>

      <Panel title="Risk Context" eyebrow={context.symbol}>
        {context.latest_risk ? (
          <>
            <div className="metric-row">
              <span>Stop {context.latest_risk.stop_price.toFixed(2)}</span>
              <span>{context.latest_risk.size_band}</span>
            </div>
            <div className="metric-row">
              <span>Cluster {context.latest_risk.exposure_cluster}</span>
              <span>Budget {context.latest_risk.max_portfolio_risk_pct.toFixed(3)}%</span>
            </div>
            {Object.entries(context.latest_risk.scenario_shocks).map(([name, value]) => (
              <div className="metric-row compact-row" key={name}>
                <span>{name.replace(/_/g, " ")}</span>
                <span>{value.toFixed(2)}%</span>
              </div>
            ))}
          </>
        ) : (
          <p className="muted-copy">No risk report for the selected asset.</p>
        )}
      </Panel>

      <Panel title="Related News" eyebrow={context.symbol}>
        <div className="news-stack">
          {context.related_news.map((item) => (
            <button className="news-item" key={`${item.source}-${item.title}`} onClick={() => onSelectSymbol(item.affected_assets[0] ?? context.symbol)} type="button">
              <strong>{item.title}</strong>
              <small>{item.entity_tags.join(" / ")}</small>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
