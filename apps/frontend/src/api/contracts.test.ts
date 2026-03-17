import { describe, expect, it } from "vitest";
import {
  mockAlerts,
  mockBacktestDetail,
  mockDailyBriefing,
  mockDeskSummary,
  mockNews,
  mockOperationalBacklog,
  mockCommandCenter,
  mockPilotDashboard,
  mockPilotExportResponse,
  mockPilotMetrics,
  mockOpportunities,
  mockPaperTradeAnalytics,
  mockPaperTradeDetail,
  mockPaperTradeReviews,
  mockPaperTradesActive,
  mockReplay,
  mockReviewTasks,
  mockRibbon,
  mockRisk,
  mockScenarioStressSummary,
  mockSessionOverview,
  mockExecutionGate,
  mockAdapterHealth,
  mockAuditLogs,
  mockSignalDetail,
  mockSignals,
  mockShadowTickets,
  mockTicketDetail,
  mockTicketList,
  mockStrategyDetail,
} from "./mockData";
import type {
  AlertEnvelope,
  BacktestDetailView,
  BrokerAdapterSnapshotView,
  DailyBriefingView,
  DeskSummaryView,
  ManualFillView,
  NewsView,
  OperationalBacklogView,
  CommandCenterStatusView,
  PilotDashboardView,
  PilotExportResponse,
  PilotMetricSummaryView,
  OpportunityHunterView,
  PaperTradeAnalyticsView,
  PaperTradeDetailView,
  PaperTradeReviewView,
  PaperTradeView,
  ReplayView,
  ReviewTaskView,
  RibbonView,
  RiskView,
  ScenarioStressSummaryView,
  SessionOverviewView,
  ExecutionGateView,
  AdapterHealthView,
  AuditLogView,
  SignalDetailView,
  SignalView,
  StrategyDetailView,
  TradeTicketDetailView,
  TradeTicketView,
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
    const reviewTask: ReviewTaskView = mockReviewTasks[0];
    const dailyBriefing: DailyBriefingView = mockDailyBriefing;
    const deskSummary: DeskSummaryView = mockDeskSummary;
    const sessionOverview: SessionOverviewView = mockSessionOverview;
    const operationalBacklog: OperationalBacklogView = mockOperationalBacklog;
    const commandCenter: CommandCenterStatusView = mockCommandCenter;
    const pilotMetrics: PilotMetricSummaryView = mockPilotMetrics;
    const pilotExportResponse: PilotExportResponse = mockPilotExportResponse;
    const executionGate: ExecutionGateView = mockExecutionGate;
    const pilotDashboard: PilotDashboardView = mockPilotDashboard;
    const adapterHealth: AdapterHealthView = mockAdapterHealth[0];
    const auditLog: AuditLogView = mockAuditLogs[0];
    const strategyDetail: StrategyDetailView = mockStrategyDetail;
    const backtestDetail: BacktestDetailView = mockBacktestDetail;
    const ticket: TradeTicketView = mockTicketList[0];
    const ticketDetail: TradeTicketDetailView = mockTicketDetail;
    const shadowTicket: TradeTicketDetailView = mockShadowTickets[0];
    const manualFill: ManualFillView = mockTicketDetail.manual_fills[0];
    const brokerSnapshot: BrokerAdapterSnapshotView = mockTicketDetail.broker_snapshot!;
    const paperTrade: PaperTradeView = mockPaperTradesActive[0];
    const paperTradeDetail: PaperTradeDetailView = mockPaperTradeDetail;
    const paperTradeReview: PaperTradeReviewView = mockPaperTradeReviews[0];
    const paperTradeAnalytics: PaperTradeAnalyticsView = mockPaperTradeAnalytics;
    const replay: ReplayView = mockReplay;
    const scenarioStress: ScenarioStressSummaryView = mockScenarioStressSummary;

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
    expect(reviewTask).toMatchObject({
      task_id: expect.any(String),
      task_type: expect.any(String),
      session_state: expect.any(String),
      priority: expect.any(String),
      due_at: expect.any(String),
      metadata: expect.any(Object),
    });
    expect(dailyBriefing).toMatchObject({
      top_ranked_signals: expect.any(Array),
      high_risk_setups: expect.any(Array),
      open_trades_needing_attention: expect.any(Array),
      degraded_data_sources: expect.any(Array),
    });
    expect(sessionOverview).toMatchObject({
      states: expect.any(Array),
      review_tasks: expect.any(Array),
      daily_briefing: expect.any(Object),
      weekly_review: expect.any(Object),
      operational_backlog: expect.any(Object),
    });
    expect(operationalBacklog).toMatchObject({
      overdue_count: expect.any(Number),
      high_priority_count: expect.any(Number),
      items: expect.any(Array),
    });
    expect(deskSummary).toMatchObject({
      session_states: expect.any(Array),
      execution_gate: expect.any(Object),
      review_tasks: expect.any(Array),
      open_tickets: expect.any(Array),
      active_paper_trades: expect.any(Array),
      shadow_divergence: expect.any(Array),
    });
    expect(commandCenter).toMatchObject({
      runtime_status: expect.any(String),
      source_mode: expect.any(String),
      pipeline_status: expect.any(String),
      available_actions: expect.any(Array),
      notes: expect.any(Array),
    });
    expect(pilotMetrics).toMatchObject({
      ticket_conversion: expect.any(Object),
      shadow_metrics: expect.any(Object),
      slippage_metrics: expect.any(Object),
      alert_metrics: expect.any(Object),
      adherence_metrics: expect.any(Object),
      review_backlog_metrics: expect.any(Object),
      promoted_strategy_metrics: expect.any(Object),
      mismatch_causes: expect.any(Array),
    });
    expect(executionGate).toMatchObject({
      status: expect.any(String),
      blockers: expect.any(Array),
      thresholds: expect.any(Object),
      metrics: expect.any(Object),
      rationale: expect.any(Array),
    });
    expect(pilotDashboard).toMatchObject({
      pilot_metrics: expect.any(Object),
      execution_gate: expect.any(Object),
      adapter_health: expect.any(Array),
      recent_audit_logs: expect.any(Array),
      trust_by_asset_class: expect.any(Array),
      divergence_hotspots: expect.any(Array),
      operator_discipline: expect.any(Object),
      review_backlog: expect.any(Object),
    });
    expect(pilotExportResponse).toMatchObject({
      report_path: expect.any(String),
      source_mode: expect.any(String),
      pipeline_status: expect.any(String),
    });
    expect(adapterHealth).toMatchObject({
      adapter_name: expect.any(String),
      status: expect.any(String),
      details: expect.any(Object),
    });
    expect(auditLog).toMatchObject({
      event_type: expect.any(String),
      entity_type: expect.any(String),
      entity_id: expect.any(String),
      details: expect.any(Object),
    });
    expect(strategyDetail).toMatchObject({
      lifecycle_state: expect.any(String),
      lifecycle_updated_at: expect.any(String),
      data_reality: expect.any(Object),
      promotion_rationale: expect.any(Object),
      operator_feedback_summary: expect.objectContaining({
        adherence_adjusted_expectancy_proxy: expect.any(Number),
        realism_adjusted_expectancy_proxy: expect.any(Number),
        operator_error_rate: expect.any(Number),
      }),
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
    expect(ticket).toMatchObject({
      ticket_id: expect.stringContaining("ticket_"),
      checklist_status: expect.objectContaining({
        freshness_acceptable: expect.any(Boolean),
        completed: expect.any(Boolean),
      }),
      approval_status: expect.any(String),
      status: expect.any(String),
      shadow_status: expect.any(String),
      realism_summary: expect.any(Object),
      freshness_summary: expect.any(Object),
    });
    expect(ticketDetail).toMatchObject({
      linked_signal: expect.any(Object),
      linked_risk: expect.any(Object),
      shadow_summary: expect.objectContaining({
        ticket_valid: expect.any(Boolean),
        observed_vs_plan_pct: expect.any(Number),
      }),
      manual_fills: expect.any(Array),
      broker_snapshot: expect.any(Object),
    });
    expect(shadowTicket.shadow_summary).toMatchObject({
      freshness_state: expect.any(String),
      market_path_note: expect.any(String),
    });
    expect(manualFill).toMatchObject({
      fill_id: expect.any(String),
      reconciliation: expect.objectContaining({
        actual_slippage_bps: expect.any(Number),
        modeled_slippage_bps: expect.any(Number),
        requires_review: expect.any(Boolean),
      }),
    });
    expect(brokerSnapshot).toMatchObject({
      balances: expect.any(Array),
      positions: expect.any(Array),
      fill_imports: expect.any(Array),
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
      execution_realism: expect.objectContaining({
        entry_slippage_bps: expect.any(Number),
        target_fill_mode: expect.any(String),
      }),
      execution_quality: expect.objectContaining({
        signal_quality: expect.any(String),
        execution_quality: expect.any(String),
      }),
      adherence: expect.objectContaining({
        adherence_score: expect.any(Number),
        breached_rules: expect.any(Array),
      }),
    });
    expect(paperTradeDetail).toMatchObject({
      linked_signal: expect.any(Object),
      linked_risk: expect.any(Object),
      timeline: expect.any(Object),
      scenario_stress: expect.any(Array),
    });
    expect(paperTradeReview).toMatchObject({
      trade_id: expect.any(String),
      entered_inside_suggested_zone: expect.anything(),
      size_plan_respected: expect.anything(),
      failure_categories: expect.any(Array),
      operator_notes: expect.any(String),
    });
    expect(paperTradeAnalytics).toMatchObject({
      by_signal_family: expect.any(Array),
      by_asset_class: expect.any(Array),
      by_strategy: expect.any(Array),
      by_strategy_lifecycle_state: expect.any(Array),
      by_score_bucket: expect.any(Array),
      by_realism_bucket: expect.any(Array),
      by_realism_grade: expect.any(Array),
      by_freshness_state: expect.any(Array),
      by_asset: expect.any(Array),
      by_signal_quality: expect.any(Array),
      by_plan_quality: expect.any(Array),
      by_execution_quality: expect.any(Array),
      hygiene_summary: expect.objectContaining({
        adherence_rate: expect.any(Number),
        review_completion_rate: expect.any(Number),
      }),
      failure_categories: expect.any(Array),
    });
    expect(replay).toMatchObject({
      symbol: expect.any(String),
      event_window_minutes: expect.any(Number),
      frames: expect.any(Array),
    });
    expect(scenarioStress).toMatchObject({
      signal_impacts: expect.any(Array),
      active_trade_impacts: expect.any(Array),
      promoted_strategy_impacts: expect.any(Array),
    });
  });
});
