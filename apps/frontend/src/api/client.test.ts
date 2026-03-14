import { describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";

describe("apiClient", () => {
  it("loads the dashboard overview from the configured API route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ macro_regime: "risk-on" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await apiClient.overview();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/dashboard/overview", {
      headers: { "Content-Type": "application/json" },
    });
    expect(payload.macro_regime).toBe("risk-on");
  });

  it("falls back to mock payloads when the API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const payload = await apiClient.walletBalance();

    expect(payload[0].account_label).toBe("Research Book");
  });

  it("posts backtest runs with a typed payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 11, strategy_name: "trend_breakout_v1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await apiClient.runBacktest({ strategy_name: "trend_breakout_v1", search_method: "grid", max_trials: 4 });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/backtests/run", {
      method: "POST",
      body: JSON.stringify({ strategy_name: "trend_breakout_v1", search_method: "grid", max_trials: 4 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(payload.id).toBe(11);
  });
});
