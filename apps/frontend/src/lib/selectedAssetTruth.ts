import type { SelectedAssetTruthView } from "../types/api";
import { formatDateTimeIST } from "./time";

export function selectedAssetTruthStateLabel(selectedAssetTruth: SelectedAssetTruthView | null | undefined): string {
  switch (selectedAssetTruth?.route_readiness) {
    case "ready_current":
      return "Current";
    case "ready_fallback":
      return "Fallback";
    case "warming_up":
      return "Warming";
    case "unavailable":
      return "Unavailable";
    default:
      return "Unknown";
  }
}

export function selectedAssetTruthSourceFamilyLabel(selectedAssetTruth: SelectedAssetTruthView | null | undefined): string {
  switch (selectedAssetTruth?.source_mode) {
    case "primary_live":
      return "Primary live";
    case "delayed_public":
      return "Delayed/public";
    case "proxy_research":
      return "Proxy/research";
    case "last_verified":
      return "Last verified";
    default:
      return "Unknown source";
  }
}

export function selectedAssetTruthFallbackLabel(selectedAssetTruth: SelectedAssetTruthView | null | undefined): string {
  if (!selectedAssetTruth) {
    return "Fallback unknown";
  }
  if (selectedAssetTruth.route_readiness === "ready_fallback" || selectedAssetTruth.source_mode === "last_verified") {
    return "Fallback active";
  }
  if (selectedAssetTruth.is_proxy) {
    return "Proxy active";
  }
  return "Fallback inactive";
}

export function selectedAssetTruthFreshnessLabel(selectedAssetTruth: SelectedAssetTruthView | null | undefined): string {
  if (!selectedAssetTruth?.as_of) {
    return "Last verified n/a";
  }
  const freshness = selectedAssetTruth.freshness_minutes;
  const freshnessLabel = freshness === null || freshness === undefined ? "age n/a" : `${freshness}m old`;
  return `${formatDateTimeIST(selectedAssetTruth.as_of)} / ${freshnessLabel}`;
}
