import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RiskExposureTab } from "./RiskExposureTab";

describe("RiskExposureTab", () => {
  it("renders per-signal risk rows with leverage and slippage detail", () => {
    const onSelectSymbol = vi.fn();
    const onOpenRisk = vi.fn();

    render(
      <RiskExposureTab
        exposures={[
          {
            cluster: "energy",
            symbols: ["WTI", "GOLD"],
            gross_risk_pct: 0.82,
            worst_scenario_pct: 2.4,
          },
        ]}
        reports={[
          {
            risk_report_id: "risk_wti_1h",
            signal_id: "sig_wti_1h",
            symbol: "WTI",
            as_of: "2026-03-24T22:15:00Z",
            freshness_minutes: 60,
            data_quality: "public_live",
            stop_price: 80.9019,
            size_band: "starter",
            max_portfolio_risk_pct: 0.8,
            exposure_cluster: "macro_context",
            uncertainty: 0.41,
            scenario_shocks: { risk_off_pct: -2.1, vol_spike_pct: -1.6 },
            report: {
              setup_family: "squeeze_expansion",
              atr_stop_multiple: 1.35,
              leverage_band: "0.75x to 1.5x",
              slippage_expectation_bps: 10,
              event_lockout: true,
            },
            data_reality: null,
          },
        ]}
        selectedSymbol="BTC"
        onSelectSymbol={onSelectSymbol}
        onOpenRisk={onOpenRisk}
      />,
    );

    expect(screen.getByText("squeeze expansion")).toBeInTheDocument();
    expect(screen.getByText("1.35x")).toBeInTheDocument();
    expect(screen.getByText("0.75x to 1.5x")).toBeInTheDocument();
    expect(screen.getByText("10.0bps")).toBeInTheDocument();
    expect(screen.getByText("lockout")).toBeInTheDocument();

    fireEvent.click(screen.getByText("WTI"));
    expect(onSelectSymbol).toHaveBeenCalledWith("WTI");
    expect(onOpenRisk).toHaveBeenCalledWith("risk_wti_1h");
  });
});
