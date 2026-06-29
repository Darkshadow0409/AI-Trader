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

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/dashboard/overview?symbol=USOUSD", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(payload.macro_regime).toBe("risk-on");
  });

  it("dedupes concurrent identical GET requests while one is already in flight", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ macro_regime: "risk-on" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([apiClient.overview(), apiClient.overview()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.macro_regime).toBe("risk-on");
    expect(second.macro_regime).toBe("risk-on");
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

  it("treats clean-backend-absent optional workspace APIs as unavailable without doomed fetches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const workspace = await apiClient.selectedSignalWorkspace("sig_test", "1h");
    const scenario = await apiClient.scenario("USOUSD", "1d");
    const runs = await apiClient.researchRuns(12);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(workspace).toBeNull();
    expect(scenario).toBeNull();
    expect(runs).toEqual([]);
  });

  it("uses an honest degraded selected-asset truth fallback without requesting absent clean-backend routes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const payload = await apiClient.selectedAssetTruth("WTI");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      symbol: "USOUSD",
      trader_facing_symbol: "USOUSD",
      research_symbol_if_any: "WTI_CTX",
      source_mode: "unknown",
      route_readiness: "warming_up",
      degraded_reason: "clean_backend_selected_asset_truth_unavailable",
      is_proxy: true,
    });
    expect(payload.as_of).toBeNull();
    expect(payload.freshness_minutes).toBeNull();
    expect(payload.confidence).toBeLessThan(0.5);
  });

  it("uses trader-facing commodity aliases for asset context and chart requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ symbol: "WTI", instrument_mapping: { trader_symbol: "USOUSD" }, timeframe: "1d" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.assetContext("WTI");
    await apiClient.marketChart("WTI", "1d");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:8000/api/dashboard/assets/USOUSD", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:8000/api/market/chart/USOUSD?timeframe=1d", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
  });

  it("loads market evidence providers and snapshots from read-only routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ provider_id: "local_ai_trader_snapshot", paper_research_only: true }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ snapshot_id: "market_evidence_test", symbol: "USOUSD", paper_research_only: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const providers = await apiClient.marketEvidenceProviders();
    const snapshot = await apiClient.marketEvidenceSnapshot("USOUSD", "1d");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:8000/api/market-evidence/providers", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:8000/api/market-evidence/snapshot?symbol=USOUSD&timeframe=1d", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(providers[0].paper_research_only).toBe(true);
    expect(snapshot.symbol).toBe("USOUSD");
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

  it("includes browser credentials for OAuth-backed AI status requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ provider: "openai", auth_mode: "oauth", status: "auth_required", connected: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.aiStatus();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/ai/status", {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
  });

  it("posts AI advisor requests as JSON when running the local terminal brief", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ final_answer: "brief", provider_status: { provider: "openai", auth_mode: "oauth", status: "auth_required", connected: false } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.runAdvisor({
      query: "What matters now for USOUSD?",
      symbol: "WTI",
      timeframe: "1d",
      model: "gpt-5.4",
      active_tab: "ai_desk",
      selected_signal_id: null,
      selected_risk_report_id: null,
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/ai/advisor", {
      method: "POST",
      body: JSON.stringify({
        query: "What matters now for USOUSD?",
        symbol: "WTI",
        timeframe: "1d",
        model: "gpt-5.4",
        active_tab: "ai_desk",
        selected_signal_id: null,
        selected_risk_report_id: null,
      }),
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
  });

  it("defaults Polymarket hunter requests to relevance ordering", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generated_at: "", source_status: "live", source_note: "", query: "", tag: "", sort: "relevance", available_tags: [], events: [], markets: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.polymarketHunter();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/polymarket/hunter?q=&tag=&sort=relevance",
      {
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("prefers runtime-config api base over the static fallback", async () => {
    vi.resetModules();
    window.__AI_TRADER_RUNTIME__ = {
      apiBase: "http://127.0.0.1:8011/api",
      backendUrl: "http://127.0.0.1:8011",
      frontendUrl: "http://127.0.0.1:5173",
      generatedAt: "2026-03-23T00:00:00",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ macro_regime: "risk-on" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const runtimeClient = await import("./client");
    const payload = await runtimeClient.apiClient.overview();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8011/api/dashboard/overview?symbol=USOUSD", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(payload.macro_regime).toBe("risk-on");
    delete window.__AI_TRADER_RUNTIME__;
  });

  it("ignores blank runtime-config values so isolated Vite smoke can use the intended API base", async () => {
    vi.resetModules();
    window.__AI_TRADER_RUNTIME__ = {
      apiBase: "",
      backendUrl: "",
      frontendUrl: "",
      generatedAt: "dev-fallback",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ macro_regime: "risk-on" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const runtimeClient = await import("./client");
    await runtimeClient.apiClient.overview();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/api/dashboard/overview?symbol=USOUSD", {
      headers: { "Content-Type": "application/json" },
      signal: expect.any(AbortSignal),
    });
    delete window.__AI_TRADER_RUNTIME__;
  });
});
