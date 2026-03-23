import type { WatchlistSummaryView } from "../types/api";

export const TERMINAL_FOCUS_ORDER = ["WTI", "GOLD", "SILVER", "BTC", "ETH", "DXY", "US10Y", "VIX"] as const;

export function terminalFocusPriority(symbol: string): number {
  const index = TERMINAL_FOCUS_ORDER.indexOf(symbol as (typeof TERMINAL_FOCUS_ORDER)[number]);
  return index === -1 ? TERMINAL_FOCUS_ORDER.length + 50 : index;
}

export function isPrimaryCommodity(symbol: string): boolean {
  return terminalFocusPriority(symbol) <= 2;
}

function freshnessRank(state: string): number {
  switch (state) {
    case "fresh":
      return 4;
    case "aging":
      return 3;
    case "stale":
      return 2;
    case "degraded":
      return 1;
    default:
      return 0;
  }
}

function realismRank(grade: string): number {
  switch (grade) {
    case "A":
      return 5;
    case "B":
      return 4;
    case "C":
      return 3;
    case "D":
      return 2;
    case "E":
      return 1;
    default:
      return 0;
  }
}

function marketModeRank(mode: string): number {
  switch (mode) {
    case "broker_live":
      return 3;
    case "public_live":
      return 2;
    case "fixture":
      return 1;
    default:
      return 0;
  }
}

export function preferredCommoditySymbol(rows: WatchlistSummaryView[]): string | null {
  if (rows.length === 0) {
    return null;
  }
  return [...rows]
    .sort((left, right) => {
      if (terminalFocusPriority(left.symbol) !== terminalFocusPriority(right.symbol)) {
        return terminalFocusPriority(left.symbol) - terminalFocusPriority(right.symbol);
      }
      const rightScore =
        marketModeRank(right.market_data_mode) * 1000
        + freshnessRank(right.freshness_state) * 100
        + realismRank(right.realism_grade) * 10
        - right.freshness_minutes / 1000;
      const leftScore =
        marketModeRank(left.market_data_mode) * 1000
        + freshnessRank(left.freshness_state) * 100
        + realismRank(left.realism_grade) * 10
        - left.freshness_minutes / 1000;
      return rightScore - leftScore;
    })[0]?.symbol ?? null;
}
