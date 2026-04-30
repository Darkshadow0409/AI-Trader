import { StateBlock } from "../components/StateBlock";
import { deriveAssetReadiness, instrumentMappingExplainer } from "../lib/assetReadiness";
import type { CommodityTruthStatusView, OpportunityHunterView, WatchlistSummaryView } from "../types/api";
import { commodityTruthIsReadyCurrent, commodityTruthStateLabel, commodityTruthSummaryLabel, traderFreshnessLabel, traderFreshnessStateLabel } from "../lib/uiLabels";

interface WatchlistTabProps {
  rows: WatchlistSummaryView[];
  opportunities: OpportunityHunterView;
  opportunitiesError?: string | null;
  opportunitiesLoading?: boolean;
  commodityTruth?: CommodityTruthStatusView | null;
  selectedSymbol: string;
  summaryError?: string | null;
  onSelectSymbol: (symbol: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
}

function boardTruthLine(item: WatchlistSummaryView): string {
  if (item.commodity_truth && !commodityTruthIsReadyCurrent(item.commodity_truth)) {
    return item.commodity_truth.truth_label;
  }
  if (!item.instrument_mapping.broker_truth) {
    return `Reality ${item.realism_grade} / proxy via ${item.instrument_mapping.broker_symbol}`;
  }
  return `Reality ${item.realism_grade} / ${item.top_setup_tag.replace(/_/g, " ")}`;
}

function boardPriceLine(item: WatchlistSummaryView): string {
  if (item.commodity_truth?.truth_state === "warming_up") {
    return "Warming up / current-ready price hidden";
  }
  if (item.commodity_truth?.truth_state === "unavailable") {
    return "Research only / current-ready price hidden";
  }
  if (item.commodity_truth?.truth_state === "ready_last_verified") {
    return `Last verified ${item.last_price.toFixed(2)} / ${item.change_pct >= 0 ? "+" : ""}${item.change_pct.toFixed(2)}%`;
  }
  if (item.freshness_state === "unusable" || item.last_price === 0) {
    return "No live price in current mode";
  }
  return `${item.last_price.toFixed(2)} / ${item.change_pct >= 0 ? "+" : ""}${item.change_pct.toFixed(2)}%`;
}

function queueBySymbol(opportunities: OpportunityHunterView): Map<string, OpportunityHunterView["focus_queue"][number]> {
  const map = new Map<string, OpportunityHunterView["focus_queue"][number]>();
  [...opportunities.focus_queue, ...opportunities.scout_queue].forEach((item) => {
    map.set(item.symbol, item);
  });
  return map;
}

function QueueTable({
  error = null,
  loading = false,
  title,
  items,
  selectedSymbol,
  onOpenRisk,
  onOpenSignal,
  onSelectSymbol,
}: {
  error?: string | null;
  loading?: boolean;
  title: string;
  items: OpportunityHunterView["focus_queue"];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
}) {
  return (
    <article className="panel compact-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Queue</p>
          <h3>{title}</h3>
        </div>
        <span className="tag">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Readiness</th>
              <th>Queue</th>
              <th>Why this matters</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const readiness = deriveAssetReadiness({ opportunity: item, commodityTruth: null });
              return (
                <tr
                  className={selectedSymbol === item.symbol ? "row-selected" : ""}
                  key={`${title}-${item.symbol}`}
                  onClick={() => {
                    onSelectSymbol(item.symbol);
                    if (item.signal_id) {
                      onOpenSignal(item.signal_id);
                    }
                    if (item.risk_report_id) {
                      onOpenRisk(item.risk_report_id);
                    }
                  }}
                >
                  <td>
                    <strong>{item.display_symbol ?? item.data_reality?.provenance.tradable_symbol ?? item.symbol}</strong>
                    <div className="compact-copy">
                      score {item.score.toFixed(1)} / gate {(item.gate_score ?? item.score).toFixed(1)}
                    </div>
                  </td>
                  <td>
                    <strong>{readiness.badgeLabel}</strong>
                    <div className="compact-copy">
                      {item.data_reality ? `Reality ${item.data_reality.provenance.realism_grade} / ${traderFreshnessStateLabel(item.data_reality.freshness_state, item.data_reality.execution_grade_allowed)}` : "unknown"}
                    </div>
                  </td>
                  <td>{item.queue}</td>
                  <td>{item.risk_notes[0] ?? item.promotion_reasons[0] ?? readiness.summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : loading ? (
        <div className="queue-secondary-note">
          <small className="compact-copy">Queue is still syncing in the background.</small>
        </div>
      ) : error ? (
        <div className="queue-secondary-note">
          <small className="compact-copy">Queue refresh is unavailable right now. The board remains usable.</small>
        </div>
      ) : (
        <StateBlock empty emptyLabel={`No ${title.toLowerCase()} items.`} />
      )}
    </article>
  );
}

export function WatchlistTab({
  rows,
  opportunities,
  opportunitiesError = null,
  opportunitiesLoading = false,
  commodityTruth = null,
  selectedSymbol,
  summaryError = null,
  onSelectSymbol,
  onOpenSignal,
  onOpenRisk,
}: WatchlistTabProps) {
  const opportunityBySymbol = queueBySymbol(opportunities);
  return (
    <div className="stack">
      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operator Board</p>
            <h3>Primary Commodity Board</h3>
          </div>
          <span className="tag">{rows.length}</span>
        </div>
        <small className="compact-copy">
          This is the main board. Use it to load the chart first, then move into signal, risk, ticket, and paper-trade workflow from the same selected commodity.
        </small>
        {commodityTruth && !commodityTruthIsReadyCurrent(commodityTruth) ? (
          <div className="state-block">
            <strong>{commodityTruthStateLabel(commodityTruth)}</strong>
            <div>{commodityTruthSummaryLabel(commodityTruth)}</div>
          </div>
        ) : null}
        {summaryError && rows.length === 0 ? (
          <StateBlock error="Watchlist board is unavailable right now." />
        ) : rows.length === 0 ? (
          <StateBlock empty emptyLabel="No trader-facing assets are on the board right now." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Readiness</th>
                <th>Market</th>
                <th>Truth Context</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const readiness = deriveAssetReadiness({
                  watchlistRow: item,
                  opportunity: opportunityBySymbol.get(item.symbol) ?? null,
                  commodityTruth: item.commodity_truth ?? commodityTruth,
                });
                const mappingExplainer = instrumentMappingExplainer(item.instrument_mapping);

                return (
                  <tr
                    className={selectedSymbol === item.symbol ? "row-selected" : ""}
                    key={item.symbol}
                    onClick={() => onSelectSymbol(item.symbol)}
                  >
                    <td>
                      <strong>{item.instrument_mapping.trader_symbol}</strong>
                      <div className="compact-copy">{item.instrument_mapping.display_name}</div>
                      {mappingExplainer ? <div className="compact-copy">{mappingExplainer}</div> : null}
                    </td>
                    <td>
                      <strong>{readiness.badgeLabel}</strong>
                      <div className="compact-copy">{readiness.summary}</div>
                      <div className="compact-copy">{readiness.nextStep}</div>
                    </td>
                    <td>
                      <div>{boardPriceLine(item)}</div>
                      <div className="compact-copy">{traderFreshnessLabel(item.freshness_minutes, item.freshness_state, item.execution_grade_allowed)}</div>
                    </td>
                    <td>
                      <div>{boardTruthLine(item)}</div>
                      <div className="compact-copy">{item.source_label}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>

      <QueueTable
        error={opportunitiesError}
        items={opportunities.focus_queue}
        loading={opportunitiesLoading}
        onOpenRisk={onOpenRisk}
        onOpenSignal={onOpenSignal}
        onSelectSymbol={onSelectSymbol}
        selectedSymbol={selectedSymbol}
        title="Focus Queue"
      />

      <QueueTable
        error={opportunitiesError}
        items={opportunities.scout_queue}
        loading={opportunitiesLoading}
        onOpenRisk={onOpenRisk}
        onOpenSignal={onOpenSignal}
        onSelectSymbol={onSelectSymbol}
        selectedSymbol={selectedSymbol}
        title="Scout Queue"
      />
    </div>
  );
}
