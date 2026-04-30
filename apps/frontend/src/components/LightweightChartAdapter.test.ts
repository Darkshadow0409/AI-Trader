import { describe, expect, it } from "vitest";
import { mockMarketCharts, mockPaperTradeDetail, mockRiskDetail, mockSignalDetail } from "../api/mockData";
import { buildLightweightChartModel } from "./LightweightChartAdapter";

describe("buildLightweightChartModel", () => {
  it("keeps backend-fed zones and appends companion-context zones without replacing canonical overlays", () => {
    const model = buildLightweightChartModel({
      chart: mockMarketCharts["WTI:1d"],
      selectedSignal: {
        ...mockSignalDetail,
        features: {
          ...mockSignalDetail.features,
          entry_zone: { low: 78.3, high: 78.9 },
        },
      },
      selectedRisk: {
        ...mockRiskDetail,
        report: {
          ...mockRiskDetail.report,
          entry_zone: { low: 78.2, high: 78.8 },
        },
      },
      selectedTrade: {
        ...mockPaperTradeDetail,
        proposed_entry_zone: { low: 78.0, high: 78.5 },
      },
    });

    expect(model.effectiveZones.some((zone) => zone.zone_id === "wti-entry-zone")).toBe(true);
    expect(model.effectiveZones.some((zone) => zone.zone_id.startsWith("signal-zone-"))).toBe(true);
    expect(model.effectiveZones.some((zone) => zone.zone_id.startsWith("risk-zone-"))).toBe(true);
    expect(model.effectiveZones.some((zone) => zone.zone_id.startsWith("trade-zone-"))).toBe(true);
    expect(model.effectiveLines.some((line) => line.line_id === "wti-stop")).toBe(true);
    expect(model.effectiveMarkers.some((marker) => marker.marker_id === "review-wti")).toBe(true);
  });

  it("drops malformed or duplicate overlay zones instead of inventing client-only geometry", () => {
    const model = buildLightweightChartModel({
      chart: {
        ...mockMarketCharts["WTI:1d"],
        overlays: {
          ...mockMarketCharts["WTI:1d"].overlays,
          zones: [
            { zone_id: "dup-zone", label: "good", low: 77.1, high: 78.2, kind: "entry_zone", tone: "accent" },
            { zone_id: "dup-zone", label: "duplicate", low: 77.3, high: 78.4, kind: "entry_zone", tone: "accent" },
            { zone_id: "flat-zone", label: "flat", low: 77.5, high: 77.5, kind: "entry_zone", tone: "accent" },
          ],
        },
      },
    });

    expect(model.effectiveZones.filter((zone) => zone.zone_id === "dup-zone")).toHaveLength(1);
    expect(model.effectiveZones.some((zone) => zone.zone_id === "flat-zone")).toBe(false);
  });
});
