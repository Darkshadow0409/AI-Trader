import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockAIAdvisor, mockAIStatus, mockAssetContexts, mockMarketCharts, mockSignals, mockWatchlistSummary } from "../api/mockData";
import { AIDeskTab } from "./AIDeskTab";

vi.mock("../api/client", () => ({
  apiClient: {
    aiStatus: vi.fn(),
    runAdvisor: vi.fn(),
    aiLogout: vi.fn(),
    aiOauthStartUrl: vi.fn(),
  },
}));

describe("AIDeskTab", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn().mockReturnValue({ closed: false }));
    vi.mocked(apiClient.aiStatus).mockResolvedValue(mockAIStatus);
    vi.mocked(apiClient.runAdvisor).mockResolvedValue(mockAIAdvisor);
    vi.mocked(apiClient.aiLogout).mockResolvedValue({ status: "disconnected" });
    vi.mocked(apiClient.aiOauthStartUrl).mockReturnValue("http://127.0.0.1:8000/api/ai/oauth/start?return_to=http%3A%2F%2F127.0.0.1%3A5173");
  });

  it("shows advisory roles before a run and then renders the brain response", async () => {
    const user = userEvent.setup();

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Ask The Desk Brain")).toBeInTheDocument();
    expect(screen.getByText("Structured Commodity Advisory")).toBeInTheDocument();
    expect(screen.getByText("Current Desk Snapshot")).toBeInTheDocument();
    expect(screen.getByText("OpenAI Settings")).toBeInTheDocument();
    expect(screen.getByText(/Current callback URL:/i)).toBeInTheDocument();
    expect(screen.getByText("Structured Output")).toBeInTheDocument();
    expect(screen.getByText("Why It Matters Now")).toBeInTheDocument();
    expect(screen.getByText("Key Levels / Scenarios")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Run Local Terminal Brief/i }));

    expect(await screen.findByText("Brain Summary")).toBeInTheDocument();
    expect(screen.getByText("Current Market Read")).toBeInTheDocument();
    expect(screen.getByText("Catalyst Watch")).toBeInTheDocument();
    expect(screen.getByText("Risk Frame")).toBeInTheDocument();
    expect(screen.getByText("Next Actions In Platform")).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.why_it_matters_now)).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.final_answer)).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.context_summary)).toBeInTheDocument();
    expect(screen.getByText("Research Agent")).toBeInTheDocument();
    expect(screen.getByText("Sentiment Agent")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiClient.runAdvisor).toHaveBeenCalledWith(
        {
          query: expect.stringContaining("USOUSD"),
          symbol: "WTI",
          timeframe: "1d",
          model: mockAIStatus.selected_model,
          active_tab: "ai_desk",
          selected_signal_id: null,
          selected_risk_report_id: null,
        },
      );
    });
  });

  it("uses chart freshness in the local desk snapshot before an advisory run", async () => {
    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={{ ...mockMarketCharts["WTI:1d"], freshness_minutes: 671, freshness_state: "stale" }}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Current Desk Snapshot")).toBeInTheDocument();
    expect(screen.getByText("stale · 671m")).toBeInTheDocument();
  });

  it("opens the OAuth popup flow from the AI desk", async () => {
    const user = userEvent.setup();

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.BTC}
        assetLabel="BTCUSD"
        chart={mockMarketCharts["BTC:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="BTC"
        signalDetail={null}
        signals={mockSignals}
        timeframe="4h"
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");

    await user.click(screen.getByRole("button", { name: /Connect with OpenAI/i }));

    await waitFor(() => {
      expect(apiClient.aiOauthStartUrl).toHaveBeenCalledWith(window.location.origin);
    });
    expect(window.open).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/ai/oauth/start?return_to=http%3A%2F%2F127.0.0.1%3A5173",
      "ai-trader-openai-oauth",
      "popup=yes,width=640,height=780",
    );
  });

  it("shows a friendly connection card instead of raw fetch errors", async () => {
    vi.mocked(apiClient.aiStatus).mockRejectedValueOnce(new Error("Failed to fetch"));

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.BTC}
        assetLabel="BTCUSD"
        chart={mockMarketCharts["BTC:1d"]}
        deskSectionNotes={{ adapter_health: "Adapter health is degraded. Using the last healthy desk context while refresh recovers." }}
        onNavigate={vi.fn()}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="BTC"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Connection Guidance")).toBeInTheDocument();
    expect(screen.getByText(/AI Desk cannot reach the local backend right now/i)).toBeInTheDocument();
    expect(screen.getByText("Degraded But Usable")).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("shows explicit expired-session guidance without leaking provider errors", async () => {
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce({
      ...mockAIStatus,
      status: "session_expired",
      warning: "Your OpenAI session expired or was revoked. Reconnect to continue authenticated advisory runs.",
      session_expires_at: "2026-03-15T13:30:00Z",
    });

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Connection Guidance")).toBeInTheDocument();
    expect(screen.getAllByText(/session expired or was revoked/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Session expired")).toBeInTheDocument();
  });
});
