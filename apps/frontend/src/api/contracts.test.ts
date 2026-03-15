import { describe, expect, it } from "vitest";
import { mockAlerts, mockNews, mockOpportunities, mockRibbon, mockRisk, mockSignalDetail, mockSignals } from "./mockData";
import type { AlertEnvelope, NewsView, OpportunityHunterView, RibbonView, RiskView, SignalDetailView, SignalView } from "../types/api";

describe("frontend contract alignment", () => {
  it("keeps representative mock payloads aligned with backend field names", () => {
    const signal: SignalView = mockSignals[0];
    const news: NewsView = mockNews[0];
    const risk: RiskView = mockRisk[0];
    const ribbon: RibbonView = mockRibbon;
    const signalDetail: SignalDetailView = mockSignalDetail;
    const opportunities: OpportunityHunterView = mockOpportunities;
    const alert: AlertEnvelope = mockAlerts[0];

    expect(signal).toMatchObject({
      signal_id: expect.stringMatching(/^sig_/),
      symbol: expect.any(String),
      signal_type: expect.any(String),
      freshness_minutes: expect.any(Number),
      score: expect.any(Number),
      confidence: expect.any(Number),
      noise_probability: expect.any(Number),
      invalidation: expect.any(Number),
      data_quality: expect.any(String),
    });
    expect(news).toMatchObject({
      source: expect.any(String),
      freshness_minutes: expect.any(Number),
      entity_tags: expect.any(Array),
      affected_assets: expect.any(Array),
    });
    expect(risk).toMatchObject({
      risk_report_id: expect.stringMatching(/^risk_/),
      signal_id: expect.stringMatching(/^sig_/),
      freshness_minutes: expect.any(Number),
      size_band: expect.any(String),
      scenario_shocks: expect.any(Object),
      exposure_cluster: expect.any(String),
    });
    expect(ribbon).toMatchObject({
      macro_regime: expect.any(String),
      pipeline_status: expect.any(String),
      source_mode: expect.any(String),
    });
    expect(signalDetail).toMatchObject({
      signal_id: expect.stringMatching(/^sig_/),
      evidence: expect.any(Array),
      catalyst_news: expect.any(Array),
      freshness_status: expect.any(String),
    });
    expect(opportunities).toMatchObject({
      generated_at: expect.any(String),
      focus_queue: expect.any(Array),
      scout_queue: expect.any(Array),
    });
    expect(alert).toMatchObject({
      alert_id: expect.any(String),
      asset_ids: expect.any(Array),
      category: expect.any(String),
      channel_targets: expect.any(Array),
      severity: expect.any(String),
      body: expect.any(String),
      dedupe_key: expect.any(String),
      tags: expect.any(Array),
      status: expect.any(String),
    });
  });
});
