import { formatDateTimeIST } from "./time";

export interface WorkflowIdentityShape {
  symbol: string;
  family: string;
  side: string;
  lifecycle: string;
  accountabilityState?: string | null;
  timestamp?: string | null;
  compactId?: string | null;
}

function accountabilityKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSymbol(symbol: string | null | undefined): string {
  return (symbol ?? "").toUpperCase();
}

const FAMILY_LABEL_ALIASES: Record<string, string> = {
  commodity_truth_loop_seed_v1: "Commodity truth loop",
  mean_reversion_fade: "Mean reversion fade",
};

export function operatorFamilyLabel(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return "manual";
  }
  if (FAMILY_LABEL_ALIASES[normalized]) {
    return FAMILY_LABEL_ALIASES[normalized];
  }
  return normalized
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function duplicateWorkflowSymbols(rows: WorkflowIdentityShape[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeSymbol(row.symbol);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function workflowIdentityBaseKey(row: WorkflowIdentityShape): string {
  return [
    normalizeSymbol(row.symbol),
    operatorFamilyLabel(row.family),
    row.side,
    row.lifecycle,
    accountabilityKey(row.accountabilityState),
  ].join("|");
}

export function duplicateWorkflowIdentityBases(rows: WorkflowIdentityShape[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = workflowIdentityBaseKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function compactWorkflowId(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function workflowIdentityLabel(
  row: WorkflowIdentityShape,
  duplicateSymbols: Set<string>,
  mode: "ticket" | "journal" | "trade",
  duplicateBaseIdentities: Set<string> = new Set<string>(),
): string {
  const identity = [row.symbol, operatorFamilyLabel(row.family), row.side, row.lifecycle];
  if (row.accountabilityState && row.accountabilityState !== row.lifecycle) {
    identity.push(row.accountabilityState);
  }
  if (!duplicateSymbols.has(normalizeSymbol(row.symbol))) {
    return identity.join(" / ");
  }
  if (!duplicateBaseIdentities.has(workflowIdentityBaseKey(row))) {
    return identity.join(" / ");
  }
  if (mode === "ticket" && row.compactId) {
    identity.push(row.compactId);
  } else if (row.timestamp) {
    identity.push(formatDateTimeIST(row.timestamp));
  }
  return identity.join(" / ");
}
