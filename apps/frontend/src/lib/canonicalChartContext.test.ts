import { describe, expect, it } from "vitest";
import { mockMarketCharts } from "../api/mockData";
import type { SelectedAssetTruthView } from "../types/api";
import { buildCanonicalChartContext } from "./canonicalChartContext";

describe("buildCanonicalChartContext", () => {
  it("prefers chart-selected truth over shell fallback truth", () => {
    const shellFallback: SelectedAssetTruthView = {
      symbol: "XAGUSD",
      trader_facing_symbol: "XAGUSD",
      research_symbol_if_any: "XAG_CTX",
      as_of: "2026-04-01T06:30:00Z",
      freshness_minutes: 1,
      source_mode: "primary_live",
      route_readiness: "ready_current",
      degraded_reason: null,
      is_proxy: false,
      confidence: 0.95,
    };

    const context = buildCanonicalChartContext(mockMarketCharts["WTI:1d"], shellFallback);

    expect(context.selectedAssetTruth?.symbol).toBe("USOUSD");
    expect(context.traderFacingSymbol).toBe("USOUSD");
    expect(context.researchSymbol).toBe("WTI_CTX");
    expect(context.stateLabel).toBe("Fallback");
    expect(context.sourceFamilyLabel).toBe("Proxy/research");
    expect(context.fallbackLabel).toBe("Fallback active");
  });

  it("keeps trader-facing silver separate from oil research context", () => {
    const context = buildCanonicalChartContext(mockMarketCharts["SILVER:1d"], null);

    expect(context.traderFacingSymbol).toBe("XAGUSD");
    expect(context.researchSymbol).toBe("XAG_CTX");
    expect(context.researchSymbol).not.toBe("WTI_CTX");
  });
});
