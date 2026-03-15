import { describe, expect, it } from "vitest";
import {
  mockAlerts,
  mockBacktestDetail,
  mockNews,
  mockOpportunities,
  mockPaperTradeAnalytics,
  mockPaperTradeDetail,
  mockPaperTradeReviews,
  mockPaperTradesActive,
  mockRibbon,
  mockRisk,
  mockSignalDetail,
  mockSignals,
  mockStrategyDetail,
} from "./mockData";
import type {
  AlertEnvelope,
  BacktestDetailView,
  NewsView,
  OpportunityHunterView,
  PaperTradeAnalyticsView,
  PaperTradeDetailView,
  PaperTradeReviewView,
  PaperTradeView,
  RibbonView,
  RiskView,
  SignalDetailView,
  SignalView,
  StrategyDetailView,
} from "../types/api";

describe("frontend contract alignment", () => {
  it("keeps representative mock payloads aligned with backend field names", () => {
    const signal: SignalView = mockSignals[0];
    const news: NewsView = mockNews[0];
    const risk: RiskView = mockRisk[0];
    const ribbon: RibbonView = mockRibbon;
    const signalDetail: SignalDetailView = mockSignalDetail;
    const opportunities: OpportunityHunterView = mockOpportunities;
    const alert: AlertEnvelope = mockAlerts[0];
    const strategyDetail: StrategyDetailView = mockStrategyDetail;
    const backtestDetail: BacktestDetailView = mockBacktestDetail;
    const paperTrade: PaperTradeView = mockPaperTradesActive[0];
    const paperTradeDetail: PaperTradeDetailView = mockPaperTradeDetail;
    const paperTradeReview: PaperTradeReviewView = mockPaperTradeReviews[0];
    const paperTradeAnalytics: PaperTradeAnalyticsView = mockPaperTradeAnalytics;

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
      data_reality: expect.objectContaining({
        freshness_state: expect.any(String),
        realism_score: expect.any(Number),
        execution_suitability: expect.any(String),
        news_suitability: expect.any(String),
        timing_semantics_note: expect.any(String),
        provenance: expect.objectContaining({
          research_symbol: expect.any(String),
          tradable_symbol: expect.any(String),
          intended_venue: expect.any(String),
          intended_instrument: expect.any(String),
          source_timing: expect.any(String),
        }),
      }),
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
      data_reality: expect.objectContaining({
        tradable_alignment_note: expect.any(String),
      }),
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
    expect(opportunities.focus_queue[0]?.data_reality).toMatchObject({
      freshness_state: expect.any(String),
      provenance: expect.any(Object),
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
    expect(strategyDetail).toMatchObject({
      lifecycle_state: expect.any(String),
      lifecycle_updated_at: expect.any(String),
      data_reality: expect.any(Object),
      promotion_rationale: expect.any(Object),
      calibration_summary: expect.any(Array),
      forward_validation_summary: expect.any(Object),
      data_realism_penalties: expect.any(Array),
      transition_history: expect.any(Array),
    });
    expect(backtestDetail).toMatchObject({
      lifecycle_state: expect.any(String),
      data_reality: expect.any(Object),
      data_realism_penalties: expect.any(Array),
      promotion_rationale: expect.any(Object),
      forward_validation_summary: expect.any(Object),
      calibration_summary: expect.any(Array),
    });
    expect(paperTrade).toMatchObject({
      trade_id: expect.stringContaining("paper_trade"),
      symbol: expect.any(String),
      status: expect.any(String),
      proposed_entry_zone: expect.any(Object),
      size_plan: expect.any(Object),
      outcome: expect.objectContaining({
        entry_quality_label: expect.any(String),
        realized_pnl_pct: expect.any(Number),
      }),
    });
    expect(paperTradeDetail).toMatchObject({
      linked_signal: expect.any(Object),
      linked_risk: expect.any(Object),
    });
    expect(paperTradeReview).toMatchObject({
      trade_id: expect.any(String),
      operator_notes: expect.any(String),
    });
    expect(paperTradeAnalytics).toMatchObject({
      by_signal_family: expect.any(Array),
      by_strategy: expect.any(Array),
      by_score_bucket: expect.any(Array),
      by_realism_bucket: expect.any(Array),
      by_asset: expect.any(Array),
    });
  });
});
