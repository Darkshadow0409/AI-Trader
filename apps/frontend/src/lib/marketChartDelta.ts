import { sameTerminalFocusSymbol } from "./terminalFocus";
import type {
  BarView,
  ChartIndicatorSetView,
  ChartOverlayLineView,
  ChartOverlayMarkerView,
  ChartOverlayView,
  ChartOverlayZoneView,
  ChartTailReplaceView,
  MarketChartDeltaMessage,
  MarketChartStreamMessage,
  MarketChartView,
} from "../types/api";

type DeltaApplyFailureReason =
  | "missing_base"
  | "stale_version"
  | "symbol_mismatch"
  | "timeframe_mismatch"
  | "invalid_tail";

export interface MarketChartDeltaApplyResult {
  accepted: boolean;
  chart?: MarketChartView;
  version?: number;
  shouldResync: boolean;
  reason?: DeltaApplyFailureReason;
}

const CHART_INDICATOR_KEYS: Array<keyof ChartIndicatorSetView> = ["ema_20", "ema_50", "ema_200", "rsi_14", "atr_14"];
const CHART_OVERLAY_KEYS: Array<keyof ChartOverlayView> = ["markers", "price_lines", "zones"];

export function applyMarketChartDelta({
  currentChart,
  currentVersion,
  message,
  requestedSymbol,
  requestedTimeframe,
}: {
  currentChart: MarketChartView | null;
  currentVersion: number | null;
  message: MarketChartDeltaMessage;
  requestedSymbol: string;
  requestedTimeframe: string;
}): MarketChartDeltaApplyResult {
  if (!sameTerminalFocusSymbol(message.symbol, requestedSymbol)) {
    return { accepted: false, shouldResync: false, reason: "symbol_mismatch" };
  }
  if (message.timeframe.toLowerCase() !== requestedTimeframe.toLowerCase()) {
    return { accepted: false, shouldResync: false, reason: "timeframe_mismatch" };
  }
  if (!currentChart || currentVersion === null) {
    return { accepted: false, shouldResync: true, reason: "missing_base" };
  }
  if (message.base_version !== currentVersion || message.version <= currentVersion) {
    return { accepted: false, shouldResync: true, reason: "stale_version" };
  }

  const nextBars = message.delta.bars
    ? applyTailReplace(currentChart.bars, message.delta.bars)
    : currentChart.bars;
  if (nextBars === null) {
    return { accepted: false, shouldResync: true, reason: "invalid_tail" };
  }

  const nextIndicators: ChartIndicatorSetView = { ...currentChart.indicators };
  for (const indicatorKey of CHART_INDICATOR_KEYS) {
    const indicatorDelta = message.delta.indicators?.[indicatorKey];
    if (!indicatorDelta) {
      continue;
    }
    const nextSeries = applyTailReplace(currentChart.indicators[indicatorKey], indicatorDelta);
    if (nextSeries === null) {
      return { accepted: false, shouldResync: true, reason: "invalid_tail" };
    }
    nextIndicators[indicatorKey] = nextSeries;
  }

  const nextOverlays: ChartOverlayView = {
    ...currentChart.overlays,
    ...(message.delta.overlays ?? {}),
  };
  for (const overlayKey of CHART_OVERLAY_KEYS) {
    const nextOverlayValue = message.delta.overlays?.[overlayKey];
    if (!nextOverlayValue) {
      continue;
    }
    if (overlayKey === "markers") {
      nextOverlays.markers = (nextOverlayValue as ChartOverlayMarkerView[]) ?? [];
      continue;
    }
    if (overlayKey === "price_lines") {
      nextOverlays.price_lines = (nextOverlayValue as ChartOverlayLineView[]) ?? [];
      continue;
    }
    nextOverlays.zones = (nextOverlayValue as ChartOverlayZoneView[]) ?? [];
  }

  return {
    accepted: true,
    shouldResync: false,
    version: message.version,
    chart: {
      ...currentChart,
      ...message.meta,
      bars: nextBars,
      indicators: nextIndicators,
      overlays: nextOverlays,
    },
  };
}

function applyTailReplace<T>(
  currentItems: T[],
  patch: ChartTailReplaceView<T>,
): T[] | null {
  if (patch.mode !== "tail_replace") {
    return null;
  }
  if (!Number.isInteger(patch.start_index) || patch.start_index < 0 || patch.start_index > currentItems.length) {
    return null;
  }
  return [...currentItems.slice(0, patch.start_index), ...patch.items];
}

export function buildMarketChartStreamMessage(
  payload: MarketChartView,
  version: number,
): MarketChartStreamMessage {
  return {
    type: "market_chart",
    symbol: payload.instrument_mapping.trader_symbol ?? payload.symbol,
    timeframe: payload.timeframe,
    version,
    payload,
  };
}

export function buildTailReplace<T>(items: T[], startIndex = 0): ChartTailReplaceView<T> {
  return {
    mode: "tail_replace",
    start_index: startIndex,
    items,
  };
}

export function appendBars(chart: MarketChartView, bars: BarView[]): MarketChartView {
  return {
    ...chart,
    bars: [...chart.bars, ...bars],
  };
}
