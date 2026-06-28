import {
  selectedAssetTruthFallbackLabel,
  selectedAssetTruthFreshnessLabel,
  selectedAssetTruthSourceFamilyLabel,
  selectedAssetTruthStateLabel,
} from "../lib/selectedAssetTruth";
import { advisoryVisibleCopy } from "../lib/realityStrip";
import { chartStateLabel, titleCase, traderFreshnessStateLabel } from "../lib/uiLabels";
import type { AssetReadinessView } from "../lib/assetReadiness";
import type {
  AssetContextView,
  MarketChartView,
  OperationalBacklogView,
  ReviewSummaryView,
  RiskDetailView,
  RiskView,
  SelectedAssetTruthView,
  SignalDetailView,
  SignalView,
  TradeTicketView,
} from "../types/api";

interface OperatorBriefProps {
  assetLabel: string;
  selectedSymbol: string;
  timeframe: string;
  chart: MarketChartView;
  assetContext: AssetContextView;
  selectedAssetTruth?: SelectedAssetTruthView | null;
  selectedAssetReadiness?: AssetReadinessView | null;
  signal?: SignalDetailView | SignalView | null;
  riskDetail?: RiskDetailView | RiskView | null;
  reviewSummary?: ReviewSummaryView | null;
  operationalBacklog?: OperationalBacklogView | null;
  tickets?: TradeTicketView[] | null;
  selectedMappingNote?: string | null;
}

function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function displaySymbol(row: { display_symbol?: string | null; symbol?: string | null; data_reality?: { provenance?: { tradable_symbol?: string | null } | null } | null } | null | undefined): string {
  return row?.display_symbol ?? row?.data_reality?.provenance?.tradable_symbol ?? row?.symbol ?? "n/a";
}

function ticketIsOpen(row: TradeTicketView): boolean {
  return !["closed", "cancelled", "expired", "archived"].includes(row.status);
}

function ticketNeedsReview(row: TradeTicketView): boolean {
  return row.status === "ready_for_review" || row.approval_status === "pending" || row.promotable;
}

function truthNote(
  selectedAssetTruth: SelectedAssetTruthView | null | undefined,
  chart: MarketChartView,
  assetContext: AssetContextView,
): string {
  if (!selectedAssetTruth) {
    return "Truth unavailable / fallback unknown.";
  }
  return advisoryVisibleCopy(
    selectedAssetTruth.degraded_reason
    ?? chart.status_note
    ?? assetContext.data_reality?.ui_warning
    ?? assetContext.data_reality?.tradable_alignment_note
    ?? "Selected asset truth is loaded with explicit freshness and source limits."
  );
}

function signalBullet(signal: SignalDetailView | SignalView | null | undefined): string | null {
  if (!signal) {
    return null;
  }
  return `${displaySymbol(signal)} ${titleCase(signal.signal_type)} is ${titleCase(signal.direction)} with score ${signal.score.toFixed(1)} and ${formatPercent(signal.confidence)} confidence.`;
}

function riskBullet(risk: RiskDetailView | RiskView | null | undefined): string | null {
  if (!risk) {
    return null;
  }
  return `${displaySymbol(risk)} risk frame has stop ${risk.stop_price.toFixed(2)}, ${risk.size_band} size, and max portfolio risk ${risk.max_portfolio_risk_pct.toFixed(3)}%.`;
}

function catalystBullet(assetContext: AssetContextView): string | null {
  const firstHeadline = Array.isArray(assetContext.related_news) ? assetContext.related_news[0]?.title : null;
  if (firstHeadline) {
    return `Latest catalyst in scope: ${firstHeadline}.`;
  }
  if (assetContext.crowd_implied_narrative) {
    return `Crowd context in scope: ${assetContext.crowd_implied_narrative}.`;
  }
  if (assetContext.research?.trend_state) {
    return `Research context: ${titleCase(assetContext.research.trend_state)} trend with structure score ${assetContext.research.structure_score.toFixed(1)}.`;
  }
  return null;
}

function whyItMattersBullets({
  assetContext,
  chart,
  riskDetail,
  selectedAssetTruth,
  signal,
}: Pick<OperatorBriefProps, "assetContext" | "chart" | "riskDetail" | "selectedAssetTruth" | "signal">): string[] {
  const bullets = [
    truthNote(selectedAssetTruth, chart, assetContext),
    signalBullet(signal),
    riskBullet(riskDetail),
    catalystBullet(assetContext),
  ].filter((item): item is string => Boolean(item));

  if (bullets.length < 2) {
    bullets.push(`Chart-only fallback is active for ${chart.timeframe}; keep the brief bounded by visible chart state and freshness.`);
  }

  return bullets.slice(0, 4);
}

function advisoryNextStep({
  assetLabel,
  selectedSymbol,
  selectedAssetTruth,
  riskDetail,
  tickets,
  selectedMappingNote,
}: Pick<OperatorBriefProps, "assetLabel" | "selectedSymbol" | "selectedAssetTruth" | "riskDetail" | "tickets" | "selectedMappingNote">): string {
  const selected = selectedSymbol.toUpperCase();
  const asset = assetLabel.toUpperCase();
  const researchSymbol = selectedAssetTruth?.research_symbol_if_any?.toUpperCase() ?? "";
  const mappingNote = selectedMappingNote?.toUpperCase() ?? "";
  const openReadyTickets = (tickets ?? []).filter((row) => ticketIsOpen(row) && ticketNeedsReview(row)).length;

  if (selected === "WTI" || selected === "WTI_CTX") {
    return "Research context only; use USOUSD for trader-facing oil.";
  }
  if (asset === "USOUSD" && (researchSymbol.includes("WTI") || mappingNote.includes("WTI") || mappingNote.includes("WTI_CTX"))) {
    return "USOUSD is trader-facing oil; WTI/WTI_CTX remains research context.";
  }
  if (asset === "XAGUSD" || selected === "XAGUSD") {
    return "XAGUSD remains the trader-facing silver board.";
  }
  if (!selectedAssetTruth || ["warming_up", "unavailable"].includes(selectedAssetTruth.route_readiness)) {
    return "Wait for fresher chart confirmation.";
  }
  if (openReadyTickets > 0) {
    return "Review existing ticket before drafting new action.";
  }
  if (!riskDetail) {
    return "Open Risk to attach stop and size before paper workflow.";
  }
  return "Paper-only observation; no live order route.";
}

export function OperatorBrief({
  assetLabel,
  selectedSymbol,
  timeframe,
  chart,
  assetContext,
  selectedAssetTruth = null,
  selectedAssetReadiness = null,
  signal = null,
  riskDetail = null,
  reviewSummary = null,
  operationalBacklog = null,
  tickets = [],
  selectedMappingNote = null,
}: OperatorBriefProps) {
  const ticketRows = tickets ?? [];
  const openTickets = ticketRows.filter(ticketIsOpen).length;
  const reviewReadyTickets = ticketRows.filter((row) => ticketIsOpen(row) && ticketNeedsReview(row)).length;
  const gateBlockingReviews =
    reviewSummary?.gate_impact?.gate_blocking_count
    ?? reviewSummary?.accountability_metrics?.gate_blocking_count
    ?? 0;
  const overdueReviews =
    reviewSummary?.task_counts?.overdue
    ?? reviewSummary?.accountability_metrics?.overdue_count
    ?? operationalBacklog?.overdue_count
    ?? 0;
  const highPriorityReviews = operationalBacklog?.high_priority_count ?? reviewSummary?.task_counts?.high_priority ?? 0;
  const chartTruth = `${chartStateLabel(chart.status)} / ${traderFreshnessStateLabel(chart.freshness_state, chart.data_reality?.execution_grade_allowed)}`;
  const bullets = whyItMattersBullets({ assetContext, chart, riskDetail, selectedAssetTruth, signal });
  const nextStep = advisoryNextStep({ assetLabel, selectedSymbol, selectedAssetTruth, riskDetail, tickets: ticketRows, selectedMappingNote });

  return (
    <article className="panel compact-panel terminal-subpanel operator-brief-panel" data-testid="operator-brief">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Operator Brief</p>
          <h3>Evidence-Backed Brief</h3>
        </div>
        <div className="inline-tags">
          <span className="tag">{assetLabel}</span>
          <span className="tag">{timeframe}</span>
          <span className="tag">Advisory</span>
        </div>
      </div>

      <div className="operator-brief-grid">
        <section className="operator-brief-section">
          <h4>Market State</h4>
          <dl className="operator-brief-facts">
            <div>
              <dt>Selected asset</dt>
              <dd>{assetLabel}</dd>
            </div>
            <div>
              <dt>Timeframe</dt>
              <dd>{timeframe}</dd>
            </div>
            <div>
              <dt>Truth</dt>
              <dd>{selectedAssetTruth ? selectedAssetTruthStateLabel(selectedAssetTruth) : "Truth unavailable / fallback unknown"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{selectedAssetTruthSourceFamilyLabel(selectedAssetTruth)}</dd>
            </div>
            <div>
              <dt>Freshness</dt>
              <dd>{selectedAssetTruthFreshnessLabel(selectedAssetTruth)}</dd>
            </div>
            <div>
              <dt>Fallback</dt>
              <dd>{selectedAssetTruthFallbackLabel(selectedAssetTruth)}</dd>
            </div>
            <div>
              <dt>Chart</dt>
              <dd>{chartTruth}</dd>
            </div>
            <div>
              <dt>Readiness</dt>
              <dd>{selectedAssetReadiness?.badgeLabel ?? "Readiness pending"}</dd>
            </div>
          </dl>
        </section>

        <section className="operator-brief-section operator-brief-section-wide">
          <h4>Why It Matters</h4>
          <ul className="operator-brief-list">
            {bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="operator-brief-section">
          <h4>Risk And Review Pressure</h4>
          <div className="operator-brief-pressure">
            <span>{overdueReviews} overdue review(s)</span>
            <span>{highPriorityReviews} high priority</span>
            <span>{gateBlockingReviews} gate-blocking review(s)</span>
            <span>{openTickets} open ticket(s)</span>
            <span>{reviewReadyTickets} ready for review</span>
          </div>
        </section>

        <section className="operator-brief-section operator-brief-next-step">
          <h4>Advisory Next Step</h4>
          <p>{nextStep}</p>
        </section>
      </div>
    </article>
  );
}
