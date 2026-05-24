import type {
  CommodityTruthStatusView,
  DataRealityView,
  InstrumentMappingView,
  MarketChartView,
  RecoveryTelemetryView,
} from "../types/api";
import {
  commodityTruthStateLabel,
  commodityTruthSummaryLabel,
  marketFreshnessLabel,
  recoveryReasonLabel,
  recoveryStatusLabel,
  sourceTimingLabel,
  sourceTypeLabel,
  titleCase,
  traderFreshnessLabel,
} from "./uiLabels";

export interface RealityStripSlot {
  label: "Truth" | "Freshness" | "Source" | "Reality" | "Recovery";
  value: string;
  note: string;
  tone: "active" | "warning" | "neutral";
}

export interface RealityStripModel {
  slots: RealityStripSlot[];
}

interface ResolveRealityStripInput {
  chart?: Pick<MarketChartView, "freshness_minutes" | "freshness_state" | "status_note"> | null;
  commodityTruth?: CommodityTruthStatusView | null;
  reality?: DataRealityView | null;
  recovery?: RecoveryTelemetryView | null;
  mapping?: Pick<InstrumentMappingView, "trader_symbol" | "research_symbol"> | null;
}

function recoveryTone(recovery: RecoveryTelemetryView | null | undefined): "active" | "warning" | "neutral" {
  if (recovery?.recovery_active) {
    return "warning";
  }
  if (recovery?.truth_state === "ready_current") {
    return "active";
  }
  return "neutral";
}

function truthTone(truth: CommodityTruthStatusView | null | undefined): "active" | "warning" | "neutral" {
  if (!truth) {
    return "neutral";
  }
  if (truth.truth_state === "ready_current") {
    return "active";
  }
  return "warning";
}

function realityTone(reality: DataRealityView | null | undefined): "active" | "warning" | "neutral" {
  if (!reality) {
    return "neutral";
  }
  return reality.execution_grade_allowed ? "active" : "warning";
}

function truthFromRecovery(recovery: RecoveryTelemetryView): CommodityTruthStatusView {
  return {
    truth_state: recovery.truth_state,
    truth_label: recovery.truth_label,
    truth_note: recovery.recovery_reason ? recoveryReasonLabel(recovery.recovery_reason) : recovery.truth_label,
    last_verified_at: null,
    last_verified_age_minutes: null,
    recovery_in_progress: recovery.recovery_active ?? false,
    blocking_reason: recovery.blocking_reason ?? undefined,
  };
}

export function resolveRealityStrip({
  chart,
  commodityTruth,
  reality,
  recovery,
  mapping,
}: ResolveRealityStripInput): RealityStripModel {
  const effectiveTruth = commodityTruth ?? (recovery ? truthFromRecovery(recovery) : null);
  const freshnessValue = reality
    ? traderFreshnessLabel(
      chart?.freshness_minutes ?? reality.freshness_minutes,
      chart?.freshness_state ?? reality.freshness_state,
      reality.execution_grade_allowed,
    )
    : marketFreshnessLabel(chart?.freshness_minutes ?? null, chart?.freshness_state ?? "unknown");
  const freshnessNote = commodityTruth?.last_verified_age_minutes !== null && commodityTruth?.last_verified_age_minutes !== undefined
    ? `Last verified ${commodityTruth.last_verified_age_minutes}m ago`
    : chart?.status_note ?? reality?.timing_semantics_note ?? "Awaiting first verified check.";
  const sourceValue = reality
    ? `${sourceTypeLabel(reality.provenance.source_type)} / ${sourceTimingLabel(reality.provenance.source_timing)}`
    : "Desk-wide delayed/public context";
  const sourceNote = reality
    ? `${mapping?.trader_symbol ?? reality.provenance.tradable_symbol} trader-facing${mapping?.research_symbol || reality.provenance.research_symbol ? ` / ${mapping?.research_symbol ?? reality.provenance.research_symbol} research` : ""}`
    : `${mapping?.trader_symbol ?? "Trader symbol"} board posture`;
  const realityValue = reality
    ? `${reality.provenance.realism_grade} / ${reality.execution_grade_allowed ? "paper-timing usable" : "non-execution-grade"}`
    : "Advisory-only desk truth";
  const realityNote = reality
    ? reality.tradable_alignment_note || reality.ui_warning
    : "Delayed/public desk context stays advisory-only and non-execution-grade.";
  const recoveryValue = recovery
    ? recoveryStatusLabel(recovery)
    : effectiveTruth?.recovery_in_progress
      ? "Recovery active"
      : effectiveTruth
        ? "No active recovery"
        : "Recovery telemetry pending";
  const recoveryNote = recovery?.blocking_reason
    ? `Blocking reason: ${titleCase(recovery.blocking_reason)}`
    : recovery?.recovery_reason
      ? recoveryReasonLabel(recovery.recovery_reason)
      : effectiveTruth?.blocking_reason
        ? `Blocking reason: ${titleCase(effectiveTruth.blocking_reason)}`
        : effectiveTruth
          ? "No active recovery."
          : "Awaiting recovery telemetry.";

  return {
    slots: [
      {
        label: "Truth",
        value: effectiveTruth ? commodityTruthStateLabel(effectiveTruth) : "Truth pending",
        note: effectiveTruth ? commodityTruthSummaryLabel(effectiveTruth) : "Commodity truth has not loaded yet.",
        tone: truthTone(effectiveTruth),
      },
      {
        label: "Freshness",
        value: freshnessValue,
        note: freshnessNote,
        tone: realityTone(reality),
      },
      {
        label: "Source",
        value: sourceValue,
        note: sourceNote,
        tone: "neutral",
      },
      {
        label: "Reality",
        value: realityValue,
        note: realityNote,
        tone: realityTone(reality),
      },
      {
        label: "Recovery",
        value: recoveryValue,
        note: recoveryNote,
        tone: recoveryTone(recovery),
      },
    ],
  };
}
