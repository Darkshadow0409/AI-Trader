import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockMarketCharts, mockRiskDetail, mockSignalDetail } from "../api/mockData";
import { PriceChart } from "./PriceChart";

vi.mock("lightweight-charts", () => {
  const series = () => ({
    setData: vi.fn(),
    createPriceLine: vi.fn(),
    setMarkers: vi.fn(),
  });
  return {
    CandlestickSeries: {},
    ColorType: { Solid: "solid" },
    HistogramSeries: {},
    LineSeries: {},
    createChart: vi.fn(() => ({
      addSeries: vi.fn(series),
      subscribeCrosshairMove: vi.fn(),
      timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
      remove: vi.fn(),
    })),
  };
});

describe("PriceChart", () => {
  it("renders real chart controls, fixture warning, and timeframe switching", async () => {
    const onTimeframeChange = vi.fn();
    const onRefresh = vi.fn();
    const user = userEvent.setup();

    render(
      <PriceChart
        chart={mockMarketCharts["BTC:1d"]}
        loading={false}
        onRefresh={onRefresh}
        onTimeframeChange={onTimeframeChange}
        selectedRisk={mockRiskDetail}
        selectedSignal={mockSignalDetail}
        timeframe="1d"
      />,
    );

    expect(screen.getByTestId("price-chart-workspace")).toBeInTheDocument();
    expect(screen.getByText(/Fixture data only/i)).toBeInTheDocument();
    expect(screen.getByText(/Intraday timeframes are not available in fixture mode/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EMA 20" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1d" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "15m" })).toBeDisabled();
    expect(screen.getByTestId("rsi-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh Current Mode" }));
    expect(onRefresh).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "RSI" }));
    expect(screen.queryByTestId("rsi-panel")).not.toBeInTheDocument();
  });

  it("shows explicit no-data state for unavailable timeframes", () => {
    render(<PriceChart chart={mockMarketCharts["BTC:15m"]} loading={false} onTimeframeChange={vi.fn()} timeframe="15m" />);

    expect(screen.getAllByText(/No 15m bars are available for BTC/i).length).toBeGreaterThan(0);
  });

  it("keeps the last valid chart visible and shows a disconnected warning on refresh failure", () => {
    const onRetry = vi.fn();
    render(<PriceChart chart={mockMarketCharts["BTC:1d"]} error="offline" loading={false} onRetry={onRetry} onTimeframeChange={vi.fn()} timeframe="1d" />);

    expect(screen.getByText(/Backend disconnected or chart data request failed/i)).toBeInTheDocument();
    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Disconnected/i);
    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/Do not treat this chart as current live market truth/i);
    expect(screen.getByRole("button", { name: "Retry chart" })).toBeInTheDocument();
    expect(screen.queryByText(/No chart data/i)).not.toBeInTheDocument();
  });

  it("shows a no-data overlay and disabled unavailable timeframe controls", async () => {
    const user = userEvent.setup();
    const onTimeframeChange = vi.fn();
    render(<PriceChart chart={mockMarketCharts["BTC:15m"]} loading={false} onTimeframeChange={onTimeframeChange} timeframe="15m" />);

    expect(screen.getByTestId("chart-state-overlay")).toHaveTextContent(/No data/i);
    expect(screen.getByRole("button", { name: "15m" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "15m" })).toHaveAttribute("title", "Not available in current mode");

    await user.click(screen.getByRole("button", { name: "15m" }));
    expect(onTimeframeChange).not.toHaveBeenCalled();
  });

  it("shows a malformed-data state instead of crashing on invalid timestamps", () => {
    render(
      <PriceChart
        chart={{
          ...mockMarketCharts["BTC:1d"],
          bars: [{ ...mockMarketCharts["BTC:1d"].bars[0], timestamp: "not-a-timestamp" }],
        }}
        loading={false}
        onTimeframeChange={vi.fn()}
        timeframe="1d"
      />,
    );

    expect(screen.getByText(/malformed timestamps or invalid OHLC values/i)).toBeInTheDocument();
  });
});
