import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopRibbon } from "./TopRibbon";

describe("TopRibbon", () => {
  it("renders macro, freshness, risk budget, and pipeline blocks", () => {
    render(
      <TopRibbon
        health={{ status: "ok", sqlite_path: "db", duckdb_path: "duck", parquet_dir: "parquet" }}
        ribbon={{
          macro_regime: "risk-on",
          data_freshness_minutes: 18,
          freshness_status: "fresh",
          market_data_as_of: "2026-03-15T10:42:00Z",
          system_refresh_minutes: 12,
          system_refresh_status: "fresh",
          risk_budget_used_pct: 1.1,
          risk_budget_total_pct: 2.5,
          pipeline_status: "completed",
          source_mode: "sample",
          market_data_mode: "fixture",
          data_mode_label: "Fixture research data",
          feed_source_label: "Local sample source family",
          mode_explainer: "Fixture mode is active. Feed source describes the source family, not live tradable market truth.",
          last_refresh: "2026-03-15T11:00:00Z",
          next_event: { title: "US CPI", impact: "high", event_time: "2026-03-15T12:30:00Z" },
        }}
      />,
    );

    expect(screen.getByText("risk-on")).toBeInTheDocument();
    expect(screen.getByText("18m / fresh")).toBeInTheDocument();
    expect(screen.getByText("1.10 / 2.50%")).toBeInTheDocument();
    expect(screen.getByText("12m ago / recent check")).toBeInTheDocument();
    expect(screen.getByText(/Fixture mode is active/i)).toBeInTheDocument();
    expect(screen.getByTestId("backend-connection-badge")).toHaveTextContent("backend connected");
    expect(screen.getByTestId("source-mode-badge")).toHaveTextContent("data mode Fixture research data");
    expect(screen.getByTestId("pipeline-status-badge")).toHaveTextContent("pipeline completed");
    expect(screen.getByTestId("freshness-status-badge")).toHaveTextContent("market freshness fresh");
    expect(screen.getAllByText(/IST/i).length).toBeGreaterThan(0);
  });

  it("handles stale or missing ribbon details without crashing", () => {
    render(
      <TopRibbon
        health={{ status: "mock", sqlite_path: "db", duckdb_path: "duck", parquet_dir: "parquet" }}
        ribbon={{
          macro_regime: "defensive",
          data_freshness_minutes: 1600,
          freshness_status: "stale",
          market_data_as_of: null,
          system_refresh_minutes: null,
          system_refresh_status: "unknown",
          risk_budget_used_pct: 0.5,
          risk_budget_total_pct: 2.5,
          pipeline_status: "completed",
          source_mode: "sample",
          market_data_mode: "fixture",
          data_mode_label: "Fixture research data",
          feed_source_label: "Local sample source family",
          mode_explainer: "Fixture mode is active. Feed source describes the source family, not live tradable market truth.",
          last_refresh: null,
          next_event: null,
        }}
      />,
    );

    expect(screen.getByText("1600m / stale")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);
    expect(screen.getByTestId("backend-connection-badge")).toHaveTextContent("backend mock");
    expect(screen.getByTestId("freshness-status-badge")).toHaveTextContent("market freshness stale");
  });

  it("shows a calm boot state before the first hydrated snapshot arrives", () => {
    render(
      <TopRibbon
        health={{ status: "syncing", sqlite_path: "", duckdb_path: "", parquet_dir: "" }}
        loading
        ribbon={{
          macro_regime: "syncing",
          data_freshness_minutes: 0,
          freshness_status: "unknown",
          market_data_as_of: null,
          system_refresh_minutes: null,
          system_refresh_status: "unknown",
          risk_budget_used_pct: 0,
          risk_budget_total_pct: 0,
          pipeline_status: "syncing",
          source_mode: "syncing",
          market_data_mode: "fixture",
          data_mode_label: "Syncing market-data truth",
          feed_source_label: "Syncing active feed path",
          mode_explainer: "Syncing market-data truth from the active backend.",
          last_refresh: null,
          next_event: null,
        }}
      />,
    );

    expect(screen.getByText("Syncing operator snapshot")).toBeInTheDocument();
    expect(screen.queryByText(/Syncing market-data truth/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/market freshness unknown/i)).not.toBeInTheDocument();
  });
});
