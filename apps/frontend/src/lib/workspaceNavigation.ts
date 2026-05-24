import type { OperatorWireItemView, ReviewTaskView } from "../types/api";

export const WORKSPACE_TABS = [
  "desk",
  "signals",
  "high_risk",
  "research",
  "news",
  "polymarket",
  "ai_desk",
  "active_trades",
  "wallet_balance",
  "watchlist",
  "strategy_lab",
  "backtests",
  "risk",
  "journal",
  "session",
  "replay",
  "trade_tickets",
  "pilot_ops",
] as const;

export const WORKSPACE_TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;

export type WorkspaceTabKey = (typeof WORKSPACE_TABS)[number];
export type WorkspaceTimeframe = (typeof WORKSPACE_TIMEFRAMES)[number];

export interface WorkspaceRouteState {
  tab: WorkspaceTabKey;
  symbol: string | null;
  signalId: string | null;
  riskReportId: string | null;
  tradeId: string | null;
  ticketId: string | null;
  reviewTaskId: string | null;
  timeframe: WorkspaceTimeframe;
}

export interface WorkspaceTarget {
  tab?: WorkspaceTabKey | null;
  symbol?: string | null;
  signalId?: string | null;
  riskReportId?: string | null;
  tradeId?: string | null;
  ticketId?: string | null;
  reviewTaskId?: string | null;
  timeframe?: string | null;
}

export const DEFAULT_WORKSPACE_ROUTE: WorkspaceRouteState = {
  tab: "desk",
  symbol: null,
  signalId: null,
  riskReportId: null,
  tradeId: null,
  ticketId: null,
  reviewTaskId: null,
  timeframe: "1d",
};

function cleanString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isWorkspaceTabKey(value: string | null | undefined): value is WorkspaceTabKey {
  return Boolean(value) && WORKSPACE_TABS.includes(value as WorkspaceTabKey);
}

export function isWorkspaceTimeframe(value: string | null | undefined): value is WorkspaceTimeframe {
  return Boolean(value) && WORKSPACE_TIMEFRAMES.includes(value as WorkspaceTimeframe);
}

export function normalizeWorkspaceRoute(input: Partial<WorkspaceRouteState> | null | undefined): WorkspaceRouteState {
  const tab = isWorkspaceTabKey(input?.tab ?? null) ? input?.tab ?? "desk" : "desk";
  const timeframe = isWorkspaceTimeframe(input?.timeframe ?? null) ? input?.timeframe ?? "1d" : "1d";

  return {
    tab,
    symbol: cleanString(input?.symbol),
    signalId: cleanString(input?.signalId),
    riskReportId: cleanString(input?.riskReportId),
    tradeId: cleanString(input?.tradeId),
    ticketId: cleanString(input?.ticketId),
    reviewTaskId: cleanString(input?.reviewTaskId),
    timeframe,
  };
}

export function parseWorkspaceRoute(search: string): Partial<WorkspaceRouteState> {
  const params = new URLSearchParams(search);
  const rawTab = params.get("tab");
  const rawTimeframe = params.get("tf");
  return {
    tab: (rawTab ?? undefined) as WorkspaceTabKey | undefined,
    symbol: params.get("symbol"),
    signalId: params.get("signal"),
    riskReportId: params.get("risk"),
    tradeId: params.get("trade"),
    ticketId: params.get("ticket"),
    reviewTaskId: params.get("review"),
    timeframe: (rawTimeframe ?? undefined) as WorkspaceTimeframe | undefined,
  };
}

export function workspaceStateEquals(left: Partial<WorkspaceRouteState>, right: Partial<WorkspaceRouteState>): boolean {
  const normalizedLeft = normalizeWorkspaceRoute(left);
  const normalizedRight = normalizeWorkspaceRoute(right);
  return (
    normalizedLeft.tab === normalizedRight.tab
    && normalizedLeft.symbol === normalizedRight.symbol
    && normalizedLeft.signalId === normalizedRight.signalId
    && normalizedLeft.riskReportId === normalizedRight.riskReportId
    && normalizedLeft.tradeId === normalizedRight.tradeId
    && normalizedLeft.ticketId === normalizedRight.ticketId
    && normalizedLeft.reviewTaskId === normalizedRight.reviewTaskId
    && normalizedLeft.timeframe === normalizedRight.timeframe
  );
}

export function resolveWorkspaceTarget(
  target: WorkspaceTarget,
  baseState: Partial<WorkspaceRouteState> | null | undefined = DEFAULT_WORKSPACE_ROUTE,
): WorkspaceRouteState {
  const base = normalizeWorkspaceRoute(baseState);
  return normalizeWorkspaceRoute({
    tab: target.tab === undefined ? base.tab : target.tab ?? DEFAULT_WORKSPACE_ROUTE.tab,
    symbol: target.symbol === undefined ? base.symbol : target.symbol,
    signalId: target.signalId === undefined ? base.signalId : target.signalId,
    riskReportId: target.riskReportId === undefined ? base.riskReportId : target.riskReportId,
    tradeId: target.tradeId === undefined ? base.tradeId : target.tradeId,
    ticketId: target.ticketId === undefined ? base.ticketId : target.ticketId,
    reviewTaskId: target.reviewTaskId === undefined ? base.reviewTaskId : target.reviewTaskId,
    timeframe:
      target.timeframe === undefined
        ? base.timeframe
        : isWorkspaceTimeframe(target.timeframe)
          ? target.timeframe
          : undefined,
  });
}

export function buildWorkspaceHref(
  target: WorkspaceTarget,
  options?: {
    pathname?: string;
    baseState?: Partial<WorkspaceRouteState> | null;
  },
): string {
  const pathname = options?.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const state = resolveWorkspaceTarget(target, options?.baseState);
  const params = new URLSearchParams();
  params.set("tab", state.tab);
  if (state.symbol) {
    params.set("symbol", state.symbol);
  }
  if (state.signalId) {
    params.set("signal", state.signalId);
  }
  if (state.riskReportId) {
    params.set("risk", state.riskReportId);
  }
  if (state.tradeId) {
    params.set("trade", state.tradeId);
  }
  if (state.ticketId) {
    params.set("ticket", state.ticketId);
  }
  if (state.reviewTaskId) {
    params.set("review", state.reviewTaskId);
  }
  if (state.timeframe) {
    params.set("tf", state.timeframe);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function workspaceTabTarget(
  tab: WorkspaceTabKey,
  context: Omit<WorkspaceTarget, "tab"> = {},
): WorkspaceTarget {
  return {
    tab,
    ...context,
  };
}

export function assetWorkspaceTarget(context: Omit<WorkspaceTarget, "tab" | "ticketId"> = {}): WorkspaceTarget {
  return workspaceTabTarget("desk", { ...context, ticketId: null });
}

export function signalContextTarget(context: Omit<WorkspaceTarget, "tab" | "ticketId" | "tradeId"> = {}): WorkspaceTarget {
  return workspaceTabTarget("signals", { ...context, ticketId: null, tradeId: null });
}

export function riskContextTarget(context: Omit<WorkspaceTarget, "tab" | "ticketId" | "tradeId"> = {}): WorkspaceTarget {
  return workspaceTabTarget("risk", { ...context, ticketId: null, tradeId: null });
}

export function tradeThreadTarget(context: Omit<WorkspaceTarget, "tab" | "ticketId"> = {}): WorkspaceTarget {
  return workspaceTabTarget("active_trades", { ...context, ticketId: null });
}

export function reviewQueueTarget(context: Omit<WorkspaceTarget, "tab" | "ticketId"> = {}): WorkspaceTarget {
  return workspaceTabTarget("session", { ...context, ticketId: null });
}

export function operatorWireTarget(item: OperatorWireItemView, fallbackSymbol?: string | null): WorkspaceTarget {
  const symbol = cleanString(item.symbol) ?? cleanString(fallbackSymbol) ?? undefined;
  const targetTab = isWorkspaceTabKey(item.target_tab ?? null) ? item.target_tab : null;

  if (item.trade_id) {
    return workspaceTabTarget((targetTab ?? "active_trades") as WorkspaceTabKey, {
      symbol,
      signalId: item.signal_id ?? null,
      riskReportId: item.risk_report_id ?? null,
      tradeId: item.trade_id,
      ticketId: null,
      reviewTaskId: null,
    });
  }
  if (targetTab === "journal") {
    return workspaceTabTarget("journal", {
      symbol,
      signalId: item.signal_id ?? null,
      riskReportId: item.risk_report_id ?? null,
      tradeId: item.trade_id ?? null,
      ticketId: null,
      reviewTaskId: null,
    });
  }
  if (item.risk_report_id) {
    return riskContextTarget({
      symbol,
      signalId: item.signal_id ?? null,
      riskReportId: item.risk_report_id,
    });
  }
  if (item.signal_id) {
    return signalContextTarget({
      symbol,
      signalId: item.signal_id,
      riskReportId: item.risk_report_id ?? null,
    });
  }
  if (isWorkspaceTabKey(item.target_tab ?? null)) {
    return workspaceTabTarget(targetTab as WorkspaceTabKey, {
      symbol,
      signalId: item.signal_id ?? null,
      riskReportId: item.risk_report_id ?? null,
      tradeId: item.trade_id ?? null,
      reviewTaskId: null,
      ticketId: null,
    });
  }
  return assetWorkspaceTarget({
    symbol,
    signalId: item.signal_id ?? null,
    riskReportId: item.risk_report_id ?? null,
    tradeId: item.trade_id ?? null,
  });
}

export function reviewTaskPrimaryTarget(task: ReviewTaskView, fallbackSymbol?: string | null): WorkspaceTarget {
  const symbol = cleanString(task.linked_symbol) ?? cleanString(fallbackSymbol) ?? undefined;
  const reviewContext = {
    symbol,
    signalId: task.signal_id ?? null,
    riskReportId: task.risk_report_id ?? null,
    tradeId: task.trade_id ?? null,
    reviewTaskId: task.task_id,
    ticketId: null,
  } satisfies Omit<WorkspaceTarget, "tab">;
  const reviewSurfaceContext = {
    symbol,
    signalId: task.signal_id ?? null,
    riskReportId: task.risk_report_id ?? null,
    reviewTaskId: task.task_id,
    ticketId: null,
  } satisfies Omit<WorkspaceTarget, "tab" | "tradeId">;

  if (task.trade_id && task.task_type === "post_trade_review_due") {
    return workspaceTabTarget("journal", reviewContext);
  }
  if (task.linked_entity_type === "paper_trade_review" && task.linked_entity_id) {
    return workspaceTabTarget("journal", { ...reviewContext, tradeId: task.linked_entity_id });
  }
  if (task.trade_id) {
    return tradeThreadTarget(reviewContext);
  }
  if (task.signal_id) {
    return signalContextTarget(reviewSurfaceContext);
  }
  if (task.risk_report_id) {
    return riskContextTarget(reviewSurfaceContext);
  }
  if (symbol) {
    return workspaceTabTarget("watchlist", reviewContext);
  }
  return reviewQueueTarget(reviewContext);
}

export function reviewTaskAssetTarget(
  task: ReviewTaskView,
  fallbackSymbol?: string | null,
  timeframe?: WorkspaceTimeframe | null,
): WorkspaceTarget {
  return assetWorkspaceTarget({
    symbol: cleanString(task.linked_symbol) ?? cleanString(fallbackSymbol) ?? undefined,
    signalId: task.signal_id ?? null,
    riskReportId: task.risk_report_id ?? null,
    tradeId: task.trade_id ?? null,
    reviewTaskId: task.task_id,
    timeframe,
  });
}
