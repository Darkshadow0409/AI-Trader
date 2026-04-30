import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, type ReactNode } from "react";
import { parseTimestampMs } from "../lib/time";
import type {
  BarView,
  ChartIndicatorPointView,
  ChartOverlayLineView,
  ChartOverlayMarkerView,
  ChartOverlayZoneView,
  MarketChartView,
  PaperTradeDetailView,
  RiskDetailView,
  SignalDetailView,
  TradeTicketDetailView,
} from "../types/api";

interface BuildLightweightChartModelArgs {
  chart: MarketChartView;
  selectedSignal?: SignalDetailView | null;
  selectedRisk?: RiskDetailView | null;
  selectedTicket?: TradeTicketDetailView | null;
  selectedTrade?: PaperTradeDetailView | null;
}

export interface LightweightChartModel {
  validBars: BarView[];
  malformedBarCount: number;
  latestBar: BarView | null;
  ema20Points: ChartIndicatorPointView[];
  ema50Points: ChartIndicatorPointView[];
  ema200Points: ChartIndicatorPointView[];
  rsiPoints: ChartIndicatorPointView[];
  atrPoints: ChartIndicatorPointView[];
  effectiveLines: ChartOverlayLineView[];
  effectiveMarkers: ChartOverlayMarkerView[];
  effectiveZones: ChartOverlayZoneView[];
}

interface LightweightChartAdapterProps {
  model: LightweightChartModel;
  canRenderChart: boolean;
  showVolume: boolean;
  showRsi: boolean;
  showAtr: boolean;
  showEma20: boolean;
  showEma50: boolean;
  showEma200: boolean;
  showMarkers: boolean;
  showLevels: boolean;
  showZones: boolean;
  overlay?: ReactNode;
  onHoverBarChange: (bar: BarView | null) => void;
}

function toChartTime(timestamp: string): UTCTimestamp {
  return Math.floor((parseTimestampMs(timestamp) ?? 0) / 1000) as UTCTimestamp;
}

function validIndicatorPoints(points: ChartIndicatorPointView[]) {
  return points.filter((point) => parseTimestampMs(point.timestamp) !== null && Number.isFinite(point.value));
}

function validZoneBounds(zone: Record<string, unknown> | undefined | null): [number, number] | null {
  if (!zone) {
    return null;
  }
  const low = typeof zone.low === "number" ? zone.low : typeof zone.min === "number" ? zone.min : null;
  const high = typeof zone.high === "number" ? zone.high : typeof zone.max === "number" ? zone.max : null;
  if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high)) {
    return null;
  }
  const lower = Math.min(low, high);
  const upper = Math.max(low, high);
  return lower === upper ? null : [lower, upper];
}

function dedupeById<T extends { [key in K]: string }, K extends keyof T>(rows: T[], key: K): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = row[key];
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function lineColor(tone: string, options: { zone?: boolean } = {}): string {
  const zone = options.zone ?? false;
  if (tone === "negative") {
    return zone ? "rgba(255, 111, 97, 0.28)" : "#ff6f61";
  }
  if (tone === "positive") {
    return zone ? "rgba(33, 199, 122, 0.28)" : "#21c77a";
  }
  return zone ? "rgba(122, 215, 255, 0.24)" : "#7ad7ff";
}

function createLinePoints(points: ChartIndicatorPointView[]) {
  return points.map((point) => ({ time: toChartTime(point.timestamp), value: point.value }));
}

export function buildLightweightChartModel({
  chart,
  selectedSignal,
  selectedRisk,
  selectedTicket,
  selectedTrade,
}: BuildLightweightChartModelArgs): LightweightChartModel {
  const validBars = chart.bars.filter(
    (bar) =>
      parseTimestampMs(bar.timestamp) !== null &&
      [bar.open, bar.high, bar.low, bar.close, bar.volume].every((value) => Number.isFinite(value)),
  );

  const effectiveLines: ChartOverlayLineView[] = [...chart.overlays.price_lines];
  const effectiveMarkers: ChartOverlayMarkerView[] = [...chart.overlays.markers];
  const effectiveZones: ChartOverlayZoneView[] = [...(chart.overlays.zones ?? [])];

  if (selectedSignal) {
    effectiveLines.push(
      {
        line_id: `signal-invalidation-${selectedSignal.signal_id}`,
        label: "signal invalidation",
        value: selectedSignal.invalidation,
        kind: "invalidation",
        tone: "warning",
      },
      {
        line_id: `signal-target-${selectedSignal.signal_id}`,
        label: "target base",
        value: selectedSignal.targets.base,
        kind: "target",
        tone: "positive",
      },
    );
    if (selectedSignal.targets.stretch) {
      effectiveLines.push({
        line_id: `signal-stretch-${selectedSignal.signal_id}`,
        label: "target stretch",
        value: selectedSignal.targets.stretch,
        kind: "target",
        tone: "positive",
      });
    }
    const signalZone = validZoneBounds(selectedSignal.features.entry_zone as Record<string, unknown> | undefined);
    if (signalZone) {
      effectiveZones.push({
        zone_id: `signal-zone-${selectedSignal.signal_id}`,
        label: "signal entry zone",
        low: signalZone[0],
        high: signalZone[1],
        kind: "entry_zone",
        tone: "accent",
      });
    }
  }
  if (selectedRisk) {
    effectiveLines.push({
      line_id: `risk-stop-${selectedRisk.risk_report_id}`,
      label: "risk stop",
      value: selectedRisk.stop_price,
      kind: "stop",
      tone: "negative",
    });
    const entryReference = typeof selectedRisk.report.entry_reference === "number" ? selectedRisk.report.entry_reference : null;
    if (entryReference !== null) {
      effectiveLines.push({
        line_id: `risk-entry-${selectedRisk.risk_report_id}`,
        label: "entry reference",
        value: entryReference,
        kind: "entry",
        tone: "accent",
      });
    }
    const riskZone = validZoneBounds(selectedRisk.report.entry_zone as Record<string, unknown> | undefined);
    if (riskZone) {
      effectiveZones.push({
        zone_id: `risk-zone-${selectedRisk.risk_report_id}`,
        label: "risk entry zone",
        low: riskZone[0],
        high: riskZone[1],
        kind: "entry_zone",
        tone: "accent",
      });
    }
  }
  if (selectedTicket) {
    const ticketZone = validZoneBounds(selectedTicket.proposed_entry_zone);
    if (ticketZone) {
      effectiveZones.push({
        zone_id: `ticket-zone-${selectedTicket.ticket_id}`,
        label: "ticket entry zone",
        low: ticketZone[0],
        high: ticketZone[1],
        kind: "entry_zone",
        tone: "accent",
      });
    }
    effectiveLines.push({
      line_id: `ticket-stop-${selectedTicket.ticket_id}`,
      label: "ticket stop",
      value: selectedTicket.planned_stop,
      kind: "stop",
      tone: "negative",
    });
    Object.entries(selectedTicket.planned_targets).forEach(([key, value]) => {
      effectiveLines.push({
        line_id: `ticket-target-${selectedTicket.ticket_id}-${key}`,
        label: `ticket ${key}`,
        value,
        kind: "target",
        tone: "positive",
      });
    });
  }
  if (selectedTrade) {
    const tradeZone = validZoneBounds(selectedTrade.proposed_entry_zone);
    if (tradeZone) {
      effectiveZones.push({
        zone_id: `trade-zone-${selectedTrade.trade_id}`,
        label: "trade entry zone",
        low: tradeZone[0],
        high: tradeZone[1],
        kind: "entry_zone",
        tone: "accent",
      });
    }
    if (selectedTrade.actual_entry !== null) {
      effectiveLines.push({
        line_id: `trade-entry-${selectedTrade.trade_id}`,
        label: "trade entry",
        value: selectedTrade.actual_entry,
        kind: "trade_entry",
        tone: "accent",
      });
    }
    effectiveLines.push({
      line_id: `trade-stop-${selectedTrade.trade_id}`,
      label: "trade stop",
      value: selectedTrade.stop,
      kind: "stop",
      tone: "negative",
    });
    Object.entries(selectedTrade.targets).forEach(([key, value]) => {
      effectiveLines.push({
        line_id: `trade-target-${selectedTrade.trade_id}-${key}`,
        label: `trade ${key}`,
        value,
        kind: "target",
        tone: "positive",
      });
    });
  }

  if (selectedSignal) {
    effectiveMarkers.push({
      marker_id: `selected-signal-${selectedSignal.signal_id}`,
      timestamp: selectedSignal.timestamp,
      label: selectedSignal.signal_type,
      kind: "signal",
      tone: "accent",
    });
  }
  if (selectedTicket) {
    effectiveMarkers.push({
      marker_id: `selected-ticket-${selectedTicket.ticket_id}`,
      timestamp: selectedTicket.created_at,
      label: `ticket ${selectedTicket.status}`,
      kind: "ticket",
      tone: "warning",
    });
  }
  if (selectedTrade?.opened_at) {
    effectiveMarkers.push({
      marker_id: `selected-trade-${selectedTrade.trade_id}`,
      timestamp: selectedTrade.opened_at,
      label: `trade ${selectedTrade.status}`,
      kind: "trade",
      tone: "positive",
    });
  }

  return {
    validBars,
    malformedBarCount: chart.bars.length - validBars.length,
    latestBar: validBars[validBars.length - 1] ?? null,
    ema20Points: validIndicatorPoints(chart.indicators.ema_20),
    ema50Points: validIndicatorPoints(chart.indicators.ema_50),
    ema200Points: validIndicatorPoints(chart.indicators.ema_200),
    rsiPoints: validIndicatorPoints(chart.indicators.rsi_14),
    atrPoints: validIndicatorPoints(chart.indicators.atr_14),
    effectiveLines: dedupeById(
      effectiveLines.filter((line) => Number.isFinite(line.value)),
      "line_id",
    ),
    effectiveMarkers: dedupeById(
      effectiveMarkers.filter((marker) => parseTimestampMs(marker.timestamp) !== null),
      "marker_id",
    ),
    effectiveZones: dedupeById(
      effectiveZones.filter((zone) => Number.isFinite(zone.low) && Number.isFinite(zone.high) && zone.low !== zone.high),
      "zone_id",
    ),
  };
}

export function LightweightChartAdapter({
  model,
  canRenderChart,
  showVolume,
  showRsi,
  showAtr,
  showEma20,
  showEma50,
  showEma200,
  showMarkers,
  showLevels,
  showZones,
  overlay,
  onHoverBarChange,
}: LightweightChartAdapterProps) {
  const mainRef = useRef<HTMLDivElement | null>(null);
  const rsiRef = useRef<HTMLDivElement | null>(null);
  const atrRef = useRef<HTMLDivElement | null>(null);

  const mainChartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const ema20SeriesRef = useRef<any>(null);
  const ema50SeriesRef = useRef<any>(null);
  const ema200SeriesRef = useRef<any>(null);
  const currentMainPriceLinesRef = useRef<any[]>([]);

  const rsiChartRef = useRef<any>(null);
  const rsiSeriesRef = useRef<any>(null);
  const atrChartRef = useRef<any>(null);
  const atrSeriesRef = useRef<any>(null);

  const modelRef = useRef(model);
  const hoverHandlerRef = useRef(onHoverBarChange);

  useEffect(() => {
    modelRef.current = model;
    hoverHandlerRef.current = onHoverBarChange;
  }, [model, onHoverBarChange]);

  useEffect(() => {
    onHoverBarChange(model.latestBar);
  }, [model.latestBar, onHoverBarChange]);

  function destroyMainChart() {
    currentMainPriceLinesRef.current = [];
    candleSeriesRef.current = null;
    volumeSeriesRef.current = null;
    ema20SeriesRef.current = null;
    ema50SeriesRef.current = null;
    ema200SeriesRef.current = null;
    mainChartRef.current?.remove();
    mainChartRef.current = null;
  }

  function destroyRsiChart() {
    rsiSeriesRef.current = null;
    rsiChartRef.current?.remove();
    rsiChartRef.current = null;
  }

  function destroyAtrChart() {
    atrSeriesRef.current = null;
    atrChartRef.current?.remove();
    atrChartRef.current = null;
  }

  function ensureMainChart() {
    if (mainChartRef.current || !mainRef.current) {
      return;
    }
    const commonLayout = {
      layout: {
        background: { type: ColorType.Solid, color: "#081117" },
        textColor: "#d8e3ed",
      },
      grid: {
        vertLines: { color: "#152530" },
        horzLines: { color: "#152530" },
      },
      rightPriceScale: { borderColor: "#27404d" },
      timeScale: { borderColor: "#27404d", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "#4a6864", width: 1, style: 0, labelBackgroundColor: "#132327" },
        horzLine: { color: "#4a6864", width: 1, style: 0, labelBackgroundColor: "#132327" },
      },
    } as const;
    const chart = createChart(mainRef.current, {
      ...commonLayout,
      autoSize: true,
      height: 360,
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#21c77a",
      downColor: "#ff6f61",
      borderVisible: false,
      wickUpColor: "#21c77a",
      wickDownColor: "#ff6f61",
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
    });
    volume.priceScale?.().applyOptions?.({ scaleMargins: { top: 0.78, bottom: 0 } });
    const ema20 = chart.addSeries(LineSeries, { color: "#f7d774", lineWidth: 2, crosshairMarkerVisible: false });
    const ema50 = chart.addSeries(LineSeries, { color: "#7ad7ff", lineWidth: 2, crosshairMarkerVisible: false });
    const ema200 = chart.addSeries(LineSeries, { color: "#b28cff", lineWidth: 2, crosshairMarkerVisible: false });
    chart.subscribeCrosshairMove((param: any) => {
      const point = param?.seriesData?.get?.(candles);
      if (!point) {
        hoverHandlerRef.current(modelRef.current.latestBar);
        return;
      }
      const matched = modelRef.current.validBars.find((bar) => toChartTime(bar.timestamp) === point.time) ?? null;
      hoverHandlerRef.current(matched);
    });
    mainChartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    ema20SeriesRef.current = ema20;
    ema50SeriesRef.current = ema50;
    ema200SeriesRef.current = ema200;
  }

  function ensureRsiChart() {
    if (rsiChartRef.current || !rsiRef.current) {
      return;
    }
    const chart = createChart(rsiRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#081117" },
        textColor: "#d8e3ed",
      },
      grid: {
        vertLines: { color: "#152530" },
        horzLines: { color: "#152530" },
      },
      rightPriceScale: { borderColor: "#27404d" },
      timeScale: { borderColor: "#27404d", timeVisible: true, secondsVisible: false },
      autoSize: true,
      height: 120,
    });
    const series = chart.addSeries(LineSeries, { color: "#f7d774", lineWidth: 2, crosshairMarkerVisible: false });
    series.createPriceLine({ price: 70, color: "#704f2e", lineWidth: 1, lineStyle: 2, title: "70" });
    series.createPriceLine({ price: 30, color: "#24565a", lineWidth: 1, lineStyle: 2, title: "30" });
    rsiChartRef.current = chart;
    rsiSeriesRef.current = series;
  }

  function ensureAtrChart() {
    if (atrChartRef.current || !atrRef.current) {
      return;
    }
    const chart = createChart(atrRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#081117" },
        textColor: "#d8e3ed",
      },
      grid: {
        vertLines: { color: "#152530" },
        horzLines: { color: "#152530" },
      },
      rightPriceScale: { borderColor: "#27404d" },
      timeScale: { borderColor: "#27404d", timeVisible: true, secondsVisible: false },
      autoSize: true,
      height: 120,
    });
    atrChartRef.current = chart;
    atrSeriesRef.current = chart.addSeries(LineSeries, { color: "#ff9f6e", lineWidth: 2, crosshairMarkerVisible: false });
  }

  function syncMainPriceLines(lines: ChartOverlayLineView[], zones: ChartOverlayZoneView[]) {
    if (!candleSeriesRef.current) {
      return;
    }
    currentMainPriceLinesRef.current.forEach((line) => {
      candleSeriesRef.current.removePriceLine?.(line);
    });
    currentMainPriceLinesRef.current = [];

    lines.forEach((line) => {
      const priceLine = candleSeriesRef.current.createPriceLine({
        price: line.value,
        color: lineColor(line.tone),
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: line.label,
      });
      currentMainPriceLinesRef.current.push(priceLine);
    });

    zones.forEach((zone) => {
      const lower = candleSeriesRef.current.createPriceLine({
        price: zone.low,
        color: lineColor(zone.tone, { zone: true }),
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: `${zone.label} low`,
      });
      const upper = candleSeriesRef.current.createPriceLine({
        price: zone.high,
        color: lineColor(zone.tone, { zone: true }),
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: `${zone.label} high`,
      });
      currentMainPriceLinesRef.current.push(lower, upper);
    });
  }

  useEffect(() => {
    return () => {
      destroyMainChart();
      destroyRsiChart();
      destroyAtrChart();
    };
  }, []);

  useEffect(() => {
    if (!canRenderChart) {
      destroyMainChart();
      destroyRsiChart();
      destroyAtrChart();
      return;
    }

    ensureMainChart();
    if (showRsi) {
      ensureRsiChart();
    } else {
      destroyRsiChart();
    }
    if (showAtr) {
      ensureAtrChart();
    } else {
      destroyAtrChart();
    }
  }, [canRenderChart, showAtr, showRsi]);

  useEffect(() => {
    if (!canRenderChart || !mainChartRef.current || !candleSeriesRef.current) {
      return;
    }

    candleSeriesRef.current.setData(
      model.validBars.map((bar) => ({
        time: toChartTime(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );
    volumeSeriesRef.current?.setData(
      showVolume
        ? model.validBars.map((bar) => ({
            time: toChartTime(bar.timestamp),
            value: bar.volume,
            color: bar.close >= bar.open ? "rgba(33, 199, 122, 0.45)" : "rgba(255, 111, 97, 0.45)",
          }))
        : [],
    );
    ema20SeriesRef.current?.setData(showEma20 ? createLinePoints(model.ema20Points) : []);
    ema50SeriesRef.current?.setData(showEma50 ? createLinePoints(model.ema50Points) : []);
    ema200SeriesRef.current?.setData(showEma200 ? createLinePoints(model.ema200Points) : []);
    syncMainPriceLines(showLevels ? model.effectiveLines : [], showZones ? model.effectiveZones : []);
    if (typeof candleSeriesRef.current.setMarkers === "function") {
      candleSeriesRef.current.setMarkers(
        (showMarkers ? model.effectiveMarkers : []).map((marker) => ({
          time: toChartTime(marker.timestamp),
          position: marker.kind === "trade" ? "belowBar" : "aboveBar",
          color: lineColor(marker.tone),
          shape: marker.kind === "ticket" ? "circle" : marker.kind === "trade" ? "square" : "arrowDown",
          text: marker.label,
        })),
      );
    }
    mainChartRef.current.timeScale().fitContent();
  }, [canRenderChart, model, showEma20, showEma50, showEma200, showLevels, showMarkers, showVolume, showZones]);

  useEffect(() => {
    if (!canRenderChart) {
      return;
    }
    if (showRsi && rsiSeriesRef.current) {
      rsiSeriesRef.current.setData(createLinePoints(model.rsiPoints));
      rsiChartRef.current?.timeScale().fitContent();
    }
    if (showAtr && atrSeriesRef.current) {
      atrSeriesRef.current.setData(createLinePoints(model.atrPoints));
      atrChartRef.current?.timeScale().fitContent();
    }
  }, [canRenderChart, model.atrPoints, model.rsiPoints, showAtr, showRsi]);

  return (
    <>
      <div className="chart-shell chart-shell-lg">
        <div className={canRenderChart ? "chart-canvas" : "chart-canvas chart-canvas-empty"} ref={mainRef} />
        {overlay}
      </div>
      {canRenderChart && showRsi ? <div className="chart-shell chart-shell-sm" data-testid="rsi-panel" ref={rsiRef} /> : null}
      {canRenderChart && showAtr ? <div className="chart-shell chart-shell-sm" data-testid="atr-panel" ref={atrRef} /> : null}
    </>
  );
}
