import { instrumentMappingExplainer } from "../lib/assetReadiness";
import type { AssetContextView, MarketChartView, PaperTradeDetailView, RibbonView, SignalDetailView, TradeTicketDetailView } from "../types/api";
import {
  chartStateLabel,
  commodityTruthIsReadyCurrent,
  penaltyCodeLabel,
  plainStatusLabel,
  signalAgeLabel,
  traderFreshnessLabel,
} from "../lib/uiLabels";
import { Panel } from "./Panel";
import { StateBlock } from "./StateBlock";

interface SignalDetailsCardProps {
  context: AssetContextView;
  detail: SignalDetailView | null;
  chart?: MarketChartView | null;
  ribbon: RibbonView;
  loading?: boolean;
  error?: string | null;
  selectedTicket?: TradeTicketDetailView | null;
  selectedTrade?: PaperTradeDetailView | null;
  onRetry?: () => void;
}

function signalErrorLabel(error: string | null | undefined, hasSignal: boolean): string | null {
  if (!error) {
    return null;
  }
  if (error.includes("404") || error.includes("/signals/")) {
    return hasSignal
      ? "Signal context unavailable. Showing the last known signal context while refresh recovers."
      : "Signal context unavailable for this asset.";
  }
  return hasSignal
    ? "Signal context refresh failed. Showing the last known signal context."
    : "Signal context unavailable right now.";
}

function topRelevantMarkets(symbol: string, markets: NonNullable<SignalDetailView["related_polymarket_markets"]>): NonNullable<SignalDetailView["related_polymarket_markets"]> {
  const asset = symbol.toUpperCase();
  const requiredTokens: Record<string, string[]> = {
    BTC: ["btc", "bitcoin", "crypto"],
    ETH: ["eth", "ethereum", "crypto"],
  };
  const tokens = requiredTokens[asset] ?? [];
  return markets
    .filter((item) => item.relevance_score >= 6)
    .filter((item) => {
      if (tokens.length === 0) {
        return true;
      }
      const haystack = `${item.question} ${item.event_title}`.toLowerCase();
      return item.related_assets.map((value) => value.toUpperCase()).includes(asset) || tokens.some((token) => haystack.includes(token));
    })
    .slice(0, 3);
}

export function SignalDetailsCard({
  context,
  detail,
  chart,
  ribbon: _ribbon,
  loading,
  error,
  selectedTicket = null,
  selectedTrade = null,
  onRetry,
}: SignalDetailsCardProps) {
  const signal = detail ?? context.latest_signal;
  const risk = detail?.related_risk ?? context.latest_risk;
  const signalDetail = detail;
  const hasFallbackContext = Boolean(signal || risk || selectedTicket || selectedTrade);
  const hasRouteLevelContext = Boolean(chart || context.symbol || context.data_reality || context.commodity_truth);
  const showBlockingLoad = Boolean(loading) && !hasFallbackContext && !hasRouteLevelContext;
  const reality = chart?.data_reality ?? signalDetail?.data_reality ?? signal?.data_reality ?? context.data_reality;
  const commodityTruth = chart?.commodity_truth ?? context.commodity_truth ?? null;
  const commodityTruthReady = commodityTruthIsReadyCurrent(commodityTruth);
  const friendlyError = signalErrorLabel(error, Boolean(signal));
  const relevantCrowdMarkets = signal && signalDetail?.related_polymarket_markets
    ? topRelevantMarkets(signal.symbol, signalDetail.related_polymarket_markets)
    : [];
  const selectedMarketFreshnessMinutes = chart?.freshness_minutes ?? reality?.freshness_minutes ?? context.data_reality?.freshness_minutes ?? null;
  const selectedMarketFreshnessState = chart?.freshness_state ?? reality?.freshness_state ?? context.data_reality?.freshness_state ?? "unknown";
  const selectedMarketFreshnessLabel = traderFreshnessLabel(
    selectedMarketFreshnessMinutes,
    selectedMarketFreshnessState,
    reality?.execution_grade_allowed,
  );
  const signalAge = signal ? signalAgeLabel(signal.freshness_minutes) : "unknown";
  const chartTruth = chartStateLabel(chart?.status ?? reality?.execution_suitability ?? "unknown");
  const mappingExplainer = instrumentMappingExplainer(chart?.instrument_mapping ?? null);
  const displaySymbol =
    signal?.display_symbol
    ?? chart?.instrument_mapping.trader_symbol
    ?? reality?.provenance.tradable_symbol
    ?? context.symbol;
  const setupStatus = signal ? String(signal.features.setup_status ?? "candidate").replace(/_/g, " ") : "no signal";
  const triggerTimeframe = signal ? String(signal.features.trigger_timeframe ?? "n/a") : "n/a";
  const whyNow = Array.isArray(signal?.features.why_now) && signal.features.why_now.length > 0 ? String(signal.features.why_now[0]) : null;
  const whyNotNow = Array.isArray(signal?.features.why_not_now) && signal.features.why_not_now.length > 0 ? String(signal.features.why_not_now[0]) : null;
  const actionHeadline = !signal
    ? "No live or seeded setup is loaded for the selected asset."
    : !commodityTruthReady
      ? `${displaySymbol} is still on delayed or recovering commodity truth, so the next step stays research-first.`
      : chart && ["stale", "degraded", "unusable", "no_data", "loading"].includes(chart.status)
        ? `${displaySymbol} still has an active setup, but the chart lane is ${chart.status.replace(/_/g, " ")}. Review freshness before promoting the setup.`
        : reality && !reality.execution_grade_allowed
          ? `${displaySymbol} has a live setup, but current timing remains non-execution-grade. Keep it in paper/review workflow.`
          : `${displaySymbol} is the active setup lane. Confirm risk and catalysts, then carry it into tickets or review.`;

  return (
    <Panel
      title={`${displaySymbol} Setup`}
      eyebrow="Action / Risk Companion"
      extra={<span className={signal ? `direction ${signal.direction}` : "muted-copy"}>{signal?.direction ?? "no signal"}</span>}
      className="terminal-subpanel terminal-signal-companion"
    >
      <StateBlock
        actionLabel={friendlyError ? "Retry signal context" : undefined}
        error={friendlyError}
        loading={showBlockingLoad}
        onAction={friendlyError ? onRetry : undefined}
      />
      {Boolean(loading) && hasFallbackContext ? (
        <small className="muted-copy">Refreshing detailed signal context. Showing the last known setup and risk frame in the meantime.</small>
      ) : null}
      {Boolean(loading) && !hasFallbackContext && !showBlockingLoad ? (
        <small className="muted-copy">Signal detail is still syncing. Use the chart lane while setup and risk context catch up.</small>
      ) : null}
      {signal ? (
        <>
          <div className="signal-companion-section signal-companion-summary">
            <p className="compact-copy signal-companion-headline">{actionHeadline}</p>
            <p className="compact-copy">{signal.thesis}</p>
            <div className="inline-tags">
              <span className="tag">score {signal.score.toFixed(1)}</span>
              <span className="tag">confidence {(signal.confidence * 100).toFixed(0)}%</span>
              <span className="tag">noise {(signal.noise_probability * 100).toFixed(0)}%</span>
              <span className="tag">{setupStatus}</span>
              <span className="tag">trigger {triggerTimeframe}</span>
              <span className="tag">signal {signalAge}</span>
            </div>
              <small>
                Chart {chartTruth} / use the chart lane and freshness rail for timing, then use this panel for setup, risk, and catalyst detail.
              </small>
          </div>
          <div className="detail-columns signal-companion-grid">
            <div className="signal-companion-section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Risk Frame</p>
                  <h4>Inval / target / sizing</h4>
                </div>
              </div>
              <div className="metric-strip compact-metrics">
                <div>
                  <span className="metric-label">Invalidation</span>
                  <strong>{signal.invalidation.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="metric-label">Target / Stretch</span>
                  <strong>
                    {signal.targets.base?.toFixed(2)} / {signal.targets.stretch?.toFixed(2)}
                  </strong>
                </div>
                {risk ? (
                  <>
                    <div>
                      <span className="metric-label">Stop</span>
                      <strong>{risk.stop_price.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Risk Budget</span>
                      <strong>{risk.max_portfolio_risk_pct.toFixed(3)}%</strong>
                    </div>
                    <div>
                      <span className="metric-label">Size Band</span>
                      <strong>{plainStatusLabel(risk.size_band)}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Cluster</span>
                      <strong>{plainStatusLabel(risk.exposure_cluster)}</strong>
                    </div>
                  </>
                ) : null}
              </div>
              {risk ? (
                <small>
                  Risk {risk.max_portfolio_risk_pct.toFixed(3)}% / {plainStatusLabel(risk.size_band)} / {plainStatusLabel(risk.exposure_cluster)}
                  {typeof risk.report.leverage_band === "string" ? ` / ${plainStatusLabel(risk.report.leverage_band)}` : ""}
                </small>
              ) : null}
            </div>
            <div className="signal-companion-section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Catalyst Detail</p>
                  <h4>News / evidence / crowd</h4>
                </div>
              </div>
              {signalDetail ? (
                <div className="stack">
                  {signalDetail.evidence.slice(0, 3).map((item) => (
                    <div className="metric-row compact-row wire-row" key={item.label}>
                      <span>
                        {item.label}: {item.value}
                      </span>
                      <span>{item.verdict}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {signalDetail && signalDetail.catalyst_news.length > 0 ? (
                <div className="stack">
                  {signalDetail.catalyst_news.slice(0, 2).map((item) => (
                    <div className="metric-row compact-row wire-row" key={`${item.source}-${item.title}`}>
                      <span>{item.title}</span>
                      <span>{item.freshness_minutes}m</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {signalDetail?.crowd_implied_narrative ? <small>{signalDetail.crowd_implied_narrative}</small> : null}
              {signalDetail && relevantCrowdMarkets.length > 0 ? (
                <div className="stack">
                  {relevantCrowdMarkets.map((item) => (
                    <div className="stack wire-row" key={item.market_id}>
                      <div className="metric-row compact-row">
                        <span>{item.question}</span>
                        <span>{item.outcomes[0] ? `${item.outcomes[0].label} ${(item.outcomes[0].probability * 100).toFixed(0)}%` : item.primary_tag}</span>
                      </div>
                      <small>{item.relevance_reason}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {(selectedTicket || selectedTrade) ? (
              <div className="signal-companion-section">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Trade Carry</p>
                    <h4>Ticket / trade thread</h4>
                  </div>
                </div>
                <div className="metric-strip compact-metrics">
                  <div>
                    <span className="metric-label">Ticket</span>
                    <strong>{selectedTicket ? selectedTicket.status.replace(/_/g, " ") : "none"}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Trade</span>
                    <strong>{selectedTrade ? selectedTrade.status.replace(/_/g, " ") : "none"}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Review</span>
                    <strong>{selectedTrade ? (selectedTrade.review_due ? "due" : "tracked") : "pending"}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Symbol</span>
                    <strong>{displaySymbol}</strong>
                  </div>
                </div>
                {selectedTicket ? (
                  <small>
                    Ticket zone {selectedTicket.proposed_entry_zone.low.toFixed(2)}-{selectedTicket.proposed_entry_zone.high.toFixed(2)} / stop {selectedTicket.planned_stop.toFixed(2)}
                  </small>
                ) : null}
                {selectedTrade ? (
                  <small>
                    Trade stop {selectedTrade.stop.toFixed(2)} / target base {selectedTrade.targets.base.toFixed(2)} / review {selectedTrade.review_due ? "due" : "tracked"}
                  </small>
                ) : null}
                <small>
                  Next operator step: {selectedTrade?.review_due ? "clear review before extending the trade thread." : selectedTicket ? "finish the ticket checklist, then advance or archive the ticket." : "carry the setup into risk, tickets, or observation without losing the review thread."}
                </small>
              </div>
            ) : null}
          </div>
          {reality ? (
            <div className="signal-companion-section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Truth Caveat</p>
                  <h4>Supplemental note</h4>
                </div>
              </div>
              <div className="stack">
                <small>
                  {reality.ui_warning
                    ?? mappingExplainer
                    ?? reality.tradable_alignment_note
                    ?? reality.timing_semantics_note
                    ?? reality.event_context_note
                    ?? `${displaySymbol} still uses ${reality.provenance.research_symbol} as research context while the chart strip carries the current truth lane.`}
                </small>
                {whyNow ? <small>Why now: {whyNow}</small> : null}
                {whyNotNow ? <small>Why not now: {whyNotNow}</small> : null}
              </div>
            </div>
          ) : null}
          {reality && reality.penalties.length > 0 ? (
            <div className="inline-tags">
              {reality.penalties.slice(0, 3).map((penalty) => (
                <span className="tag" key={penalty.code}>
                  {penaltyCodeLabel(penalty.code)}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted-copy">No live or seeded signal is available for this asset.</p>
      )}
    </Panel>
  );
}
