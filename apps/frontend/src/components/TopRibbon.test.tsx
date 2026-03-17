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
          risk_budget_used_pct: 1.1,
          risk_budget_total_pct: 2.5,
          pipeline_status: "completed",
          source_mode: "sample",
          last_refresh: "2026-03-15T11:00:00Z",
          next_event: { title: "US CPI", impact: "high", event_time: "2026-03-15T12:30:00Z" },
        }}
      />,
    );

    expect(screen.getByText("risk-on")).toBeInTheDocument();
    expect(screen.getByText("18m / fresh")).toBeInTheDocument();
    expect(screen.getByText("1.10 / 2.50%")).toBeInTheDocument();
    expect(screen.getByText("completed / sample")).toBeInTheDocument();
    expect(screen.getByTestId("backend-connection-badge")).toHaveTextContent("backend connected");
    expect(screen.getByTestId("source-mode-badge")).toHaveTextContent("source sample");
    expect(screen.getByTestId("pipeline-status-badge")).toHaveTextContent("pipeline completed");
    expect(screen.getByTestId("freshness-status-badge")).toHaveTextContent("freshness fresh");
  });

  it("handles stale or missing ribbon details without crashing", () => {
    render(
      <TopRibbon
        health={{ status: "mock", sqlite_path: "db", duckdb_path: "duck", parquet_dir: "parquet" }}
        ribbon={{
          macro_regime: "defensive",
          data_freshness_minutes: 1600,
          freshness_status: "stale",
          risk_budget_used_pct: 0.5,
          risk_budget_total_pct: 2.5,
          pipeline_status: "completed",
          source_mode: "sample",
          last_refresh: null,
          next_event: null,
        }}
      />,
    );

    expect(screen.getByText("1600m / stale")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText(/mock \/ n\/a/i)).toBeInTheDocument();
    expect(screen.getByTestId("backend-connection-badge")).toHaveTextContent("backend mock");
    expect(screen.getByTestId("freshness-status-badge")).toHaveTextContent("freshness stale");
  });
});
