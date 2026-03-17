import { ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketChartView, PaperTradeDetailView, RiskDetailView, SignalDetailView, TradeTicketDetailView } from "../types/api";
import { StateBlock } from "./StateBlock";

interface PriceChartProps {
  chart: MarketChartView;
  timeframe: string;
  loading?: boolean;
  error?: string | null;
  onTimeframeChange: (timeframe: string) => void;
  selectedSignal?: SignalDetailView | null;
  selectedRisk?: RiskDetailView | null;
  selectedTicket?: TradeTicketDetailView | null;
  selectedTrade?: PaperTradeDetailView | null;
}

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];

function toChartTime(timestamp: string): UTCTimestamp {
  return Math.floor(new Date(timestamp).getTime() / 1000) as UTCTimestamp;
}

function midpoint(zone: Record<string, unknown> | undefined | null): number | null {
  if (!zone) {
    return null;
  }
  const low = typeof zone.low === "number" ? zone.low : typeof zone.min === "number" ? zone.min : null;
  const high = typeof zone.high === "number" ? zone.high : typeof zone.max === "number" ? zone.max : null;
  return low !== null && high !== null ? (low + high) / 2 : null;
}

export function PriceChart({
  chart,
  timeframe,
  loading,
  error,
  onTimeframeChange,
  selectedSignal,
  selectedRisk,
  selectedTicket,
  selectedTrade,
}: PriceChartProps) {
  const mainRef = useRef<HTMLDivElement | null>(null);
  const rsiRef = useRef<HTMLDivElement | null>(null);
  const atrRef = useRef<HTMLDivElement | null>(null);
  const [showVolume, setShowVolume] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showAtr, setShowAtr] = useState(true);
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [showEma200, setShowEma200] = useState(true);
  const [hoverBar, setHoverBar] = useState<MarketChartView["bars"][number] | null>(chart.bars[chart.bars.length - 1] ?? null);

  const effectiveLines = useMemo(() => {
    const lines = [...chart.overlays.price_lines];
    if (selectedSignal) {
      lines.push(
        { line_id: `signal-invalidation-${selectedSignal.signal_id}`, label: "signal invalidation", value: selectedSignal.invalidation, kind: "invalidation", tone: "warning" },
        { line_id: `signal-target-${selectedSignal.signal_id}`, label: "target base", value: selectedSignal.targets.base, kind: "target", tone: "positive" },
      );
      if (selectedSignal.targets.stretch) {
        lines.push({ line_id: `signal-stretch-${selectedSignal.signal_id}`, label: "target stretch", value: selectedSignal.targets.stretch, kind: "target", tone: "positive" });
      }
    }
    if (selectedRisk) {
      lines.push({ line_id: `risk-stop-${selectedRisk.risk_report_id}`, label: "risk stop", value: selectedRisk.stop_price, kind: "stop", tone: "negative" });
      const entryReference = typeof selectedRisk.report["entry_reference"] === "number" ? selectedRisk.report["entry_reference"] : null;
      if (entryReference !== null) {
        lines.push({ line_id: `risk-entry-${selectedRisk.risk_report_id}`, label: "entry reference", value: entryReference, kind: "entry", tone: "accent" });
      }
    }
    if (selectedTicket) {
      const zoneMid = midpoint(selectedTicket.proposed_entry_zone);
      if (zoneMid !== null) {
        lines.push({ line_id: `ticket-zone-${selectedTicket.ticket_id}`, label: "ticket zone", value: zoneMid, kind: "entry_zone", tone: "accent" });
      }
      lines.push({ line_id: `ticket-stop-${selectedTicket.ticket_id}`, label: "ticket stop", value: selectedTicket.planned_stop, kind: "stop", tone: "negative" });
      Object.entries(selectedTicket.planned_targets).forEach(([key, value]) => {
        lines.push({ line_id: `ticket-target-${selectedTicket.ticket_id}-${key}`, label: `ticket ${key}`, value, kind: "target", tone: "positive" });
      });
    }
    if (selectedTrade) {
      if (selectedTrade.actual_entry !== null) {
        lines.push({ line_id: `trade-entry-${selectedTrade.trade_id}`, label: "trade entry", value: selectedTrade.actual_entry, kind: "trade_entry", tone: "accent" });
      }
      lines.push({ line_id: `trade-stop-${selectedTrade.trade_id}`, label: "trade stop", value: selectedTrade.stop, kind: "stop", tone: "negative" });
      Object.entries(selectedTrade.targets).forEach(([key, value]) => {
        lines.push({ line_id: `trade-target-${selectedTrade.trade_id}-${key}`, label: `trade ${key}`, value, kind: "target", tone: "positive" });
      });
    }
    return lines;
  }, [chart.overlays.price_lines, selectedRisk, selectedSignal, selectedTicket, selectedTrade]);

  const effectiveMarkers = useMemo(() => {
    const markers = [...chart.overlays.markers];
    if (selectedSignal) {
      markers.push({ marker_id: `selected-signal-${selectedSignal.signal_id}`, timestamp: selectedSignal.timestamp, label: selectedSignal.signal_type, kind: "signal", tone: "accent" });
    }
    if (selectedTicket) {
      markers.push({ marker_id: `selected-ticket-${selectedTicket.ticket_id}`, timestamp: selectedTicket.created_at, label: `ticket ${selectedTicket.status}`, kind: "ticket", tone: "warning" });
    }
    if (selectedTrade?.opened_at) {
      markers.push({ marker_id: `selected-trade-${selectedTrade.trade_id}`, timestamp: selectedTrade.opened_at, label: `trade ${selectedTrade.status}`, kind: "trade", tone: "positive" });
    }
    return markers;
  }, [chart.overlays.markers, selectedSignal, selectedTicket, selectedTrade]);

  useEffect(() => {
    setHoverBar(chart.bars[chart.bars.length - 1] ?? null);
  }, [chart.bars]);

  useEffect(() => {
    if (!mainRef.current || chart.bars.length === 0 || loading || error) {
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

    const mainChart: any = createChart(mainRef.current, {
      ...commonLayout,
      autoSize: true,
      height: 360,
    });
    const candleSeries: any = mainChart.addCandlestickSeries({
      upColor: "#21c77a",
      downColor: "#ff6f61",
      borderVisible: false,
      wickUpColor: "#21c77a",
      wickDownColor: "#ff6f61",
    });
    candleSeries.setData(
      chart.bars.map((bar) => ({
        time: toChartTime(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );

    if (showVolume) {
      const volumeSeries: any = mainChart.addHistogramSeries({
        priceScaleId: "",
        priceFormat: { type: "volume" },
        scaleMargins: { top: 0.78, bottom: 0 },
      });
      volumeSeries.setData(
        chart.bars.map((bar) => ({
          time: toChartTime(bar.timestamp),
          value: bar.volume,
          color: bar.close >= bar.open ? "rgba(33, 199, 122, 0.45)" : "rgba(255, 111, 97, 0.45)",
        })),
      );
    }

    const emaSeriesConfigs = [
      { enabled: showEma20, data: chart.indicators.ema_20, color: "#f7d774" },
      { enabled: showEma50, data: chart.indicators.ema_50, color: "#7ad7ff" },
      { enabled: showEma200, data: chart.indicators.ema_200, color: "#b28cff" },
    ];
    emaSeriesConfigs.forEach((config) => {
      if (!config.enabled || config.data.length === 0) {
        return;
      }
      const lineSeries: any = mainChart.addLineSeries({ color: config.color, lineWidth: 2, crosshairMarkerVisible: false });
      lineSeries.setData(config.data.map((point) => ({ time: toChartTime(point.timestamp), value: point.value })));
    });

    effectiveLines.forEach((line) => {
      candleSeries.createPriceLine({
        price: line.value,
        color: line.tone === "negative" ? "#ff6f61" : line.tone === "positive" ? "#21c77a" : "#7ad7ff",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: line.label,
      });
    });

    if (typeof candleSeries.setMarkers === "function") {
      candleSeries.setMarkers(
        effectiveMarkers.map((marker) => ({
          time: toChartTime(marker.timestamp),
          position: marker.kind === "trade" ? "belowBar" : "aboveBar",
          color: marker.tone === "negative" ? "#ff6f61" : marker.tone === "positive" ? "#21c77a" : "#7ad7ff",
          shape: marker.kind === "ticket" ? "circle" : marker.kind === "trade" ? "square" : "arrowDown",
          text: marker.label,
        })),
      );
    }

    mainChart.subscribeCrosshairMove((param: any) => {
      const point = param?.seriesData?.get?.(candleSeries);
      if (!point) {
        setHoverBar(chart.bars[chart.bars.length - 1] ?? null);
        return;
      }
      const matched = chart.bars.find((bar) => toChartTime(bar.timestamp) === point.time) ?? null;
      setHoverBar(matched);
    });
    mainChart.timeScale().fitContent();

    let rsiChart: any = null;
    if (showRsi && rsiRef.current && chart.indicators.rsi_14.length > 0) {
      rsiChart = createChart(rsiRef.current, { ...commonLayout, autoSize: true, height: 120 });
      const rsiSeries: any = rsiChart.addLineSeries({ color: "#f7d774", lineWidth: 2, crosshairMarkerVisible: false });
      rsiSeries.setData(chart.indicators.rsi_14.map((point) => ({ time: toChartTime(point.timestamp), value: point.value })));
      rsiSeries.createPriceLine({ price: 70, color: "#704f2e", lineWidth: 1, lineStyle: 2, title: "70" });
      rsiSeries.createPriceLine({ price: 30, color: "#24565a", lineWidth: 1, lineStyle: 2, title: "30" });
      rsiChart.timeScale().fitContent();
    }

    let atrChart: any = null;
    if (showAtr && atrRef.current && chart.indicators.atr_14.length > 0) {
      atrChart = createChart(atrRef.current, { ...commonLayout, autoSize: true, height: 120 });
      const atrSeries: any = atrChart.addLineSeries({ color: "#ff9f6e", lineWidth: 2, crosshairMarkerVisible: false });
      atrSeries.setData(chart.indicators.atr_14.map((point) => ({ time: toChartTime(point.timestamp), value: point.value })));
      atrChart.timeScale().fitContent();
    }

    return () => {
      mainChart.remove();
      rsiChart?.remove();
      atrChart?.remove();
    };
  }, [chart, effectiveLines, effectiveMarkers, error, loading, showAtr, showEma20, showEma50, showEma200, showRsi, showVolume]);

  const unavailable = chart.status === "no_data";
  const stateLabel = error
    ? "Backend disconnected or chart data request failed."
    : unavailable
      ? chart.status_note
      : null;

  return (
    <div className="chart-workspace" data-testid="price-chart-workspace">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Chart Surface</p>
          <h3>{chart.symbol} / {timeframe}</h3>
        </div>
        <div className="inline-tags">
          <span className="tag">{chart.source_mode}</span>
          <span className="tag">{chart.freshness_state}</span>
          <span className="tag">{chart.data_quality}</span>
          {chart.data_reality ? <span className="tag">{chart.data_reality.provenance.realism_grade}</span> : null}
        </div>
      </div>

      <div className="chart-toolbar">
        <div className="inline-tags">
          {TIMEFRAMES.map((value) => (
            <button
              className={timeframe === value ? "pill active" : "pill"}
              key={value}
              onClick={() => onTimeframeChange(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
        <div className="inline-tags">
          <button className={showEma20 ? "pill active" : "pill"} onClick={() => setShowEma20((current) => !current)} type="button">EMA 20</button>
          <button className={showEma50 ? "pill active" : "pill"} onClick={() => setShowEma50((current) => !current)} type="button">EMA 50</button>
          <button className={showEma200 ? "pill active" : "pill"} onClick={() => setShowEma200((current) => !current)} type="button">EMA 200</button>
          <button className={showRsi ? "pill active" : "pill"} onClick={() => setShowRsi((current) => !current)} type="button">RSI</button>
          <button className={showAtr ? "pill active" : "pill"} onClick={() => setShowAtr((current) => !current)} type="button">ATR</button>
          <button className={showVolume ? "pill active" : "pill"} onClick={() => setShowVolume((current) => !current)} type="button">Volume</button>
        </div>
      </div>

      <div className="metric-strip compact-metrics">
        <div>
          <span className="metric-label">OHLC</span>
          <strong>
            {hoverBar ? `${hoverBar.open.toFixed(2)} / ${hoverBar.high.toFixed(2)} / ${hoverBar.low.toFixed(2)} / ${hoverBar.close.toFixed(2)}` : "n/a"}
          </strong>
        </div>
        <div>
          <span className="metric-label">Volume</span>
          <strong>{hoverBar ? hoverBar.volume.toFixed(0) : "n/a"}</strong>
        </div>
        <div>
          <span className="metric-label">Chart State</span>
          <strong>{chart.status}</strong>
        </div>
        <div>
          <span className="metric-label">Available TF</span>
          <strong>{chart.available_timeframes.join(", ") || "none"}</strong>
        </div>
      </div>

      <StateBlock loading={loading} error={stateLabel ? (error ? stateLabel : null) : null} empty={unavailable} emptyLabel={stateLabel ?? "No chart data."} />

      {!loading && !error && !unavailable ? (
        <>
          <div className="chart-banners">
            {chart.is_fixture_mode ? <div className="state-block">Fixture mode active. This chart is suitable for research, review, and paper workflow, not live execution claims.</div> : null}
            {chart.status_note ? <div className={`state-block ${chart.status === "stale" ? "state-error" : ""}`}>{chart.status_note}</div> : null}
          </div>
          <div className="chart-shell chart-shell-lg" ref={mainRef} />
          {showRsi ? <div className="chart-shell chart-shell-sm" data-testid="rsi-panel" ref={rsiRef} /> : null}
          {showAtr ? <div className="chart-shell chart-shell-sm" data-testid="atr-panel" ref={atrRef} /> : null}
        </>
      ) : null}
    </div>
  );
}
