import { ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { EquityCurvePoint } from "../types/api";

interface EquityCurveChartProps {
  points: EquityCurvePoint[];
}

export function EquityCurveChart({ points }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) {
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

    const chartApi = chart as typeof chart & {
      addAreaSeries: (options: Record<string, unknown>) => { setData: (data: unknown[]) => void };
    };
    const series = chartApi.addAreaSeries({
      lineColor: "#6ee4a7",
      topColor: "rgba(110, 228, 167, 0.28)",
      bottomColor: "rgba(110, 228, 167, 0.02)",
      lineWidth: 2,
    });

    series.setData(
      points.map((point) => ({
        time: Math.floor(new Date(point.timestamp).getTime() / 1000) as UTCTimestamp,
        value: point.equity,
      })),
    );
    chartApi.timeScale().fitContent();
    return () => chartApi.remove();
  }, [points]);

  return <div className="chart-shell" ref={containerRef} />;
}
