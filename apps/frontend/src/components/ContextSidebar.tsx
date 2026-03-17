import type { AlertEnvelope, AssetContextView, RibbonView, RiskDetailView } from "../types/api";
import { formatDateTimeIST } from "../lib/time";
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
  const reality = context.data_reality ?? context.latest_signal?.data_reality ?? context.latest_risk?.data_reality ?? context.research?.data_reality;

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
              {event.impact} / {formatDateTimeIST(event.event_time)}
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

      <Panel title="Data Reality" eyebrow={context.symbol}>
        {reality ? (
          <>
            <div className="metric-row">
              <span>
                {reality.provenance.realism_grade} / {reality.freshness_state}
              </span>
              <span>{reality.provenance.source_type}</span>
            </div>
            <div className="metric-row compact-row">
              <span>{reality.provenance.tradable_symbol}</span>
              <span>score {reality.realism_score.toFixed(1)}</span>
            </div>
            <small>{reality.tradable_alignment_note}</small>
            {reality.ui_warning ? <small>{reality.ui_warning}</small> : null}
          </>
        ) : (
          <p className="muted-copy">No provenance context is available for this asset.</p>
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

      <Panel title="Crowd-Implied Narrative" eyebrow="Polymarket">
        {context.crowd_implied_narrative ? <p className="compact-copy">{context.crowd_implied_narrative}</p> : <p className="muted-copy">No related Polymarket market is currently matched to this asset.</p>}
        <div className="news-stack">
          {(context.related_polymarket_markets ?? []).slice(0, 3).map((item) => (
            <button className="news-item" key={item.market_id} onClick={() => onSelectSymbol(item.related_assets[0] ?? context.symbol)} type="button">
              <strong>{item.question}</strong>
              <small>
                {item.category.replace(/_/g, " ")} / vol {item.volume.toLocaleString()} / liq {item.liquidity.toLocaleString()}
              </small>
              <small>{item.relevance_reason}</small>
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
