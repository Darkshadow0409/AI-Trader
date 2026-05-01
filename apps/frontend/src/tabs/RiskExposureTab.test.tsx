import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RiskExposureTab } from "./RiskExposureTab";

describe("RiskExposureTab", () => {
  it("defaults detailed risk sections to the selected asset while keeping portfolio exposure explicitly global", async () => {
    const user = userEvent.setup();
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
          {
            risk_report_id: "risk_gold_1d",
            signal_id: "sig_gold_1d",
            symbol: "GOLD",
            as_of: "2026-03-24T22:15:00Z",
            freshness_minutes: 60,
            data_quality: "public_live",
            stop_price: 2171.4,
            size_band: "small",
            max_portfolio_risk_pct: 0.6,
            exposure_cluster: "metals_context",
            uncertainty: 0.28,
            scenario_shocks: { risk_off_pct: -1.2, vol_spike_pct: -0.9 },
            report: {
              setup_family: "event_reaction",
              atr_stop_multiple: 1.1,
              leverage_band: "0.5x to 1.0x",
              slippage_expectation_bps: 6,
              event_lockout: false,
            },
            data_reality: {
              realism_score: 63,
              freshness_state: "fresh",
              execution_grade_allowed: true,
              execution_suitability: "paper_trade",
              tradable_alignment_note: "Aligned for paper workflow.",
              ui_warning: "",
              promotion_blocked: false,
              provenance: {
                source_type: "public_api",
                source_timing: "delayed",
                tradable_symbol: "XAUUSD",
                realism_grade: "D",
              },
            } as any,
          },
        ]}
        selectedSymbol="WTI"
        onSelectSymbol={onSelectSymbol}
        onOpenRisk={onOpenRisk}
      />,
    );

    expect(screen.getByRole("heading", { name: "Selected asset: WTI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "High-risk / blocked setups for WTI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cluster exposure stays global" })).toBeInTheDocument();
    expect(screen.getByText("squeeze expansion")).toBeInTheDocument();
    expect(screen.getByText("1.35x")).toBeInTheDocument();
    expect(screen.getByText("0.75x to 1.5x")).toBeInTheDocument();
    expect(screen.getByText("10.0bps")).toBeInTheDocument();
    expect(screen.getByText("lockout")).toBeInTheDocument();
    expect(screen.queryByText("event reaction")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All assets" }));

    expect(screen.getByRole("heading", { name: "All assets" })).toBeInTheDocument();
    expect(screen.getByText("event reaction")).toBeInTheDocument();
    expect(screen.getByText("0.5x to 1.0x")).toBeInTheDocument();

    await user.click(screen.getByText("WTI"));
    expect(onSelectSymbol).toHaveBeenCalledWith("WTI");
    expect(onOpenRisk).toHaveBeenCalledWith("risk_wti_1h");
  });
});
