import { describe, expect, it } from "vitest";
import { resolveRealityStrip } from "./realityStrip";
import type { CommodityTruthStatusView, DataRealityView } from "../types/api";

describe("resolveRealityStrip", () => {
  it("keeps backend truth notes advisory without rendering strict-gate wording", () => {
    const commodityTruth: CommodityTruthStatusView = {
      truth_state: "ready_delayed",
      truth_label: "Delayed context",
      truth_note: "Context remains advisory-only and non-execution-grade.",
      last_verified_age_minutes: null,
    };
    const reality = {
      provenance: {
        symbol: "USOUSD",
        tradable_symbol: "USOUSD",
        underlying_asset: "WTI",
        research_symbol: "WTI_CTX",
        intended_venue: "desk",
        intended_instrument: "oil",
        source_name: "public",
        source_type: "public_market_data",
        source_timing: "delayed",
        freshness_sla_minutes: 20,
        realism_grade: "delayed",
        proxy_mapping_notes: "",
        asset_class: "commodity",
      },
      freshness_minutes: 25,
      freshness_state: "stale",
      event_recency_minutes: null,
      realism_score: 0.7,
      ranking_penalty: 0,
      promotion_blocked: true,
      alert_allowed: false,
      execution_grade_allowed: false,
      execution_suitability: "research",
      news_suitability: "research",
      ui_warning: "Not execution-ready; broker-ready claims are unavailable.",
      timing_semantics_note: "Still not execution-grade.",
      event_context_note: "",
      penalties: [],
      tradable_alignment_note: "",
    } satisfies DataRealityView;

    const text = resolveRealityStrip({ commodityTruth, reality }).slots
      .map((slot) => `${slot.value} ${slot.note}`)
      .join(" ");

    expect(text).not.toMatch(/execution-ready|execution-grade|non-execution-grade|broker-ready/i);
    expect(text).toMatch(/operator review|operator-review|no live order route/i);
  });
});
