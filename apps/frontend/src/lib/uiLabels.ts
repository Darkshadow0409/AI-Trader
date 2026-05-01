import type { AlertEnvelope, CommodityTruthStatusView, OperatorWireItemView, RecoveryTelemetryView, RunStageEventView } from "../types/api";

export interface RunStageGuidanceView {
  explanation: string;
  nextStep: string;
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
}

export function commodityTruthStateLabel(truth: CommodityTruthStatusView | null | undefined): string {
  if (truth?.recovery_in_progress && truth.truth_state !== "ready_current") {
    return "Commodity truth recovering";
  }
  switch (truth?.truth_state) {
    case "ready_current":
      return "Current delayed futures context";
    case "ready_last_verified":
      return "Using last verified delayed futures context";
    case "warming_up":
      return "Commodity truth warming up";
    case "unavailable":
      return "Commodity truth unavailable, research only";
    default:
      return "Commodity truth status unknown";
  }
}

export function commodityTruthSummaryLabel(truth: CommodityTruthStatusView | null | undefined): string {
  if (!truth) {
    return "Commodity truth has not loaded yet.";
  }
  return truth.truth_note || commodityTruthStateLabel(truth);
}

export function commodityTruthIsReadyCurrent(truth: CommodityTruthStatusView | null | undefined): boolean {
  return truth?.truth_state === "ready_current";
}

export function commodityTruthBoardLabel(truth: CommodityTruthStatusView | null | undefined): string {
  if (truth?.recovery_in_progress && truth.truth_state !== "ready_current") {
    return "recovering";
  }
  switch (truth?.truth_state) {
    case "ready_current":
      return "current delayed";
    case "ready_last_verified":
      return "last verified";
    case "warming_up":
      return "warming up";
    case "unavailable":
      return "research only";
    default:
      return "awaiting truth";
  }
}

export function recoveryReasonLabel(reason: string | null | undefined): string {
  if (!reason) {
    return "No active recovery reason.";
  }
  switch (reason) {
    case "startup_recovery":
      return "Startup recovery";
    case "current_truth_stale_for_operator_use":
      return "Current commodity truth is too stale for operator use";
    default:
      return titleCase(reason);
  }
}

export function recoveryStatusLabel(telemetry: RecoveryTelemetryView | null | undefined): string {
  if (!telemetry) {
    return "No recovery telemetry published";
  }
  if (telemetry.recovery_active) {
    return "Recovery active";
  }
  switch (telemetry.truth_state) {
    case "ready_current":
      return "Current delayed futures context active";
    case "ready_last_verified":
      return "Last verified fallback active";
    case "warming_up":
      return "Warmup in progress";
    case "unavailable":
      return "Commodity truth unavailable";
    default:
      return telemetry.truth_label || "Recovery state unknown";
  }
}

export function plainStatusLabel(value: string | null | undefined, fallback = "Unknown"): string {
  if (!value) {
    return fallback;
  }
  return titleCase(value);
}

export function gateStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "not_ready":
      return "Not ready";
    case "review_required":
      return "Review required";
    case "execution_candidate":
      return "Execution candidate";
    default:
      return status ? titleCase(status) : "Loading";
  }
}

export function systemRefreshLabel(status: string | null | undefined): string {
  switch (status) {
    case "fresh":
      return "recent check";
    case "aging":
      return "aging check";
    case "stale":
      return "stale check";
    case "degraded":
      return "degraded check";
    case "unusable":
      return "failed check";
    default:
      return status ? `${titleCase(status).toLowerCase()} check` : "unknown";
  }
}

export function marketFreshnessLabel(minutes: number | null | undefined, state: string | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return state ? `unknown / ${state}` : "unknown";
  }
  return `${minutes}m / ${state ?? "unknown"}`;
}

export function operatorWireCategoryLabel(category: string | null | undefined): string {
  switch (category) {
    case "recovery":
      return "Recovery";
    case "review":
      return "Review";
    case "signal":
      return "Signal";
    case "opportunity":
      return "Setup";
    case "trade":
      return "Trade";
    case "news":
      return "Catalyst";
    default:
      return plainStatusLabel(category, "Wire");
  }
}

export function operatorWireFreshnessLabel(item: OperatorWireItemView): string {
  if (item.category === "recovery" && item.truth_state) {
    return commodityTruthStateLabel({
      truth_state: item.truth_state,
      truth_label: item.headline,
      truth_note: item.summary,
      recovery_in_progress: item.recovery_active,
      blocking_reason: undefined,
    } as CommodityTruthStatusView);
  }
  return marketFreshnessLabel(item.freshness_minutes, item.freshness_state);
}

export function traderFreshnessStateLabel(
  state: string | null | undefined,
  executionGradeAllowed: boolean | null | undefined,
): string {
  const normalized = state?.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (executionGradeAllowed === false && (normalized === "fresh" || normalized === "aging")) {
    return "degraded truth";
  }
  return normalized;
}

export function traderFreshnessLabel(
  minutes: number | null | undefined,
  state: string | null | undefined,
  executionGradeAllowed: boolean | null | undefined,
): string {
  return marketFreshnessLabel(minutes, traderFreshnessStateLabel(state, executionGradeAllowed));
}

export function aiProviderLabel(provider: string | null | undefined): string {
  switch (provider) {
    case "local":
      return "Local advisory";
    case "ollama":
      return "Ollama";
    case "openai":
      return "OpenAI";
    default:
      return plainStatusLabel(provider, "AI provider");
  }
}

export function aiProviderStatusLabel(status: string | null | undefined, provider: string | null | undefined = "openai"): string {
  if (provider === "local") {
    switch (status) {
      case "ready":
        return "Local ready";
      case "unavailable":
        return "Local unavailable";
      default:
        return plainStatusLabel(status, "Status unknown");
    }
  }
  if (provider === "ollama") {
    switch (status) {
      case "ready":
        return "Ollama ready";
      case "unavailable":
        return "Ollama unavailable";
      default:
        return plainStatusLabel(status, "Status unknown");
    }
  }
  switch (status) {
    case "connected":
      return "Connected";
    case "oauth_not_configured":
      return "OAuth not configured";
    case "auth_required":
      return "Connect OpenAI";
    case "session_expired":
      return "Session expired";
    case "auth_unavailable":
      return "Reconnect needed";
    default:
      return plainStatusLabel(status, "Status unknown");
  }
}

export function aiAnswerSourceLabel(
  answerSource: string | null | undefined,
  provider: string | null | undefined,
  connected = false,
): string {
  switch (answerSource) {
    case "ollama_response":
      return "Ollama response";
    case "openai_response":
      return "Live GPT response";
    case "local_fallback":
      return provider === "openai" && connected ? "Connected · local fallback" : "Local fallback";
    case "local_brief":
    default:
      return "Local advisory";
  }
}

export function aiRunModeLabel(runMode: string | null | undefined): string {
  switch (runMode) {
    case "desk_fast":
      return "Desk fast path";
    case "research_full":
      return "Research full path";
    default:
      return plainStatusLabel(runMode, "Run mode");
  }
}

export function aiRunStageLabel(runStage: string | null | undefined): string {
  switch (runStage) {
    case "queued":
      return "Queued";
    case "building_context":
    case "context_build":
      return "Building advisory context";
    case "running_model":
    case "model_inference":
      return "Running local inference";
    case "validating_output":
    case "finalizing":
      return "Finalizing advisory response";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return plainStatusLabel(runStage, "Running");
  }
}

export function aiRunStageGuidance(
  runStage: string | null | undefined,
  elapsedMs: number | null | undefined,
  statusNote: string | null | undefined,
): RunStageGuidanceView {
  const elapsed = Math.max(elapsedMs ?? 0, 0);
  const longRunning =
    elapsed > 45000
      ? "This run is still active. You can leave this tab and come back, or prepare another question after it finishes or fails."
      : elapsed > 15000
        ? "Local model work can take a little longer while it builds context or waits on inference. You can leave this tab and come back safely."
        : "This run is active and the screen will keep polling automatically. You can stay here or move to another workflow surface."

  switch (runStage) {
    case "queued":
      return {
        explanation:
          statusNote
          || "This run is queued behind local advisory work. Deterministic chart, signal, risk, and commodity truth remain authoritative while it waits.",
        nextStep: longRunning,
      };
    case "building_context":
    case "context_build":
      return {
        explanation:
          statusNote
          || "The desk is collecting chart, signal, risk, catalyst, and commodity-truth context before the memo or advisory response is written.",
        nextStep: longRunning,
      };
    case "running_model":
    case "model_inference":
      return {
        explanation:
          statusNote
          || "The local model is writing against the already-loaded desk context. Timing, risk, and truth still come from AI Trader, not the model.",
        nextStep: longRunning,
      };
    case "validating_output":
    case "finalizing":
      return {
        explanation:
          statusNote
          || "The response is being checked against delayed/public desk truth before it is shown in the UI.",
        nextStep: "Validation is the last step before handoff. You can wait here or come back once the run settles into history.",
      };
    case "failed":
      return {
        explanation: statusNote || "The advisory run failed before a validated response was ready.",
        nextStep: "Review the error, then retry once the current desk context looks healthy again.",
      };
    default:
      return {
        explanation:
          statusNote
          || "AI Trader is keeping the local workflow alive while this advisory run updates in the background.",
        nextStep: longRunning,
      };
  }
}

export function recentRunStageTrailLabel(stageHistory: RunStageEventView[] | null | undefined, limit = 4): string | null {
  if (!stageHistory || stageHistory.length === 0) {
    return null;
  }
  const visibleStages = stageHistory
    .slice(-limit)
    .map((item) => aiRunStageLabel(item.stage))
    .filter(Boolean);
  if (visibleStages.length === 0) {
    return null;
  }
  return visibleStages.join(" -> ");
}

export function durationLabel(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined || !Number.isFinite(latencyMs)) {
    return "Timing unavailable";
  }
  if (latencyMs < 1000) {
    return `${Math.max(Math.round(latencyMs), 0)}ms`;
  }
  const seconds = latencyMs / 1000;
  return `${seconds.toFixed(seconds >= 60 ? 0 : 1)}s`;
}

export function scenarioSourceStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "fresh":
      return "Scenario fresh";
    case "stale":
      return "Scenario stale";
    case "degraded":
      return "Scenario degraded";
    case "disabled":
      return "Scenario off";
    case "unavailable":
      return "Scenario unavailable";
    default:
      return plainStatusLabel(status, "Scenario unknown");
  }
}

export function aiAuthModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case "none":
      return "No auth";
    case "oauth":
      return "OpenAI OAuth";
    case "server_api_key":
      return "Server API key";
    case "api_key":
      return "API key";
    default:
      return plainStatusLabel(mode, "Auth mode");
  }
}

export function researchValidationLabel(status: string | null | undefined): string {
  switch (status) {
    case "validated":
      return "Validated";
    case "research_only":
      return "Research only";
    case "degraded_truth":
      return "Degraded truth";
    case "insufficient_context":
      return "Insufficient context";
    default:
      return plainStatusLabel(status, "Validation unknown");
  }
}

export function researchConfidenceLabel(value: string | null | undefined): string {
  switch (value) {
    case "operator_ready":
      return "Operator ready";
    case "research_only":
      return "Research only";
    case "hypothesis_only":
      return "Hypothesis only";
    default:
      return plainStatusLabel(value, "Confidence unknown");
  }
}

export function researchModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case "operator":
      return "Operator";
    case "research":
      return "Research synthesis";
    default:
      return plainStatusLabel(mode, "Research mode");
  }
}

export function sourceTypeLabel(value: string | null | undefined): string {
  switch (value) {
    case "proxy":
      return "Proxy context";
    case "fixture":
      return "Fixture context";
    case "public_live":
      return "Public live";
    case "broker_live":
      return "Broker live";
    default:
      return plainStatusLabel(value, "Unknown source");
  }
}

export function sourceTimingLabel(value: string | null | undefined): string {
  switch (value) {
    case "live":
      return "Live timing";
    case "near_live":
      return "Near-live timing";
    case "delayed":
      return "Delayed timing";
    case "end_of_day":
      return "End-of-day timing";
    case "fixture":
      return "Fixture timing";
    default:
      return plainStatusLabel(value, "Unknown timing");
  }
}

export function suitabilityLabel(value: string | null | undefined): string {
  switch (value) {
    case "intraday_suitable":
      return "Execution-capable";
    case "monitor_only":
      return "Monitor only";
    case "swing_only":
      return "Swing only";
    case "context_only":
      return "Context only";
    case "research_only":
      return "Research only";
    case "news_context_only":
      return "News context only";
    case "unusable":
      return "Not execution-grade";
    default:
      return plainStatusLabel(value, "Unknown");
  }
}

export function penaltyCodeLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    fixture_only: "Fixture only",
    fixture_source: "Fixture source",
    timing_fixture: "Fixture timing",
    proxy_grade_mapping: "Proxy mapping",
    timing_end_of_day: "End-of-day timing",
    tradable_mismatch: "Tradable mismatch",
    contextual_price_only: "Context-only price",
    timing_too_weak_for_intraday: "Timing too weak for intraday use",
    missing_cross_asset_confirmation: "Cross-asset confirmation missing",
    weak_oil_realism: "Oil realism weak",
    oil_release_window_proxy: "Oil release window proxy",
  };
  return labels[value ?? ""] ?? plainStatusLabel(value, "Penalty");
}

export function checklistLabel(key: string): string {
  const labels: Record<string, string> = {
    freshness_acceptable: "Freshness acceptable",
    realism_acceptable: "Reality acceptable",
    risk_budget_available: "Risk budget available",
    cluster_exposure_acceptable: "Cluster exposure acceptable",
    review_complete: "Review complete",
    operator_acknowledged: "Operator acknowledged",
    completed: "Checklist complete",
  };
  return labels[key] ?? titleCase(key);
}

export function proposalStateLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    proposed: "Proposed",
    opened: "Active",
    scaled_in: "Scaled in",
    partially_exited: "Partially exited",
    closed_win: "Closed win",
    closed_loss: "Closed loss",
    invalidated: "Invalidated",
    timed_out: "Timed out",
    cancelled: "Cancelled",
    ready_for_review: "Ready for review",
    approved: "Approved",
    rejected: "Rejected",
    expired: "Expired",
    shadow_active: "Shadow active",
  };
  return labels[status ?? ""] ?? plainStatusLabel(status, "Unknown");
}

export function signalAgeLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return "unknown";
  }
  return `${minutes}m old`;
}

export function chartStateLabel(status: string | null | undefined): string {
  switch (status) {
    case "ok":
      return "usable";
    case "stale":
      return "stale";
    case "degraded":
      return "degraded";
    case "unusable":
      return "unusable";
    case "no_data":
      return "no data";
    default:
      return status ? titleCase(status).toLowerCase() : "unknown";
  }
}

export function dataQualityLabel(value: string | null | undefined): string {
  switch (value) {
    case "live":
      return "live-validated bars";
    case "fixture":
      return "fixture bars";
    case "proxy":
      return "proxy-grade bars";
    case "sample":
      return "sample bars";
    case "paper":
      return "paper-sim";
    default:
      return value ? titleCase(value) : "Unknown";
  }
}

export function alertMetaLabel(item: Pick<AlertEnvelope, "severity" | "category">): string {
  const severity = titleCase(item.severity || "info");
  const category = {
    stale_data_warning: "stale data",
    signal_ranked: "ranked signal",
    high_risk_signal: "high-risk signal",
    scout_to_focus_promotion: "focus promotion",
    risk_budget_breach: "risk budget",
    daily_digest_summary: "daily digest",
    paper_trade_review_due: "paper-trade review",
  }[item.category] ?? titleCase(item.category).toLowerCase();
  return `${severity} · ${category}`;
}
