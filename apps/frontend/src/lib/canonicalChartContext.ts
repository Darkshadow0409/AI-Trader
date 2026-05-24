import type { MarketChartView, SelectedAssetTruthView } from "../types/api";
import {
  selectedAssetTruthFallbackLabel,
  selectedAssetTruthFreshnessLabel,
  selectedAssetTruthSourceFamilyLabel,
  selectedAssetTruthStateLabel,
} from "./selectedAssetTruth";

function marketDataModeLabel(mode: string): string {
  switch (mode) {
    case "fixture":
      return "Fixture data";
    case "public_live":
      return "Public live data";
    case "broker_live":
      return "Broker live data";
    default:
      return mode.replace(/_/g, " ");
  }
}

export interface CanonicalChartContext {
  selectedAssetTruth: SelectedAssetTruthView | null;
  traderFacingSymbol: string;
  researchSymbol: string | null;
  assetHeaderLabel: string;
  stateLabel: string;
  sourceFamilyLabel: string;
  fallbackLabel: string;
  freshnessLabel: string;
  marketDataLabel: string;
  routeReadiness: string;
  freshnessMinutes: number | null;
  asOf: string | null;
}

export function buildCanonicalChartContext(
  chart: MarketChartView,
  selectedAssetTruthFallback?: SelectedAssetTruthView | null,
): CanonicalChartContext {
  const selectedAssetTruth = chart.selected_asset_truth ?? selectedAssetTruthFallback ?? null;
  const traderFacingSymbol = selectedAssetTruth?.trader_facing_symbol ?? chart.instrument_mapping.trader_symbol;
  const researchSymbol = selectedAssetTruth?.research_symbol_if_any ?? chart.instrument_mapping.research_symbol ?? null;
  const assetHeaderLabel =
    chart.instrument_mapping.underlying_asset === "WTI"
      ? `${traderFacingSymbol} // Crude Oil`
      : `${traderFacingSymbol} // ${chart.instrument_mapping.display_name}`;

  return {
    selectedAssetTruth,
    traderFacingSymbol,
    researchSymbol,
    assetHeaderLabel,
    stateLabel: selectedAssetTruthStateLabel(selectedAssetTruth),
    sourceFamilyLabel: selectedAssetTruthSourceFamilyLabel(selectedAssetTruth),
    fallbackLabel: selectedAssetTruthFallbackLabel(selectedAssetTruth),
    freshnessLabel: selectedAssetTruthFreshnessLabel(selectedAssetTruth),
    marketDataLabel: marketDataModeLabel(chart.market_data_mode),
    routeReadiness: selectedAssetTruth?.route_readiness ?? "unknown",
    freshnessMinutes: selectedAssetTruth?.freshness_minutes ?? null,
    asOf: selectedAssetTruth?.as_of ?? null,
  };
}
