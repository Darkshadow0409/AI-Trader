import { render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockAIAdvisor, mockAIStatus, mockAssetContexts, mockMarketCharts, mockOllamaStatus, mockPaperTradeDetail, mockScenarioResearch, mockSignals, mockWatchlistSummary } from "../api/mockData";
import { AIDeskTab } from "./AIDeskTab";

vi.mock("../api/client", () => ({
  apiClient: {
    aiStatus: vi.fn(),
    startAdvisorRun: vi.fn(),
    advisorRunStatus: vi.fn(),
    retryAdvisorRun: vi.fn(),
    aiLogout: vi.fn(),
    aiOauthStartUrl: vi.fn(),
  },
}));

const oauthStartUrlFor = (origin: string) => {
  const callbackUrl = new URL(mockAIStatus.oauth_callback_url ?? "http://127.0.0.1:8001/api/ai/oauth/callback");
  return `${callbackUrl.origin}/api/ai/oauth/start?${new URLSearchParams({ return_to: origin }).toString()}`;
};

const mockLocalAdvisor = {
  ...mockAIAdvisor,
  answer_source: "local_brief" as const,
  provider_status: {
    ...mockAIStatus,
    provider: "local",
    auth_mode: "none",
    status: "ready",
    connected: false,
    oauth_enabled: false,
    oauth_connect_url: null,
    oauth_callback_url: null,
    connected_account: null,
    default_model: "deterministic_brief",
    selected_model: "deterministic_brief",
    available_models: ["deterministic_brief"],
  },
  research_run: {
    ...mockAIAdvisor.research_run,
    provider: "local",
    selected_model: "deterministic_brief",
    answer_source: "local_brief" as const,
  },
};

const mockLocalStatus = {
  ...mockAIStatus,
  provider: "local",
  auth_mode: "none",
  status: "ready",
  connected: false,
  oauth_enabled: false,
  oauth_connect_url: null,
  oauth_callback_url: null,
  connected_account: null,
  default_model: "deterministic_brief",
  selected_model: "deterministic_brief",
  available_models: ["deterministic_brief"],
  guidance: "Deterministic local advisory is ready.",
};

describe("AIDeskTab", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal("open", vi.fn().mockReturnValue({ closed: false }));
    vi.mocked(apiClient.aiStatus).mockResolvedValue(mockLocalStatus);
    vi.mocked(apiClient.startAdvisorRun).mockResolvedValue({
      run_id: mockLocalAdvisor.research_run.run_id,
      provider: mockLocalAdvisor.provider_status.provider,
      selected_model: mockLocalAdvisor.provider_status.selected_model,
      answer_source: null,
      retry_of_run_id: null,
      restart_family_id: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued local advisory run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: mockLocalAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockLocalAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.advisorRunStatus).mockResolvedValue({
      run_id: mockLocalAdvisor.research_run.run_id,
      provider: mockLocalAdvisor.provider_status.provider,
      selected_model: mockLocalAdvisor.provider_status.selected_model,
      answer_source: mockLocalAdvisor.answer_source,
      retry_of_run_id: null,
      restart_family_id: null,
      run_mode: mockLocalAdvisor.run_mode,
      run_stage: "complete",
      latency_ms: mockLocalAdvisor.latency_ms,
      status_note: mockLocalAdvisor.status_note,
      validation_summary_note: mockLocalAdvisor.validation_summary_note ?? null,
      error_message: null,
      recovery_state: "terminal",
      recovery_note: null,
      can_retry: true,
      created_at: mockLocalAdvisor.generated_at,
      started_at: mockLocalAdvisor.research_run.started_at ?? null,
      completed_at: mockLocalAdvisor.research_run.completed_at ?? null,
      updated_at: mockLocalAdvisor.research_run.updated_at,
      stage_history: mockLocalAdvisor.stage_history,
      response: mockLocalAdvisor,
    });
    vi.mocked(apiClient.retryAdvisorRun).mockResolvedValue({
      run_id: `retry-${mockLocalAdvisor.research_run.run_id}`,
      provider: mockLocalAdvisor.provider_status.provider,
      selected_model: mockLocalAdvisor.provider_status.selected_model,
      answer_source: null,
      retry_of_run_id: mockLocalAdvisor.research_run.run_id,
      restart_family_id: mockLocalAdvisor.research_run.run_id,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued retry advisory run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: mockLocalAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockLocalAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.aiLogout).mockResolvedValue({ status: "disconnected" });
    vi.mocked(apiClient.aiOauthStartUrl).mockImplementation((origin) => oauthStartUrlFor(origin ?? window.location.origin));
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
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Analyst Console")).toBeInTheDocument();
    expect(await screen.findByText("Ask The Desk Brain")).toBeInTheDocument();
    expect(screen.getAllByText(/Structured Commodity Advisory/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Current Desk Snapshot")).toBeInTheDocument();
    expect(screen.getByText("MiroFish Research")).toBeInTheDocument();
    expect(screen.getByText("AI Provider")).toBeInTheDocument();
    expect(screen.getByText("Pre-Run Advisory")).toBeInTheDocument();
    expect(screen.getAllByText("Local advisory").length).toBeGreaterThan(0);
    expect(screen.getByText("Why It Matters Now")).toBeInTheDocument();
    expect(screen.getByText("Key Levels / Scenarios")).toBeInTheDocument();
    expect(screen.getAllByText(/Crude inventory draw tightens inflation-sensitive macro backdrop/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("oauth_not_configured")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Run Local Terminal Brief/i }));

    expect(await screen.findByText("Brain Summary")).toBeInTheDocument();
    expect(screen.getByText("Last Good Result")).toBeInTheDocument();
    expect(screen.getByText("Desk fast path")).toBeInTheDocument();
    expect(screen.getAllByText("18.6s").length).toBeGreaterThan(0);
    expect(screen.getByText("Confidence + Limits")).toBeInTheDocument();
    expect(screen.getByText("Current Market Read")).toBeInTheDocument();
    expect(screen.getByText("Catalyst Watch")).toBeInTheDocument();
    expect(screen.getByText("Risk Frame")).toBeInTheDocument();
    expect(screen.getByText("Next Actions In Platform")).toBeInTheDocument();
    expect(screen.getByText("Evidence + Provenance")).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.why_it_matters_now)).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.final_answer)).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.context_summary)).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.research_run.final_summary)).toBeInTheDocument();
    expect(screen.getByText("Research Agent")).toBeInTheDocument();
    expect(screen.getByText("Sentiment Agent")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiClient.startAdvisorRun).toHaveBeenCalledWith(
        {
          query: expect.stringContaining("USOUSD"),
          symbol: "WTI",
          timeframe: "1d",
          provider: "local",
          model: mockLocalStatus.selected_model,
          active_tab: "ai_desk",
          selected_signal_id: null,
          selected_risk_report_id: null,
          selected_trade_id: null,
        },
      );
    });

    expect(screen.getAllByText("Local advisory").length).toBeGreaterThan(0);
  });

  it("shows staged long-running local inference state while the advisory request is in flight", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce(mockOllamaStatus);
    vi.mocked(apiClient.startAdvisorRun).mockResolvedValueOnce({
      run_id: mockAIAdvisor.research_run.run_id,
      provider: "ollama",
      selected_model: "llama3.2:latest",
      answer_source: null,
      retry_of_run_id: null,
      restart_family_id: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued local advisory run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: mockAIAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.advisorRunStatus)
      .mockResolvedValueOnce({
        run_id: mockAIAdvisor.research_run.run_id,
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: null,
        retry_of_run_id: null,
        restart_family_id: null,
        run_mode: "desk_fast",
        run_stage: "building_context",
        latency_ms: null,
        status_note: "Building advisory context from delayed/public market data.",
        validation_summary_note: null,
        error_message: null,
        recovery_state: "active",
        recovery_note: null,
        can_retry: false,
        created_at: mockAIAdvisor.generated_at,
        started_at: mockAIAdvisor.research_run.started_at ?? null,
        completed_at: null,
        updated_at: mockAIAdvisor.research_run.updated_at,
        stage_history: mockAIAdvisor.stage_history.slice(0, 2),
        response: null,
      })
      .mockResolvedValueOnce({
        run_id: mockAIAdvisor.research_run.run_id,
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: null,
        retry_of_run_id: null,
        restart_family_id: null,
        run_mode: "desk_fast",
        run_stage: "validating_output",
        latency_ms: null,
        status_note: "Validated before display against delayed/public desk truth.",
        validation_summary_note: null,
        error_message: null,
        recovery_state: "active",
        recovery_note: null,
        can_retry: false,
        created_at: mockAIAdvisor.generated_at,
        started_at: mockAIAdvisor.research_run.started_at ?? null,
        completed_at: null,
        updated_at: mockAIAdvisor.research_run.updated_at,
        stage_history: mockAIAdvisor.stage_history.slice(0, 4),
        response: null,
      })
      .mockResolvedValueOnce({
        run_id: mockAIAdvisor.research_run.run_id,
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: "ollama_response",
        retry_of_run_id: null,
        restart_family_id: null,
        run_mode: "desk_fast",
        run_stage: "complete",
        latency_ms: 12100,
        status_note: "Completed local Ollama inference in desk fast mode on delayed/public market context.",
        validation_summary_note: mockAIAdvisor.validation_summary_note ?? null,
        error_message: null,
        recovery_state: "terminal",
        recovery_note: null,
        can_retry: true,
        created_at: mockAIAdvisor.generated_at,
        started_at: mockAIAdvisor.research_run.started_at ?? null,
        completed_at: mockAIAdvisor.research_run.completed_at ?? null,
        updated_at: mockAIAdvisor.research_run.updated_at,
        stage_history: mockAIAdvisor.stage_history,
        response: {
          ...mockAIAdvisor,
          provider_status: mockOllamaStatus,
          answer_source: "ollama_response",
          run_mode: "desk_fast",
          run_stage: "complete",
          latency_ms: 12100,
        },
      });

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockOllamaStatus.selected_model}
        selectedAIProvider="ollama"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await waitFor(() => {
      expect(screen.getAllByDisplayValue("llama3.2:latest").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("button", { name: /Run (Local Terminal Brief|Terminal Brain)/i }));

    expect(await screen.findByText("Active Advisory Run")).toBeInTheDocument();
    const activeRunPanel = screen.getByText("Active Advisory Run").closest("article");
    expect(activeRunPanel).not.toBeNull();
    expect(within(activeRunPanel!).getByRole("heading", { name: "Building advisory context" })).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText("Ollama")).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText("llama3.2:latest")).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText("Refresh status")).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText("Resume polling")).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText("Prepare next question")).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText(/screen will keep polling automatically/i)).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText(/Recent stages: Queued -> Building advisory context/i)).toBeInTheDocument();

    expect(await screen.findByText("Brain Summary")).toBeInTheDocument();
    expect(await screen.findByText("Recent Completion")).toBeInTheDocument();
    expect(screen.getAllByText("Validated before display against delayed/public desk truth.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Queued -> Building advisory context -> Running local inference -> Finalizing advisory response -> Complete/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(vi.mocked(apiClient.advisorRunStatus).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("keeps llama as the default Ollama model while exposing gemma as an optional local profile", async () => {
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce(mockOllamaStatus);

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockOllamaStatus.selected_model}
        selectedAIProvider="ollama"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await waitFor(() => {
      expect(screen.getAllByDisplayValue("llama3.2:latest").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("option", { name: "gemma4:e4b" })).toBeInTheDocument();
  });

  it("keeps polling through a late-persist validation state instead of surfacing a silent complete-without-response outcome", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce(mockOllamaStatus);
    vi.mocked(apiClient.startAdvisorRun).mockResolvedValueOnce({
      run_id: mockAIAdvisor.research_run.run_id,
      provider: "ollama",
      selected_model: "llama3.2:latest",
      answer_source: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued local advisory run.",
      validation_summary_note: null,
      error_message: null,
      created_at: mockAIAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.advisorRunStatus)
      .mockResolvedValueOnce({
        run_id: mockAIAdvisor.research_run.run_id,
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: "ollama_response",
        run_mode: "desk_fast",
        run_stage: "validating_output",
        latency_ms: 11900,
        status_note: "Final response is still being persisted.",
        validation_summary_note: null,
        error_message: null,
        created_at: mockAIAdvisor.generated_at,
        started_at: mockAIAdvisor.research_run.started_at ?? null,
        completed_at: null,
        updated_at: mockAIAdvisor.research_run.updated_at,
        stage_history: mockAIAdvisor.stage_history.slice(0, 4),
        response: null,
      })
      .mockResolvedValueOnce({
        run_id: mockAIAdvisor.research_run.run_id,
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: "ollama_response",
        run_mode: "desk_fast",
        run_stage: "complete",
        latency_ms: 12100,
        status_note: "Completed local Ollama inference in desk fast mode on delayed/public market context.",
        validation_summary_note: mockAIAdvisor.validation_summary_note ?? null,
        error_message: null,
        created_at: mockAIAdvisor.generated_at,
        started_at: mockAIAdvisor.research_run.started_at ?? null,
        completed_at: mockAIAdvisor.research_run.completed_at ?? null,
        updated_at: mockAIAdvisor.research_run.updated_at,
        stage_history: mockAIAdvisor.stage_history,
        response: {
          ...mockAIAdvisor,
          provider_status: mockOllamaStatus,
          answer_source: "ollama_response",
          run_mode: "desk_fast",
          run_stage: "complete",
          latency_ms: 12100,
        },
      });

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockOllamaStatus.selected_model}
        selectedAIProvider="ollama"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await user.click(screen.getByRole("button", { name: /Run (Local Terminal Brief|Terminal Brain)/i }));

    expect(await screen.findByText("Active Advisory Run")).toBeInTheDocument();
    expect(await screen.findByText("Final response is still being persisted.")).toBeInTheDocument();
    expect(await screen.findByText("Brain Summary")).toBeInTheDocument();
    expect(screen.queryByText(/Advisor run completed without a final response/i)).not.toBeInTheDocument();
  });

  it("shows stale-run recovery guidance and retries the same advisor question safely", async () => {
    const user = userEvent.setup();
    const retriedAdvisor = {
      ...mockAIAdvisor,
      research_run: {
        ...mockAIAdvisor.research_run,
        run_id: "advisor-retry-run",
        retry_of_run_id: mockAIAdvisor.research_run.run_id,
        restart_family_id: mockAIAdvisor.research_run.run_id,
      },
    };

    vi.mocked(apiClient.startAdvisorRun).mockResolvedValueOnce({
      run_id: mockAIAdvisor.research_run.run_id,
      provider: "local",
      selected_model: mockLocalStatus.selected_model,
      answer_source: null,
      retry_of_run_id: null,
      restart_family_id: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued local advisory run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: mockAIAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.advisorRunStatus).mockImplementation(async (runId: string) => {
      if (runId === mockAIAdvisor.research_run.run_id) {
        return {
          run_id: runId,
          provider: "local",
          selected_model: mockLocalStatus.selected_model,
          answer_source: null,
          retry_of_run_id: null,
          restart_family_id: null,
          run_mode: "desk_fast",
          run_stage: "running_model",
          latency_ms: null,
          status_note: "Running local inference.",
          validation_summary_note: null,
          error_message: null,
          recovery_state: "stale_nonterminal",
          recovery_note: "This run may be stalled or orphaned. You can retry the same question safely.",
          can_retry: true,
          created_at: mockAIAdvisor.generated_at,
          started_at: mockAIAdvisor.research_run.started_at ?? null,
          completed_at: null,
          updated_at: mockAIAdvisor.research_run.updated_at,
          stage_history: mockAIAdvisor.stage_history.slice(0, 3),
          response: null,
        };
      }
      return {
        run_id: retriedAdvisor.research_run.run_id,
        provider: retriedAdvisor.provider_status.provider,
        selected_model: retriedAdvisor.provider_status.selected_model,
        answer_source: retriedAdvisor.answer_source,
        retry_of_run_id: mockAIAdvisor.research_run.run_id,
        restart_family_id: mockAIAdvisor.research_run.run_id,
        run_mode: retriedAdvisor.run_mode,
        run_stage: "complete",
        latency_ms: retriedAdvisor.latency_ms,
        status_note: retriedAdvisor.status_note,
        validation_summary_note: retriedAdvisor.validation_summary_note ?? null,
        error_message: null,
        recovery_state: "terminal",
        recovery_note: null,
        can_retry: true,
        created_at: retriedAdvisor.generated_at,
        started_at: retriedAdvisor.research_run.started_at ?? null,
        completed_at: retriedAdvisor.research_run.completed_at ?? null,
        updated_at: retriedAdvisor.research_run.updated_at,
        stage_history: retriedAdvisor.stage_history,
        response: retriedAdvisor,
      };
    });
    vi.mocked(apiClient.retryAdvisorRun).mockResolvedValueOnce({
      run_id: retriedAdvisor.research_run.run_id,
      provider: retriedAdvisor.provider_status.provider,
      selected_model: retriedAdvisor.provider_status.selected_model,
      answer_source: null,
      retry_of_run_id: mockAIAdvisor.research_run.run_id,
      restart_family_id: mockAIAdvisor.research_run.run_id,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued retry advisory run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: retriedAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: retriedAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await user.click(screen.getByRole("button", { name: /Run Local Terminal Brief/i }));

    expect(await screen.findByText(/may be stalled or orphaned/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry this question/i }));

    await waitFor(() => {
      expect(apiClient.retryAdvisorRun).toHaveBeenCalledWith(mockAIAdvisor.research_run.run_id);
    });
    expect(await screen.findByText("Brain Summary")).toBeInTheDocument();
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
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={null}
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Current Desk Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Last verified n/a / chart usable / 671m / stale")).toBeInTheDocument();
    expect(screen.getAllByText("Local ready").length).toBeGreaterThan(0);
  });

  it("opens the OAuth popup flow from the AI desk", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce(mockAIStatus);

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.BTC}
        assetLabel="BTCUSD"
        chart={mockMarketCharts["BTC:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={{ ...mockScenarioResearch, source_status: "disabled", availability_note: "MiroFish is disabled.", base_case: null, bull_case: null, bear_case: null }}
        riskDetail={null}
        selectedAIModel={mockAIStatus.selected_model}
        selectedAIProvider="openai"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="BTC"
        signalDetail={null}
        signals={mockSignals}
        timeframe="4h"
        tradeDetail={null}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");

    await user.click(screen.getByRole("button", { name: /Connect with OpenAI/i }));

    await waitFor(() => {
      expect(apiClient.aiOauthStartUrl).toHaveBeenCalledWith(window.location.origin);
    });
    const expectedStartUrl = oauthStartUrlFor(window.location.origin);
    expect(window.open).toHaveBeenCalledWith(
      expectedStartUrl,
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
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="BTC"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={null}
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
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockAIStatus.selected_model}
        selectedAIProvider="openai"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={null}
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Connection Guidance")).toBeInTheDocument();
    expect(screen.getAllByText(/session expired or was revoked/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Session expired").length).toBeGreaterThan(0);
    expect(screen.queryByText("session_expired")).not.toBeInTheDocument();
  });

  it("shows connected-local-fallback state when OpenAI auth exists but the run fell back locally", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce({
      ...mockAIStatus,
      status: "connected",
      connected: true,
      connected_account: "openai-user@example.com",
    });
    vi.mocked(apiClient.startAdvisorRun).mockResolvedValueOnce({
      run_id: mockAIAdvisor.research_run.run_id,
      provider: "openai",
      selected_model: mockAIAdvisor.provider_status.selected_model,
      answer_source: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued authenticated advisory run.",
      validation_summary_note: null,
      error_message: null,
      created_at: mockAIAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.advisorRunStatus).mockResolvedValueOnce({
      run_id: mockAIAdvisor.research_run.run_id,
      provider: "openai",
      selected_model: mockAIAdvisor.provider_status.selected_model,
      answer_source: "local_fallback",
      run_mode: "desk_fast",
      run_stage: "complete",
      latency_ms: mockAIAdvisor.latency_ms,
      status_note: "The openai path was unavailable for this run, so AI Trader kept the deterministic local advisory.",
      validation_summary_note: mockAIAdvisor.validation_summary_note ?? null,
      error_message: null,
      created_at: mockAIAdvisor.generated_at,
      started_at: mockAIAdvisor.research_run.started_at ?? null,
      completed_at: mockAIAdvisor.research_run.completed_at ?? null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: mockAIAdvisor.stage_history,
      response: {
        ...mockAIAdvisor,
        answer_source: "local_fallback",
        provider_status: {
          ...mockAIAdvisor.provider_status,
          status: "connected",
          connected: true,
        },
        warnings: ["OpenAI timed out for this run, so AI Desk returned the local structured brief instead."],
      },
    });

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockAIStatus.selected_model}
        selectedAIProvider="openai"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await user.click(screen.getByRole("button", { name: /Run Terminal Brain/i }));

    expect((await screen.findAllByText("Connected · local fallback")).length).toBeGreaterThan(0);
    expect(screen.getByText(/timed out for this run/i)).toBeInTheDocument();
  });

  it("shows live GPT labeling only when the current response actually used OpenAI", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce({
      ...mockAIStatus,
      status: "connected",
      connected: true,
      connected_account: "openai-user@example.com",
    });
    vi.mocked(apiClient.startAdvisorRun).mockResolvedValueOnce({
      run_id: mockAIAdvisor.research_run.run_id,
      provider: "openai",
      selected_model: mockAIAdvisor.provider_status.selected_model,
      answer_source: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued authenticated advisory run.",
      validation_summary_note: null,
      error_message: null,
      created_at: mockAIAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.advisorRunStatus).mockResolvedValueOnce({
      run_id: mockAIAdvisor.research_run.run_id,
      provider: "openai",
      selected_model: mockAIAdvisor.provider_status.selected_model,
      answer_source: mockAIAdvisor.answer_source,
      run_mode: mockAIAdvisor.run_mode,
      run_stage: "complete",
      latency_ms: mockAIAdvisor.latency_ms,
      status_note: mockAIAdvisor.status_note,
      validation_summary_note: mockAIAdvisor.validation_summary_note ?? null,
      error_message: null,
      created_at: mockAIAdvisor.generated_at,
      started_at: mockAIAdvisor.research_run.started_at ?? null,
      completed_at: mockAIAdvisor.research_run.completed_at ?? null,
      updated_at: mockAIAdvisor.research_run.updated_at,
      stage_history: mockAIAdvisor.stage_history,
      response: mockAIAdvisor,
    });

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockAIStatus.selected_model}
        selectedAIProvider="openai"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await user.click(screen.getByRole("button", { name: /Run Terminal Brain/i }));

    expect((await screen.findAllByText("Live GPT response")).length).toBeGreaterThan(0);
    expect(screen.getByText(mockAIAdvisor.final_answer)).toBeInTheDocument();
  });

  it("shows Ollama response labeling only when the advisory actually used Ollama", async () => {
    const user = userEvent.setup();
    const ollamaAdvisor = {
      ...mockAIAdvisor,
      answer_source: "ollama_response" as const,
      provider_status: mockOllamaStatus,
      research_run: {
        ...mockAIAdvisor.research_run,
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: "ollama_response" as const,
      },
    };

    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce(mockOllamaStatus);
    vi.mocked(apiClient.startAdvisorRun).mockResolvedValueOnce({
      run_id: ollamaAdvisor.research_run.run_id,
      provider: "ollama",
      selected_model: "llama3.2:latest",
      answer_source: null,
      run_mode: "desk_fast",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued local advisory run.",
      validation_summary_note: null,
      error_message: null,
      created_at: ollamaAdvisor.generated_at,
      started_at: null,
      completed_at: null,
      updated_at: ollamaAdvisor.research_run.updated_at,
      stage_history: [],
      response: null,
    });
    vi.mocked(apiClient.advisorRunStatus).mockResolvedValueOnce({
      run_id: ollamaAdvisor.research_run.run_id,
      provider: "ollama",
      selected_model: "llama3.2:latest",
      answer_source: "ollama_response",
      run_mode: "desk_fast",
      run_stage: "complete",
      latency_ms: ollamaAdvisor.latency_ms,
      status_note: ollamaAdvisor.status_note,
      validation_summary_note: ollamaAdvisor.validation_summary_note ?? null,
      error_message: null,
      created_at: ollamaAdvisor.generated_at,
      started_at: ollamaAdvisor.research_run.started_at ?? null,
      completed_at: ollamaAdvisor.research_run.completed_at ?? null,
      updated_at: ollamaAdvisor.research_run.updated_at,
      stage_history: ollamaAdvisor.stage_history,
      response: ollamaAdvisor,
    });

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockOllamaStatus.selected_model}
        selectedAIProvider="ollama"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await user.click(screen.getByRole("button", { name: /Run Terminal Brain/i }));

    expect((await screen.findAllByText("Ollama response")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("llama3.2:latest").length).toBeGreaterThan(0);
  });

  it("restores the last local thread for the same signal context from session storage", async () => {
    window.sessionStorage.setItem(
      "ai-trader:ai-desk:WTI:none:none:none",
      JSON.stringify({
        question: "Continue the prior oil scenario thread.",
        response: mockLocalAdvisor,
      }),
    );

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockAIStatus.selected_model}
        selectedAIProvider="openai"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={null}
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByDisplayValue("Continue the prior oil scenario thread.")).toBeInTheDocument();
    expect(screen.getByText("Brain Summary")).toBeInTheDocument();
    expect(screen.getAllByText("Local advisory").length).toBeGreaterThan(0);
  });

  it("keeps restored local threads labeled as local advisory after auth becomes connected", async () => {
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce({
      ...mockAIStatus,
      status: "connected",
      connected: true,
      connected_account: "openai-user@example.com",
    });
    window.sessionStorage.setItem(
      "ai-trader:ai-desk:WTI:none:none:none",
      JSON.stringify({
        question: "Keep the local memo while I reconnect OpenAI.",
        response: mockLocalAdvisor,
      }),
    );

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={null}
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByDisplayValue("Keep the local memo while I reconnect OpenAI.")).toBeInTheDocument();
    expect(screen.getAllByText("Local advisory").length).toBeGreaterThan(0);
    expect(screen.queryByText("Connected · local brief")).not.toBeInTheDocument();
  });

  it("keeps trade-thread continuity separate and sends selected_trade_id when a trade is in scope", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      `ai-trader:ai-desk:WTI:none:none:${mockPaperTradeDetail.trade_id}`,
      JSON.stringify({
        question: "Continue the current paper trade.",
        response: mockAIAdvisor,
      }),
    );

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTradeId={mockPaperTradeDetail.trade_id}
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={mockPaperTradeDetail}
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByDisplayValue("Continue the current paper trade.")).toBeInTheDocument();
    expect(screen.getByText(mockAIAdvisor.context_snapshot.trade_focus!)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Run (Local Terminal Brief|Terminal Brain)/i }));

    await waitFor(() => {
      expect(apiClient.startAdvisorRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selected_trade_id: mockPaperTradeDetail.trade_id,
        }),
      );
    });
  });

  it("uses focused fallback signal and risk ids when explicit selection ids are missing", async () => {
    const user = userEvent.setup();

    render(
      <AIDeskTab
        activeTab="ai_desk"
        assetContext={mockAssetContexts.WTI}
        assetLabel="USOUSD"
        chart={mockMarketCharts["WTI:1d"]}
        deskSectionNotes={{}}
        focusedRiskReportId={mockAIAdvisor.research_run.selected_risk_report_id}
        focusedSignalId={mockAIAdvisor.research_run.selected_signal_id}
        onNavigate={vi.fn()}
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={null}
        watchlist={mockWatchlistSummary}
      />,
    );

    await screen.findByText("Ask The Desk Brain");
    await user.click(screen.getByRole("button", { name: /Run (Local Terminal Brief|Terminal Brain)/i }));

    await waitFor(() => {
      expect(apiClient.startAdvisorRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selected_signal_id: mockAIAdvisor.research_run.selected_signal_id,
          selected_risk_report_id: mockAIAdvisor.research_run.selected_risk_report_id,
        }),
      );
    });
  });

  it("shows calm auth-unavailable guidance without leaking raw provider text", async () => {
    vi.mocked(apiClient.aiStatus).mockResolvedValueOnce({
      ...mockAIStatus,
      status: "auth_unavailable",
      connected: false,
      warning: "OpenAI could not refresh the saved session right now. Reconnect or keep using the local advisory brief.",
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
        scenario={mockScenarioResearch}
        riskDetail={null}
        selectedAIModel={mockAIStatus.selected_model}
        selectedAIProvider="openai"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        signalDetail={null}
        signals={mockSignals}
        timeframe="1d"
        tradeDetail={null}
        watchlist={mockWatchlistSummary}
      />,
    );

    expect(await screen.findByText("Connection Guidance")).toBeInTheDocument();
    expect(screen.getAllByText("Reconnect needed").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/could not refresh the saved session right now/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("auth_unavailable")).not.toBeInTheDocument();
  });
});
