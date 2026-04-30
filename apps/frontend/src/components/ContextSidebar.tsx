import type { AlertEnvelope, AssetContextView, MarketChartView, RibbonView, RiskDetailView, SelectedAssetTruthView } from "../types/api";
import {
  selectedAssetTruthFallbackLabel,
  selectedAssetTruthFreshnessLabel,
  selectedAssetTruthSourceFamilyLabel,
  selectedAssetTruthStateLabel,
} from "../lib/selectedAssetTruth";
import { formatDateTimeIST } from "../lib/time";
import { alertMetaLabel, plainStatusLabel, sourceTypeLabel, titleCase } from "../lib/uiLabels";
import { Panel } from "./Panel";
import { StateBlock } from "./StateBlock";

interface ContextSidebarProps {
  activeTab?: string;
  context: AssetContextView;
  chart?: MarketChartView | null;
  ribbon: RibbonView;
  onSelectSymbol: (symbol: string) => void;
  alerts: AlertEnvelope[];
  riskDetail: RiskDetailView | null;
  riskLoading?: boolean;
  riskError?: string | null;
  selectedAssetTruth?: SelectedAssetTruthView | null;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
  onRefreshContext?: () => void;
  selectedSignalLoaded?: boolean;
  selectedRiskLoaded?: boolean;
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

type AlertGroupLabel = "critical" | "review required" | "informational";

function alertGroupLabel(item: AlertEnvelope): AlertGroupLabel {
  if (item.status === "failed" || item.severity === "critical") {
    return "critical";
  }
  if (
    item.severity === "warning"
    || item.category.includes("review")
    || item.category.includes("violation")
    || item.category.includes("high_risk")
  ) {
    return "review required";
  }
  return "informational";
}

function alertGroupRank(group: AlertGroupLabel): number {
  switch (group) {
    case "critical":
      return 0;
    case "review required":
      return 1;
    default:
      return 2;
  }
}

export function ContextSidebar({
  activeTab = "desk",
  context,
  chart,
  ribbon,
  onSelectSymbol,
  alerts,
  riskDetail,
  riskLoading,
  riskError,
  selectedAssetTruth = null,
  onOpenSignal,
  onOpenRisk,
  onRefreshContext,
  selectedSignalLoaded = false,
  selectedRiskLoaded = false,
}: ContextSidebarProps) {
  const event = ribbon.next_event as { title?: string; impact?: string; event_time?: string } | null;
  const risk = riskDetail ?? context.latest_risk;
  const detailRisk = riskDetail;
  const hasRiskFallback = Boolean(risk);
  const reality = chart?.data_reality ?? context.data_reality ?? context.latest_signal?.data_reality ?? context.latest_risk?.data_reality ?? context.research?.data_reality;
  const friendlyRiskError = riskErrorLabel(riskError, Boolean(risk));
  const topPolymarketMatches = relevantPolymarketMarkets(context);
  const mapping = reality?.provenance;
  const displaySymbol =
    mapping?.tradable_symbol
    ?? context.latest_signal?.display_symbol
    ?? context.latest_signal?.data_reality?.provenance.tradable_symbol
    ?? context.latest_risk?.display_symbol
    ?? context.latest_risk?.data_reality?.provenance.tradable_symbol
    ?? context.symbol;
  const isOilContext = mapping?.tradable_symbol === "USOUSD" || context.symbol === "WTI";
  const narrativeTabs = new Set(["desk", "watchlist", "signals", "research", "ai_desk"]);
  const macroTabs = new Set(["desk", "watchlist", "signals", "risk"]);
  const focusSurfaceTabs = new Set(["desk", "watchlist", "signals", "risk"]);
  const showMacroContext = macroTabs.has(activeTab);
  const collapseNarrativePanels = focusSurfaceTabs.has(activeTab) && selectedSignalLoaded;
  const collapseRiskPanel = focusSurfaceTabs.has(activeTab) && selectedRiskLoaded;
  const showNarrativePanels = narrativeTabs.has(activeTab) && !collapseNarrativePanels;
  const showRiskPanel = !collapseRiskPanel;
  const showOilGuide = isOilContext && ((showNarrativePanels || showRiskPanel) || activeTab === "risk");
  const showAlertCenter = activeTab !== "trade_tickets";
  const uniqueAlerts = alerts.filter((item, index, rows) => rows.findIndex((candidate) => normalizeAlertKey(candidate) === normalizeAlertKey(item)) === index);
  const actionableAlerts = uniqueAlerts.filter((item) => item.status !== "suppressed");
  const suppressedAlerts = uniqueAlerts.filter((item) => item.status === "suppressed");
  const prioritizedActionableAlerts = [...actionableAlerts].sort((left, right) => {
    const groupDiff = alertGroupRank(alertGroupLabel(left)) - alertGroupRank(alertGroupLabel(right));
    if (groupDiff !== 0) {
      return groupDiff;
    }
    return right.created_at.localeCompare(left.created_at);
  });
  const visibleAlerts = prioritizedActionableAlerts.slice(0, 3);
  const overflowAlerts = prioritizedActionableAlerts.slice(3);
  const relatedNewsEmptyState = reality?.news_suitability === "research_only" || ribbon.market_data_mode === "fixture"
    ? "Current mode has limited news context for this asset."
    : "No related news is loaded for the current asset.";
  const alertEmptyState =
    ribbon.market_data_mode === "fixture"
      ? "No active alerts are queued in fixture mode."
      : "No active alerts are queued for the current runtime.";
  const contextSnapshotNote = context.runtime_snapshot?.using_last_good_snapshot
    ? `Asset context is using the last good snapshot from ${context.runtime_snapshot.age_minutes}m ago while refresh recovers.`
    : null;

  return (
    <div className="context-stack secondary-context-stack showcase-context-sidebar">
      {showMacroContext ? (
        <Panel title="Macro Context" eyebrow="Secondary Context" className="terminal-subpanel secondary-context-panel support-panel">
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
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">No scheduled macro event is currently in scope.</p>
            </div>
          )}
        </Panel>
      ) : null}

      {showNarrativePanels ? (
        <Panel title="Catalyst Feed" eyebrow={displaySymbol} className="terminal-subpanel secondary-context-panel support-panel">
          <div className="news-stack">
            {context.related_news.length > 0 ? context.related_news.map((item) => (
              <button className="news-item wire-row" key={`${item.source}-${item.title}`} onClick={() => onSelectSymbol(item.affected_assets[0] ?? context.symbol)} type="button">
                <strong>{item.title}</strong>
                <small>{item.entity_tags.join(" / ")}</small>
              </button>
            )) : (
              <div className="showcase-note showcase-note-inline">
                <p className="showcase-note-body">{relatedNewsEmptyState}</p>
              </div>
            )}
          </div>
        </Panel>
      ) : null}

      {showNarrativePanels ? (
        <Panel title="Crowd-Implied Narrative" eyebrow="Polymarket" className="terminal-subpanel secondary-context-panel support-panel">
          {context.crowd_implied_narrative ? <p className="compact-copy">{context.crowd_implied_narrative}</p> : (
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">No relevant crowd markets are currently matched to this asset.</p>
            </div>
          )}
          <div className="news-stack">
            {topPolymarketMatches.map((item) => (
              <button className="news-item wire-row" key={item.market_id} onClick={() => onSelectSymbol(item.related_assets[0] ?? context.symbol)} type="button">
                <strong>{item.question}</strong>
                <small>
                  {item.category.replace(/_/g, " ")} / vol {item.volume.toLocaleString()} / liq {item.liquidity.toLocaleString()}
                </small>
                <small>{item.relevance_reason}</small>
              </button>
            ))}
            {topPolymarketMatches.length === 0 ? (
              <div className="showcase-note showcase-note-inline">
                <p className="showcase-note-body">No relevant crowd markets for this asset.</p>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {showAlertCenter ? (
        <Panel title="Priority Alerts" eyebrow="In-App" className="terminal-subpanel secondary-context-panel support-panel">
        <div className="news-stack">
          {uniqueAlerts.length > 0 ? (
            <>
              {visibleAlerts.map((item, index) => {
                const group = alertGroupLabel(item);
                const previousGroup = index > 0 ? alertGroupLabel(visibleAlerts[index - 1]!) : null;
                return (
                <div className="alert-stack-group" key={item.alert_id}>
                  {group !== previousGroup ? <small className="alert-stack-label">{group}</small> : null}
                <button
                  className={`news-item wire-row alert-item actionable-alert alert-item-${group.replace(/\s+/g, "-")}`}
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
                </div>
                );
              })}
              {overflowAlerts.length > 0 ? (
                <details className="alert-overflow">
                  <summary>More alerts ({overflowAlerts.length})</summary>
                  <div className="news-stack">
                    {overflowAlerts.map((item) => (
                      <button
                        className={`news-item wire-row alert-item actionable-alert alert-item-${alertGroupLabel(item).replace(/\s+/g, "-")}`}
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
                        <small>{item.body}</small>
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
              <details className="alert-overflow">
                <summary>Muted repeats ({suppressedAlerts.length})</summary>
                <div className="news-stack">
                  {suppressedAlerts.length > 0 ? suppressedAlerts.slice(0, 2).map((item) => (
                <button
                  className="news-item wire-row alert-item suppressed-alert"
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
                  )) : <small>No muted repeats right now.</small>}
                </div>
              </details>
            </>
          ) : (
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">{alertEmptyState}</p>
            </div>
          )}
        </div>
        </Panel>
      ) : null}

      {showRiskPanel ? (
        <Panel title="Risk Context" eyebrow={displaySymbol} className="terminal-subpanel secondary-context-panel support-panel">
          <StateBlock
            actionLabel={friendlyRiskError ? "Retry risk context" : undefined}
            error={friendlyRiskError}
            loading={Boolean(riskLoading) && !hasRiskFallback}
            onAction={friendlyRiskError ? onRefreshContext : undefined}
          />
          {Boolean(riskLoading) && hasRiskFallback ? (
            <small className="muted-copy">Refreshing detailed risk context. Showing the last known risk frame until the refresh completes.</small>
          ) : null}
          {risk ? (
            <>
              <div className="metric-row">
                <span>Stop {risk.stop_price.toFixed(2)}</span>
                <span>{plainStatusLabel(risk.size_band)}</span>
              </div>
              <div className="metric-row">
                <span>Cluster {plainStatusLabel(risk.exposure_cluster)}</span>
                <span>Budget {risk.max_portfolio_risk_pct.toFixed(3)}%</span>
              </div>
              {Object.entries(risk.scenario_shocks).map(([name, value]) => (
                <div className="metric-row compact-row" key={name}>
                  <span>{titleCase(name)}</span>
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
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">No risk report for the selected asset.</p>
            </div>
          )}
        </Panel>
      ) : null}

      <Panel title="Data Reality" eyebrow={displaySymbol} className="terminal-subpanel secondary-context-panel support-panel">
        {reality ? (
          <>
            <div className="metric-row">
              <span>Reality {reality.provenance.realism_grade}</span>
              <span>{sourceTypeLabel(reality.provenance.source_type)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>{selectedAssetTruthStateLabel(selectedAssetTruth)}</span>
              <span>{selectedAssetTruthSourceFamilyLabel(selectedAssetTruth)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>{reality.provenance.tradable_symbol} / {reality.provenance.underlying_asset}</span>
              <span>score {reality.realism_score.toFixed(1)}</span>
            </div>
            <div className="metric-row compact-row">
              <span>{reality.provenance.research_symbol} {"->"} {reality.provenance.tradable_symbol}</span>
              <span>{selectedAssetTruthFallbackLabel(selectedAssetTruth)}</span>
            </div>
            <small>{selectedAssetTruthFreshnessLabel(selectedAssetTruth)}</small>
            <small>Freshness and recovery stay on the selected-asset rail above the chart. This panel keeps alignment and provenance detail only.</small>
            {contextSnapshotNote ? <small>{contextSnapshotNote}</small> : null}
            <small>{reality.tradable_alignment_note}</small>
            {reality.ui_warning ? <small>{reality.ui_warning}</small> : null}
          </>
        ) : (
          <div className="showcase-note showcase-note-inline">
            <p className="showcase-note-body">No provenance context is available for this asset.</p>
          </div>
        )}
      </Panel>

      {showOilGuide ? (
        <Panel title="Oil Research Guide" eyebrow="USOUSD" className="terminal-subpanel secondary-context-panel support-panel">
          <div className="stack">
            <small>Use the chart for price structure, then pair it with EIA/macro news, risk context, and crowd narrative before drafting a ticket.</small>
            <small>USOUSD is the trader-facing oil symbol here. Underlying research may still use WTI or USO proxy context, and the app will label that directly.</small>
            <small>If intraday oil data is unavailable in the current mode, treat the chart as swing/event-driven research only.</small>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
