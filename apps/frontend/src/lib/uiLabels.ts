import type { AlertEnvelope } from "../types/api";

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
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
