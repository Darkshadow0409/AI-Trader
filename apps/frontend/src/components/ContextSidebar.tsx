import type { AlertEnvelope, AssetContextView, RibbonView, RiskDetailView } from "../types/api";
import { Panel } from "./Panel";
import { StateBlock } from "./StateBlock";

interface ContextSidebarProps {
  context: AssetContextView;
  ribbon: RibbonView;
  onSelectSymbol: (symbol: string) => void;
  alerts: AlertEnvelope[];
  riskDetail: RiskDetailView | null;
  riskLoading?: boolean;
  riskError?: string | null;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
}

export function ContextSidebar({
  context,
  ribbon,
  onSelectSymbol,
  alerts,
  riskDetail,
  riskLoading,
  riskError,
  onOpenSignal,
  onOpenRisk,
}: ContextSidebarProps) {
  const event = ribbon.next_event as { title?: string; impact?: string; event_time?: string } | null;
  const risk = riskDetail ?? context.latest_risk;
  const detailRisk = riskDetail;

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
        <StateBlock loading={riskLoading} error={riskError} />
        {risk ? (
          <>
            <div className="metric-row">
              <span>Stop {risk.stop_price.toFixed(2)}</span>
              <span>{risk.size_band}</span>
            </div>
            <div className="metric-row">
              <span>Cluster {risk.exposure_cluster}</span>
              <span>Budget {risk.max_portfolio_risk_pct.toFixed(3)}%</span>
            </div>
            {Object.entries(risk.scenario_shocks).map(([name, value]) => (
              <div className="metric-row compact-row" key={name}>
                <span>{name.replace(/_/g, " ")}</span>
                <span>{value.toFixed(2)}%</span>
              </div>
            ))}
            {detailRisk ? (
              <div className="stack">
                {detailRisk.risk_notes.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            ) : null}
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

      <Panel title="Alert Center" eyebrow="In-App">
        <div className="news-stack">
          {alerts.length > 0 ? (
            alerts.slice(0, 8).map((item) => (
              <button
                className="news-item"
                key={item.alert_id}
                onClick={() => {
                  if (item.signal_id) {
                    onOpenSignal(item.signal_id);
                  }
                  if (item.risk_report_id) {
                    onOpenRisk(item.risk_report_id);
                  }
                  if (item.asset_ids[0]) {
                    onSelectSymbol(item.asset_ids[0]);
                  }
                }}
                type="button"
              >
                <strong>
                  [{item.status}/{item.severity}] {item.title}
                </strong>
                <small>{item.channel_targets.join(", ") || "in_app"} / {item.tags.join(" / ")}</small>
                <small>{item.body}</small>
              </button>
            ))
          ) : (
            <p className="muted-copy">No active alerts in fixture mode.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
