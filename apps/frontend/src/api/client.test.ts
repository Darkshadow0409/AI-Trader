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
      signal: expect.any(AbortSignal),
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
      signal: expect.any(AbortSignal),
    });
    expect(payload.id).toBe(11);
  });

  it("loads signal detail using signal_id and falls back cleanly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ signal_id: "sig_test", evidence: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await apiClient.signalDetail("sig_test");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/signals/sig_test", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(payload.signal_id).toBe("sig_test");
  });

  it("posts active trade creates with the operator-console contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ trade_id: "trade_test", symbol: "BTC" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await apiClient.createActiveTrade({
      symbol: "BTC",
      strategy_name: "manual_track_v1",
      side: "long",
      entry_time: "2026-03-15T11:30:00Z",
      entry_price: 70000,
      current_price: 70500,
      stop_price: 69000,
      target_price: 73000,
      size_band: "small",
      status: "open",
      thesis: "Regression coverage",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/portfolio/active-trades", {
      method: "POST",
      body: JSON.stringify({
        symbol: "BTC",
        strategy_name: "manual_track_v1",
        side: "long",
        entry_time: "2026-03-15T11:30:00Z",
        entry_price: 70000,
        current_price: 70500,
        stop_price: 69000,
        target_price: 73000,
        size_band: "small",
        status: "open",
        thesis: "Regression coverage",
      }),
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(payload.trade_id).toBe("trade_test");
  });

  it("loads paper trade detail with the contracted route shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ trade_id: "paper_trade_test", lifecycle_events: [], outcome: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await apiClient.paperTradeDetail("paper_trade_test");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/portfolio/paper-trades/paper_trade_test", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(payload.trade_id).toBe("paper_trade_test");
  });
});
