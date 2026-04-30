import type { CommodityTruthStatusView, DataRealityView, InstrumentMappingView, OpportunityView, WatchlistSummaryView } from "../types/api";
import { commodityTruthIsReadyCurrent, commodityTruthStateLabel, suitabilityLabel, traderFreshnessStateLabel } from "./uiLabels";

export type AssetReadinessKind = "primary_path" | "research_only_today" | "no_actionable_setup";

export interface AssetReadinessView {
  kind: AssetReadinessKind;
  badgeLabel: string;
  headline: string;
  summary: string;
  nextStep: string;
  tone: "positive" | "warning" | "muted";
}

interface DeriveAssetReadinessArgs {
  watchlistRow?: WatchlistSummaryView | null;
  opportunity?: OpportunityView | null;
  commodityTruth?: CommodityTruthStatusView | null;
}

function readinessReality(args: DeriveAssetReadinessArgs): DataRealityView | null {
  return args.opportunity?.data_reality ?? null;
}

function readinessFreshnessLabel(args: DeriveAssetReadinessArgs): string {
  const row = args.watchlistRow;
  const reality = readinessReality(args);
  if (reality) {
    return traderFreshnessStateLabel(reality.freshness_state, reality.execution_grade_allowed);
  }
  return traderFreshnessStateLabel(row?.freshness_state, row?.execution_grade_allowed);
}

export function deriveAssetReadiness({
  watchlistRow = null,
  opportunity = null,
  commodityTruth = null,
}: DeriveAssetReadinessArgs): AssetReadinessView {
  const reality = readinessReality({ watchlistRow, opportunity, commodityTruth });
  const freshness = readinessFreshnessLabel({ watchlistRow, opportunity, commodityTruth });
  const truthReady = commodityTruth ? commodityTruthIsReadyCurrent(commodityTruth) : true;
  const queue = opportunity?.queue ?? null;
  const hasSetupLinks = Boolean(opportunity?.signal_id || opportunity?.risk_report_id);
  const promotionBlocked = Boolean(reality?.promotion_blocked);
  const executionAllowed = reality?.execution_grade_allowed !== false;
  const unusableSuitability = new Set(["unusable", "research_only", "context_only", "news_context_only"]);
  const suitability = reality?.execution_suitability ?? null;
  const displaySymbol = watchlistRow?.instrument_mapping.trader_symbol ?? opportunity?.display_symbol ?? watchlistRow?.symbol ?? opportunity?.symbol ?? "This asset";

  if (
    queue !== "focus"
    && !hasSetupLinks
    && (promotionBlocked || executionAllowed === false || (suitability ? unusableSuitability.has(suitability) : false))
  ) {
    return {
      kind: "no_actionable_setup",
      badgeLabel: "No actionable setup loaded",
      headline: `${displaySymbol} is not loaded for ticket work right now.`,
      summary: reality?.ui_warning || "This asset is still a thin or blocked path today, so there is no current signal/risk frame to act on.",
      nextStep: "Use Chart, Watchlist, and Research first. Move into Risk or Tickets only after a setup is promoted into focus with a usable risk frame.",
      tone: "muted",
    };
  }

  if (
    !truthReady
    || queue === "scout"
    || promotionBlocked
    || executionAllowed === false
    || (suitability ? unusableSuitability.has(suitability) : false)
  ) {
    return {
      kind: "research_only_today",
      badgeLabel: "Research-only today",
      headline: `${displaySymbol} is usable for research, not direct execution timing.`,
      summary:
        reality?.ui_warning
        || commodityTruth?.truth_note
        || `Freshness is ${freshness} and current suitability is ${suitabilityLabel(suitability)}.`,
      nextStep: "Stay in chart, research, and review workflow. Treat any proposal as paper-only until current truth and a stronger setup return.",
      tone: "warning",
    };
  }

  return {
    kind: "primary_path",
    badgeLabel: "Primary path",
    headline: `${displaySymbol} is the clearest workflow path right now.`,
    summary:
      watchlistRow?.instrument_mapping.mapping_notes
      || `Truth is ${commodityTruth ? commodityTruthStateLabel(commodityTruth).toLowerCase() : "usable"} with ${freshness} timing context.`,
    nextStep: hasSetupLinks
      ? "Use the chart first, then confirm Risk and Tickets from this same selected asset."
      : "Use the chart first, then open Signals or Risk to confirm whether a setup is ready for paper workflow.",
    tone: "positive",
  };
}

export function instrumentMappingExplainer(mapping: InstrumentMappingView | null | undefined): string | null {
  if (!mapping) {
    return null;
  }
  if (mapping.trader_symbol === mapping.research_symbol && mapping.trader_symbol === mapping.requested_symbol) {
    return null;
  }
  return `You trade ${mapping.trader_symbol} here. Research context still comes from ${mapping.research_symbol}${mapping.public_symbol && mapping.public_symbol !== mapping.research_symbol ? ` / ${mapping.public_symbol}` : ""}.`;
}
