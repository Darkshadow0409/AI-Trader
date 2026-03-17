import { AreaSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";
import { parseTimestampMs } from "../lib/time";
import type { EquityCurvePoint } from "../types/api";

interface EquityCurveChartProps {
  points: EquityCurvePoint[];
}

export function EquityCurveChart({ points }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const validPoints = useMemo(
    () => points.filter((point) => parseTimestampMs(point.timestamp) !== null && Number.isFinite(point.equity)),
    [points],
  );

  useEffect(() => {
    if (!containerRef.current || validPoints.length === 0) {
      return;
    }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#081117" },
        textColor: "#d8e3ed",
      },
      grid: {
        vertLines: { color: "#152530" },
        horzLines: { color: "#152530" },
      },
      rightPriceScale: {
        borderColor: "#27404d",
      },
      timeScale: {
        borderColor: "#27404d",
      },
    });

    const chartApi = chart as typeof chart;
    const series = chartApi.addSeries(AreaSeries, {
      lineColor: "#6ee4a7",
      topColor: "rgba(110, 228, 167, 0.28)",
      bottomColor: "rgba(110, 228, 167, 0.02)",
      lineWidth: 2,
    });

    series.setData(
      validPoints.map((point) => ({
        time: Math.floor((parseTimestampMs(point.timestamp) ?? 0) / 1000) as UTCTimestamp,
        value: point.equity,
      })),
    );
    chartApi.timeScale().fitContent();
    return () => chartApi.remove();
  }, [validPoints]);

  return <div className="chart-shell" ref={containerRef} />;
}
