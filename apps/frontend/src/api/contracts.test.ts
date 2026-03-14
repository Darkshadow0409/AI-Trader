import { describe, expect, it } from "vitest";
import { mockNews, mockRibbon, mockRisk, mockSignals } from "./mockData";
import type { NewsView, RibbonView, RiskView, SignalView } from "../types/api";

describe("frontend contract alignment", () => {
  it("keeps representative mock payloads aligned with backend field names", () => {
    const signal: SignalView = mockSignals[0];
    const news: NewsView = mockNews[0];
    const risk: RiskView = mockRisk[0];
    const ribbon: RibbonView = mockRibbon;

    expect(signal).toMatchObject({
      symbol: expect.any(String),
      signal_type: expect.any(String),
      score: expect.any(Number),
      confidence: expect.any(Number),
      noise_probability: expect.any(Number),
      invalidation: expect.any(Number),
      data_quality: expect.any(String),
    });
    expect(news).toMatchObject({
      source: expect.any(String),
      entity_tags: expect.any(Array),
      affected_assets: expect.any(Array),
    });
    expect(risk).toMatchObject({
      size_band: expect.any(String),
      scenario_shocks: expect.any(Object),
      exposure_cluster: expect.any(String),
    });
    expect(ribbon).toMatchObject({
      macro_regime: expect.any(String),
      pipeline_status: expect.any(String),
      source_mode: expect.any(String),
    });
  });
});
