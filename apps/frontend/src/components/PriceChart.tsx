import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketChartView, PaperTradeDetailView, RiskDetailView, SignalDetailView, TradeTicketDetailView } from "../types/api";
import { formatDateTimeIST, parseTimestampMs } from "../lib/time";
import { StateBlock } from "./StateBlock";

interface PriceChartProps {
  chart: MarketChartView;
  timeframe: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  onTimeframeChange: (timeframe: string) => void;
  selectedSignal?: SignalDetailView | null;
  selectedRisk?: RiskDetailView | null;
  selectedTicket?: TradeTicketDetailView | null;
  selectedTrade?: PaperTradeDetailView | null;
}

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];

function toChartTime(timestamp: string): UTCTimestamp {
  return Math.floor((parseTimestampMs(timestamp) ?? 0) / 1000) as UTCTimestamp;
}

function validIndicatorPoints(points: Array<{ timestamp: string; value: number }>) {
  return points.filter((point) => parseTimestampMs(point.timestamp) !== null && Number.isFinite(point.value));
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
  onRetry,
  onRefresh,
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
  const validBars = useMemo(
    () =>
      chart.bars.filter(
        (bar) =>
          parseTimestampMs(bar.timestamp) !== null &&
          [bar.open, bar.high, bar.low, bar.close, bar.volume].every((value) => Number.isFinite(value)),
      ),
    [chart.bars],
  );
  const malformedBarCount = chart.bars.length - validBars.length;
  const latestBar = validBars[validBars.length - 1] ?? null;
  const ema20Points = useMemo(() => validIndicatorPoints(chart.indicators.ema_20), [chart.indicators.ema_20]);
  const ema50Points = useMemo(() => validIndicatorPoints(chart.indicators.ema_50), [chart.indicators.ema_50]);
  const ema200Points = useMemo(() => validIndicatorPoints(chart.indicators.ema_200), [chart.indicators.ema_200]);
  const rsiPoints = useMemo(() => validIndicatorPoints(chart.indicators.rsi_14), [chart.indicators.rsi_14]);
  const atrPoints = useMemo(() => validIndicatorPoints(chart.indicators.atr_14), [chart.indicators.atr_14]);

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
    return lines.filter((line) => Number.isFinite(line.value));
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
    return markers.filter((marker) => parseTimestampMs(marker.timestamp) !== null);
  }, [chart.overlays.markers, selectedSignal, selectedTicket, selectedTrade]);

  useEffect(() => {
    setHoverBar(validBars[validBars.length - 1] ?? null);
  }, [validBars]);

  useEffect(() => {
    if (!mainRef.current || validBars.length === 0 || loading || error) {
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
    const candleSeries: any = mainChart.addSeries(CandlestickSeries, {
      upColor: "#21c77a",
      downColor: "#ff6f61",
      borderVisible: false,
      wickUpColor: "#21c77a",
      wickDownColor: "#ff6f61",
    });
    candleSeries.setData(
      validBars.map((bar) => ({
        time: toChartTime(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );

    if (showVolume) {
      const volumeSeries: any = mainChart.addSeries(HistogramSeries, {
        priceScaleId: "",
        priceFormat: { type: "volume" },
        scaleMargins: { top: 0.78, bottom: 0 },
      });
      volumeSeries.setData(
        validBars.map((bar) => ({
          time: toChartTime(bar.timestamp),
          value: bar.volume,
          color: bar.close >= bar.open ? "rgba(33, 199, 122, 0.45)" : "rgba(255, 111, 97, 0.45)",
        })),
      );
    }

    const emaSeriesConfigs = [
      { enabled: showEma20, data: ema20Points, color: "#f7d774" },
      { enabled: showEma50, data: ema50Points, color: "#7ad7ff" },
      { enabled: showEma200, data: ema200Points, color: "#b28cff" },
    ];
    emaSeriesConfigs.forEach((config) => {
      if (!config.enabled || config.data.length === 0) {
        return;
      }
      const lineSeries: any = mainChart.addSeries(LineSeries, { color: config.color, lineWidth: 2, crosshairMarkerVisible: false });
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
        setHoverBar(validBars[validBars.length - 1] ?? null);
        return;
      }
      const matched = validBars.find((bar) => toChartTime(bar.timestamp) === point.time) ?? null;
      setHoverBar(matched);
    });
    mainChart.timeScale().fitContent();

    let rsiChart: any = null;
    if (showRsi && rsiRef.current && rsiPoints.length > 0) {
      rsiChart = createChart(rsiRef.current, { ...commonLayout, autoSize: true, height: 120 });
      const rsiSeries: any = rsiChart.addSeries(LineSeries, { color: "#f7d774", lineWidth: 2, crosshairMarkerVisible: false });
      rsiSeries.setData(rsiPoints.map((point) => ({ time: toChartTime(point.timestamp), value: point.value })));
      rsiSeries.createPriceLine({ price: 70, color: "#704f2e", lineWidth: 1, lineStyle: 2, title: "70" });
      rsiSeries.createPriceLine({ price: 30, color: "#24565a", lineWidth: 1, lineStyle: 2, title: "30" });
      rsiChart.timeScale().fitContent();
    }

    let atrChart: any = null;
    if (showAtr && atrRef.current && atrPoints.length > 0) {
      atrChart = createChart(atrRef.current, { ...commonLayout, autoSize: true, height: 120 });
      const atrSeries: any = atrChart.addSeries(LineSeries, { color: "#ff9f6e", lineWidth: 2, crosshairMarkerVisible: false });
      atrSeries.setData(atrPoints.map((point) => ({ time: toChartTime(point.timestamp), value: point.value })));
      atrChart.timeScale().fitContent();
    }

    return () => {
      mainChart.remove();
      rsiChart?.remove();
      atrChart?.remove();
    };
  }, [atrPoints, effectiveLines, effectiveMarkers, ema20Points, ema50Points, ema200Points, error, loading, rsiPoints, showAtr, showEma20, showEma50, showEma200, showRsi, showVolume, validBars]);

  const malformed = chart.bars.length > 0 && validBars.length === 0;
  const unavailable = chart.status === "no_data" || malformed;
  const canRenderChart = !loading && !unavailable && validBars.length > 0;
  const fallbackTimeframe = chart.available_timeframes.includes("1d") ? "1d" : chart.available_timeframes[0] ?? null;
  const shouldOfferFallbackTimeframe = unavailable && fallbackTimeframe !== null && fallbackTimeframe !== timeframe;
  const overlayTone = error || chart.status === "unusable" || chart.status === "stale" ? "warning" : "default";
  const overlayLabel = error
    ? "Disconnected"
    : chart.status === "unusable"
      ? "Unusable"
      : chart.status === "no_data"
        ? "No data"
        : chart.status === "stale"
          ? "Stale"
          : chart.is_fixture_mode
            ? "Fixture"
            : null;
  const overlayBody = error
    ? "Backend disconnected. Last valid bars remain visible until refresh succeeds."
    : chart.status === "unusable"
      ? chart.status_note || "Current market context is unusable in this mode."
      : chart.status === "no_data"
        ? chart.status_note || "No bars are available for this timeframe in the current mode."
        : chart.status === "stale"
          ? chart.status_note || "Visible bars are stale for the current mode."
          : chart.is_fixture_mode
            ? "Fixture data only. Suitable for research, review, and paper workflow, not live market claims."
            : "";
  const stateLabel = error
    ? "Backend disconnected or chart data request failed."
    : malformed
      ? "Chart data loaded with malformed timestamps or invalid OHLC values. The panel is keeping the rest of the workspace alive."
      : unavailable
      ? chart.status_note
      : null;

  return (
    <div className="chart-workspace" data-testid="price-chart-workspace">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Chart Surface</p>
          <h3>{chart.symbol} / {timeframe}</h3>
          <small className="compact-copy">latest visible bar {latestBar ? formatDateTimeIST(latestBar.timestamp) : "n/a"}</small>
        </div>
        <div className="inline-tags">
          <span className="tag">{chart.market_data_mode}</span>
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
              disabled={!chart.available_timeframes.includes(value)}
              key={value}
              onClick={() => chart.available_timeframes.includes(value) && onTimeframeChange(value)}
              title={chart.available_timeframes.includes(value) ? `${value} timeframe` : "Not available in current mode"}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
        <div className="inline-tags">
          {onRefresh ? (
            <button className="action-button" onClick={onRefresh} type="button">
              Refresh Current Mode
            </button>
          ) : null}
          <button className={showEma20 ? "pill active" : "pill"} onClick={() => setShowEma20((current) => !current)} type="button">EMA 20</button>
          <button className={showEma50 ? "pill active" : "pill"} onClick={() => setShowEma50((current) => !current)} type="button">EMA 50</button>
          <button className={showEma200 ? "pill active" : "pill"} onClick={() => setShowEma200((current) => !current)} type="button">EMA 200</button>
          <button className={showRsi ? "pill active" : "pill"} onClick={() => setShowRsi((current) => !current)} type="button">RSI</button>
          <button className={showAtr ? "pill active" : "pill"} onClick={() => setShowAtr((current) => !current)} type="button">ATR</button>
          <button className={showVolume ? "pill active" : "pill"} onClick={() => setShowVolume((current) => !current)} type="button">Volume</button>
        </div>
      </div>

      <div className="workflow-strip">
        <div className={selectedSignal ? "workflow-step active" : "workflow-step"}>
          <span className="metric-label">Signal</span>
          <strong>{selectedSignal ? selectedSignal.signal_type : "not selected"}</strong>
        </div>
        <div className={selectedRisk ? "workflow-step active" : "workflow-step"}>
          <span className="metric-label">Risk</span>
          <strong>{selectedRisk ? selectedRisk.size_band : "awaiting"}</strong>
        </div>
        <div className={selectedTicket ? "workflow-step active" : "workflow-step"}>
          <span className="metric-label">Ticket</span>
          <strong>{selectedTicket ? selectedTicket.status : "not created"}</strong>
        </div>
        <div className={selectedTrade ? "workflow-step active" : "workflow-step"}>
          <span className="metric-label">Trade</span>
          <strong>{selectedTrade ? selectedTrade.status : "shadow/paper"}</strong>
        </div>
        <div className={selectedTrade?.review_due ? "workflow-step warning" : "workflow-step"}>
          <span className="metric-label">Review</span>
          <strong>{selectedTrade ? (selectedTrade.review_due ? "due" : "tracked") : "pending"}</strong>
        </div>
      </div>

      <div className="metric-strip compact-metrics">
        <div>
          <span className="metric-label">Cursor</span>
          <strong>{hoverBar ? formatDateTimeIST(hoverBar.timestamp) : "n/a"}</strong>
        </div>
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
        <div>
          <span className="metric-label">Malformed Bars</span>
          <strong>{malformedBarCount}</strong>
        </div>
      </div>
      <div className="metric-strip compact-metrics">
        <div>
          <span className="metric-label">Display</span>
          <strong>{chart.instrument_mapping.display_symbol}</strong>
        </div>
        <div>
          <span className="metric-label">Research</span>
          <strong>{chart.instrument_mapping.research_symbol}</strong>
        </div>
        <div>
          <span className="metric-label">Broker</span>
          <strong>{chart.instrument_mapping.broker_symbol}</strong>
        </div>
        <div>
          <span className="metric-label">Public</span>
          <strong>{chart.instrument_mapping.public_symbol}</strong>
        </div>
        <div>
          <span className="metric-label">Alignment</span>
          <strong>{chart.instrument_mapping.broker_truth ? "broker-truth" : "proxy/public"}</strong>
        </div>
      </div>
      {chart.data_reality ? (
        <div className="reality-grid">
          <div>
            <span className="metric-label">Reality</span>
            <strong>{chart.data_reality.provenance.realism_grade} / {chart.data_reality.realism_score.toFixed(1)}</strong>
          </div>
          <div>
            <span className="metric-label">Source</span>
            <strong>{chart.data_reality.provenance.source_type} / {chart.data_reality.provenance.source_timing}</strong>
          </div>
          <div>
            <span className="metric-label">Execution</span>
            <strong>{chart.data_reality.execution_suitability}</strong>
          </div>
          <div>
            <span className="metric-label">Alignment</span>
            <strong>{chart.data_reality.tradable_alignment_note}</strong>
          </div>
        </div>
      ) : null}

      <StateBlock
        actionLabel={!canRenderChart && error ? "Retry chart" : shouldOfferFallbackTimeframe ? `Switch to ${fallbackTimeframe}` : undefined}
        empty={!canRenderChart && unavailable}
        emptyLabel={stateLabel ?? "No chart data."}
        error={!canRenderChart && error ? stateLabel : null}
        loading={loading}
        onAction={
          !canRenderChart && error
            ? onRetry
            : shouldOfferFallbackTimeframe && fallbackTimeframe
              ? () => onTimeframeChange(fallbackTimeframe)
              : undefined
        }
      />

      {!loading ? (
        <>
          <div className="chart-banners">
            {!chart.instrument_mapping.broker_truth ? <div className="state-block">{chart.instrument_mapping.mapping_notes}</div> : null}
            {error ? (
              <div className="state-block state-error">
                <div>{stateLabel}</div>
                {onRetry ? (
                  <button className="text-button state-action" onClick={onRetry} type="button">
                    Retry chart
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="chart-shell chart-shell-lg">
            {canRenderChart ? <div className="chart-canvas" ref={mainRef} /> : <div className="chart-canvas chart-canvas-empty" />}
            {overlayLabel ? (
              <div className={`chart-state-overlay ${overlayTone}`} data-testid="chart-state-overlay">
                <strong>{overlayLabel}</strong>
                <span>{overlayBody}</span>
                {onRefresh ? (
                  <button className="text-button" onClick={onRefresh} type="button">
                    Refresh Data
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {canRenderChart && showRsi ? <div className="chart-shell chart-shell-sm" data-testid="rsi-panel" ref={rsiRef} /> : null}
          {canRenderChart && showAtr ? <div className="chart-shell chart-shell-sm" data-testid="atr-panel" ref={atrRef} /> : null}
        </>
      ) : null}
    </div>
  );
}
