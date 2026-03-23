import type { AlertEnvelope, AssetContextView, MarketChartView, RibbonView, RiskDetailView } from "../types/api";
import { formatDateTimeIST } from "../lib/time";
import { alertMetaLabel } from "../lib/uiLabels";
import { Panel } from "./Panel";
import { StateBlock } from "./StateBlock";

interface ContextSidebarProps {
  context: AssetContextView;
  chart?: MarketChartView | null;
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

function normalizeAlertKey(item: AlertEnvelope): string {
  const normalizedDedupeKey =
    item.category === "stale_data_warning"
      ? "stale_data_warning"
      : item.dedupe_key.replace(/:\d+(?:\.\d+)?$/, "");
  return [
    item.category,
    item.title,
    item.signal_id ?? "",
    item.risk_report_id ?? "",
    normalizedDedupeKey,
  ].join("|");
}

function suppressedReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "cooldown_window":
      return "A similar alert was already shown recently, so this repeat was muted.";
    case "dedupe_window":
      return "A duplicate alert was already shown, so this repeat was muted.";
    default:
      return "This alert was muted to keep the operator queue focused.";
  }
}

function dataModeLabel(value: string): string {
  return {
    fixture: "Fixture data",
    public_live: "Public live data",
    broker_live: "Broker live data",
  }[value] ?? value.replace(/_/g, " ");
}

function feedSourceLabel(value: string): string {
  return {
    sample: "Sample source family",
    fixture: "Fixture source family",
    live: "Live-capable source family",
  }[value] ?? value.replace(/_/g, " ");
}

export function ContextSidebar({
  context,
  chart,
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
  const reality = chart?.data_reality ?? context.data_reality ?? context.latest_signal?.data_reality ?? context.latest_risk?.data_reality ?? context.research?.data_reality;
  const selectedMarketFreshnessMinutes = chart?.freshness_minutes ?? reality?.freshness_minutes ?? null;
  const selectedMarketFreshnessState = chart?.freshness_state ?? reality?.freshness_state ?? "unknown";
  const chartState = chart?.status ?? "unknown";
  const friendlyRiskError = riskErrorLabel(riskError, Boolean(risk));
  const topPolymarketMatches = relevantPolymarketMarkets(context);
  const mapping = reality?.provenance;
  const isOilContext = mapping?.tradable_symbol === "USOUSD" || context.symbol === "WTI";
  const uniqueAlerts = alerts.filter((item, index, rows) => rows.findIndex((candidate) => normalizeAlertKey(candidate) === normalizeAlertKey(item)) === index);
  const actionableAlerts = uniqueAlerts.filter((item) => item.status !== "suppressed");
  const suppressedAlerts = uniqueAlerts.filter((item) => item.status === "suppressed");
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
              <span>Reality {reality.provenance.realism_grade}</span>
              <span>{reality.provenance.source_type}</span>
            </div>
            <div className="metric-row compact-row">
              <span>
                Selected market freshness {" "}
                {selectedMarketFreshnessMinutes === null ? "unknown" : `${selectedMarketFreshnessMinutes}m / ${selectedMarketFreshnessState}`}
              </span>
              <span>{chart ? dataModeLabel(chart.market_data_mode) : dataModeLabel(ribbon.market_data_mode)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>{reality.provenance.tradable_symbol} / {reality.provenance.underlying_asset}</span>
              <span>score {reality.realism_score.toFixed(1)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>{reality.provenance.research_symbol} {"->"} {reality.provenance.tradable_symbol}</span>
              <span>{chart ? feedSourceLabel(chart.source_mode) : ribbon.feed_source_label}</span>
            </div>
            <div className="metric-row compact-row">
              <span>Chart state {chartState}</span>
              <span>{chart?.status_note ? "chart-linked context" : "context snapshot"}</span>
            </div>
            <small>{reality.tradable_alignment_note}</small>
            {reality.ui_warning ? <small>{reality.ui_warning}</small> : null}
          </>
        ) : (
          <p className="muted-copy">No provenance context is available for this asset.</p>
        )}
      </Panel>

      {isOilContext ? (
        <Panel title="Oil Research Guide" eyebrow="USOUSD">
          <div className="stack">
            <small>Use the chart for price structure, then pair it with EIA/macro news, risk context, and crowd narrative before drafting a ticket.</small>
            <small>USOUSD is the trader-facing oil symbol here. Underlying research may still use WTI or USO proxy context, and the app will label that directly.</small>
            <small>If intraday oil data is unavailable in the current mode, treat the chart as swing/event-driven research only.</small>
          </div>
        </Panel>
      ) : null}

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
            <>
              {actionableAlerts.length > 0 ? <small>Actionable alerts</small> : null}
              {actionableAlerts.slice(0, 6).map((item) => (
                <button
                  className="news-item alert-item actionable-alert"
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
                  <strong>{item.title}</strong>
                  <small>{alertMetaLabel(item)}</small>
                  <small>{item.status === "sent" ? "Ready for review or follow-up." : "Delivery issue; inspect before acting."}</small>
                  <small>{item.body}</small>
                </button>
              ))}
              <small>Noise reduced</small>
              <small>Muted repeats stay visible here so you can audit them without crowding the active queue.</small>
              {suppressedAlerts.slice(0, 2).map((item) => (
                <button
                  className="news-item alert-item suppressed-alert"
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
                  <strong>{item.title}</strong>
                  <small>{alertMetaLabel(item)} · muted repeat</small>
                  <small>{suppressedReasonLabel(item.suppressed_reason)}</small>
                  <small>{item.body}</small>
                </button>
              ))}
              {suppressedAlerts.length === 0 ? <small>No muted repeats right now.</small> : null}
            </>
          ) : (
            <p className="muted-copy">No active alerts in fixture mode.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
