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
  onRefreshContext?: () => void;
}

function riskErrorLabel(error: string | null | undefined, hasRisk: boolean): string | null {
  if (!error) {
    return null;
  }
  if (error.includes("404") || error.includes("/risk/")) {
    return hasRisk
      ? "Risk context unavailable. Showing the last known risk context while refresh recovers."
      : "Risk context unavailable for this asset.";
  }
  return hasRisk
    ? "Risk context refresh failed. Showing the last known risk context."
    : "Risk context unavailable right now.";
}

function relevantPolymarketMarkets(context: AssetContextView): NonNullable<AssetContextView["related_polymarket_markets"]> {
  const asset = context.symbol.toUpperCase();
  const assetSpecificTags: Record<string, string[]> = {
    BTC: ["btc", "bitcoin", "crypto"],
    ETH: ["eth", "ethereum", "crypto"],
  };
  const required = assetSpecificTags[asset] ?? [];
  const rows = context.related_polymarket_markets ?? [];
  return rows
    .filter((item) => item.relevance_score >= 6)
    .filter((item) => {
      if (required.length === 0) {
        return true;
      }
      const haystack = `${item.question} ${item.event_title}`.toLowerCase();
      return item.related_assets.map((value) => value.toUpperCase()).includes(asset) || required.some((token) => haystack.includes(token));
    })
    .slice(0, 3);
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
  onRefreshContext,
}: ContextSidebarProps) {
  const event = ribbon.next_event as { title?: string; impact?: string; event_time?: string } | null;
  const risk = riskDetail ?? context.latest_risk;
  const detailRisk = riskDetail;
  const reality = context.data_reality ?? context.latest_signal?.data_reality ?? context.latest_risk?.data_reality ?? context.research?.data_reality;
  const friendlyRiskError = riskErrorLabel(riskError, Boolean(risk));
  const topPolymarketMatches = relevantPolymarketMarkets(context);
  const uniqueAlerts = alerts.filter((item, index, rows) => {
    const semanticKey = [
      item.category,
      item.title,
      item.signal_id ?? "",
      item.risk_report_id ?? "",
      item.dedupe_key,
      item.body,
    ].join("|");
    return rows.findIndex((candidate) =>
      [
        candidate.category,
        candidate.title,
        candidate.signal_id ?? "",
        candidate.risk_report_id ?? "",
        candidate.dedupe_key,
        candidate.body,
      ].join("|") === semanticKey) === index;
  });
  const relatedNewsEmptyState = reality?.news_suitability === "research_only" || ribbon.market_data_mode === "fixture"
    ? "Current mode has limited news context for this asset."
    : "No related news is loaded for the current asset.";

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
        <StateBlock actionLabel={friendlyRiskError ? "Retry risk context" : undefined} error={friendlyRiskError} loading={riskLoading} onAction={friendlyRiskError ? onRefreshContext : undefined} />
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
          {context.related_news.length > 0 ? context.related_news.map((item) => (
            <button className="news-item" key={`${item.source}-${item.title}`} onClick={() => onSelectSymbol(item.affected_assets[0] ?? context.symbol)} type="button">
              <strong>{item.title}</strong>
              <small>{item.entity_tags.join(" / ")}</small>
            </button>
          )) : <p className="muted-copy">{relatedNewsEmptyState}</p>}
        </div>
      </Panel>

      <Panel title="Crowd-Implied Narrative" eyebrow="Polymarket">
        {context.crowd_implied_narrative ? <p className="compact-copy">{context.crowd_implied_narrative}</p> : <p className="muted-copy">No relevant crowd markets are currently matched to this asset.</p>}
        <div className="news-stack">
          {topPolymarketMatches.map((item) => (
            <button className="news-item" key={item.market_id} onClick={() => onSelectSymbol(item.related_assets[0] ?? context.symbol)} type="button">
              <strong>{item.question}</strong>
              <small>
                {item.category.replace(/_/g, " ")} / vol {item.volume.toLocaleString()} / liq {item.liquidity.toLocaleString()}
              </small>
              <small>{item.relevance_reason}</small>
            </button>
          ))}
          {topPolymarketMatches.length === 0 ? <p className="muted-copy">No relevant crowd markets for this asset.</p> : null}
        </div>
      </Panel>

      <Panel title="Alert Center" eyebrow="In-App">
        <div className="news-stack">
          {uniqueAlerts.length > 0 ? (
            uniqueAlerts.slice(0, 8).map((item) => (
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
                {item.status === "suppressed" ? (
                  <small>Suppressed in-app duplicate or gated delivery. Reason: {item.suppressed_reason ?? "delivery policy"}.</small>
                ) : (
                  <small>{item.status === "sent" ? "Actionable alert delivered." : "Delivery issue; inspect before acting."}</small>
                )}
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
