import { ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { BarView } from "../types/api";

interface PriceChartProps {
  bars: BarView[];
}

export function PriceChart({ bars }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) {
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
      addCandlestickSeries: (options: Record<string, unknown>) => { setData: (data: unknown[]) => void };
    };
    const series = chartApi.addCandlestickSeries({
      upColor: "#21c77a",
      downColor: "#ff6f61",
      borderVisible: false,
      wickUpColor: "#21c77a",
      wickDownColor: "#ff6f61",
    });
    series.setData(
      bars.map((bar) => ({
        time: Math.floor(new Date(bar.timestamp).getTime() / 1000) as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );
    chartApi.timeScale().fitContent();
    return () => chartApi.remove();
  }, [bars]);

  return <div className="chart-shell" ref={containerRef} />;
}
