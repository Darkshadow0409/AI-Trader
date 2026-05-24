import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { mockAIStatus, mockOllamaStatus, mockResearch, mockResearchRun, mockResearchRuns, mockScenarioResearch } from "../api/mockData";
import { ResearchTab } from "./ResearchTab";

vi.mock("../api/client", () => ({
  apiClient: {
    aiStatus: vi.fn(),
    startResearchRunAsync: vi.fn(),
    researchRunStatus: vi.fn(),
    researchRun: vi.fn(),
    retryResearchRun: vi.fn(),
  },
}));

const mockLocalStatus = {
  ...mockAIStatus,
  provider: "local",
  auth_mode: "none",
  status: "ready",
  connected: false,
  default_model: "deterministic_brief",
  selected_model: "deterministic_brief",
  available_models: ["deterministic_brief"],
  guidance: "Deterministic local advisory is ready.",
  oauth_enabled: false,
  oauth_connect_url: null,
  oauth_callback_url: null,
};

describe("ResearchTab", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(apiClient.aiStatus).mockResolvedValue(mockLocalStatus);
    vi.mocked(apiClient.startResearchRunAsync).mockResolvedValue({
      run_id: mockResearchRun.run_id,
      mode: mockResearchRun.mode,
      provider: mockResearchRun.provider,
      selected_model: mockResearchRun.selected_model,
      answer_source: null,
      run_mode: mockResearchRun.run_mode,
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued research run.",
      validation_summary_note: null,
      error_message: null,
      created_at: mockResearchRun.created_at,
      started_at: null,
      completed_at: null,
      updated_at: mockResearchRun.updated_at,
      stage_history: [],
      research_run: null,
    });
    vi.mocked(apiClient.researchRunStatus).mockResolvedValue({
      run_id: mockResearchRun.run_id,
      mode: mockResearchRun.mode,
      provider: mockResearchRun.provider,
      selected_model: mockResearchRun.selected_model,
      answer_source: mockResearchRun.answer_source,
      retry_of_run_id: null,
      restart_family_id: null,
      run_mode: mockResearchRun.run_mode,
      run_stage: "complete",
      latency_ms: mockResearchRun.latency_ms,
      status_note: mockResearchRun.status_note,
      validation_summary_note: mockResearchRun.validation_summary_note ?? null,
      error_message: null,
      recovery_state: "terminal",
      recovery_note: null,
      can_retry: true,
      created_at: mockResearchRun.created_at,
      started_at: mockResearchRun.started_at ?? null,
      completed_at: mockResearchRun.completed_at ?? null,
      updated_at: mockResearchRun.updated_at,
      stage_history: mockResearchRun.stage_history,
      research_run: mockResearchRun,
    });
    vi.mocked(apiClient.researchRun).mockResolvedValue(mockResearchRun);
    vi.mocked(apiClient.retryResearchRun).mockResolvedValue({
      run_id: `retry-${mockResearchRun.run_id}`,
      mode: mockResearchRun.mode,
      provider: mockResearchRun.provider,
      selected_model: mockResearchRun.selected_model,
      answer_source: null,
      retry_of_run_id: mockResearchRun.run_id,
      restart_family_id: mockResearchRun.run_id,
      run_mode: mockResearchRun.run_mode,
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued retry research run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: mockResearchRun.created_at,
      started_at: null,
      completed_at: null,
      updated_at: mockResearchRun.updated_at,
      stage_history: [],
      research_run: null,
    });
  });

  it("renders deterministic rows and research run history", async () => {
    const user = userEvent.setup();
    const onSelectSymbol = vi.fn();

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={onSelectSymbol}
        rows={mockResearch}
        runs={mockResearchRuns}
        scenario={mockScenarioResearch}
        selectedRiskReportId={mockResearchRun.selected_risk_report_id}
        selectedSignalId={mockResearchRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={mockResearchRun.trade_context_id}
        timeframe="1d"
      />,
    );

    expect(screen.getByText("Research Console")).toBeInTheDocument();
    expect(screen.getByText(/Run A Grounded Memo/i)).toBeInTheDocument();
    expect(screen.getByText("Research History")).toBeInTheDocument();
    expect(screen.getByText("Research Memo Detail")).toBeInTheDocument();
    expect(screen.getAllByText(mockResearchRun.final_summary).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recent stages:/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Trader Asset")).toBeInTheDocument();
    expect(screen.getAllByText("Provider").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Live GPT response").length).toBeGreaterThan(0);

    await user.click(screen.getByText(mockResearch[1].label));
    expect(onSelectSymbol).toHaveBeenCalledWith(mockResearch[1].symbol);
  });

  it("renders local research runs honestly when the run did not use live GPT", async () => {
    const localRun = {
      ...mockResearchRun,
      answer_source: "local_brief" as const,
      final_summary: "Local advisory memo for the current oil setup.",
      final_answer: "Local advisory memo for the current oil setup.",
    };

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[localRun]}
        scenario={mockScenarioResearch}
        selectedRiskReportId={localRun.selected_risk_report_id}
        selectedSignalId={localRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={localRun.trade_context_id}
        timeframe="1d"
      />,
    );

    await waitFor(() => {
      expect(apiClient.aiStatus).toHaveBeenCalled();
    });
    expect(screen.getAllByText("Local advisory").length).toBeGreaterThan(0);
    expect(screen.queryByText("Connected · local brief")).not.toBeInTheDocument();
  });

  it("renders Ollama-backed research runs with readable provider and answer-source labels", async () => {
    const ollamaRun = {
      ...mockResearchRun,
      provider: "ollama",
      selected_model: "llama3.2:latest",
      answer_source: "ollama_response" as const,
      run_mode: "research_full" as const,
      latency_ms: 97200,
      final_summary: "Ollama-backed research memo for the current oil setup.",
      final_answer: "Ollama-backed research memo for the current oil setup.",
    };

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[ollamaRun]}
        scenario={mockScenarioResearch}
        selectedRiskReportId={ollamaRun.selected_risk_report_id}
        selectedSignalId={ollamaRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={ollamaRun.trade_context_id}
        timeframe="1d"
      />,
    );

    await waitFor(() => {
      expect(apiClient.aiStatus).toHaveBeenCalled();
    });
    expect(screen.getAllByText("Ollama response").length).toBeGreaterThan(0);
    expect(screen.getByText("Research full path")).toBeInTheDocument();
    expect(screen.getByText("97s")).toBeInTheDocument();
    expect(screen.getAllByText("llama3.2:latest").length).toBeGreaterThan(0);
  });

  it("exposes gemma as an optional Ollama research model without changing the default selection", async () => {
    vi.mocked(apiClient.aiStatus).mockResolvedValue(mockOllamaStatus);

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={mockResearchRuns}
        scenario={mockScenarioResearch}
        selectedAIModel={mockOllamaStatus.selected_model}
        selectedAIProvider="ollama"
        selectedRiskReportId={mockResearchRun.selected_risk_report_id}
        selectedSignalId={mockResearchRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={mockResearchRun.trade_context_id}
        timeframe="1d"
      />,
    );

    await screen.findByText(/Run A Grounded Memo/i);
    await waitFor(() => {
      expect(screen.getAllByDisplayValue("llama3.2:latest").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("option", { name: "gemma4:e4b" })).toBeInTheDocument();
  });

  it("shows staged long-running local research status while a run is in flight", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.aiStatus).mockResolvedValue(mockOllamaStatus);
    vi.mocked(apiClient.startResearchRunAsync).mockResolvedValueOnce({
      run_id: mockResearchRun.run_id,
      mode: "research",
      provider: "ollama",
      selected_model: "llama3.2:latest",
      answer_source: null,
      run_mode: "research_full",
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued research run.",
      validation_summary_note: null,
      error_message: null,
      created_at: mockResearchRun.created_at,
      started_at: null,
      completed_at: null,
      updated_at: mockResearchRun.updated_at,
      stage_history: [],
      research_run: null,
    });
    vi.mocked(apiClient.researchRunStatus)
      .mockResolvedValueOnce({
        run_id: mockResearchRun.run_id,
        mode: "research",
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: null,
        run_mode: "research_full",
        run_stage: "building_context",
        latency_ms: null,
        status_note: "Building advisory context from delayed/public market data.",
        validation_summary_note: null,
        error_message: null,
        created_at: mockResearchRun.created_at,
        started_at: mockResearchRun.started_at ?? null,
        completed_at: null,
        updated_at: mockResearchRun.updated_at,
        stage_history: mockResearchRun.stage_history.slice(0, 2),
        research_run: null,
      })
      .mockResolvedValueOnce({
        run_id: mockResearchRun.run_id,
        mode: "research",
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: null,
        run_mode: "research_full",
        run_stage: "validating_output",
        latency_ms: null,
        status_note: "Validated before display against delayed/public desk truth.",
        validation_summary_note: null,
        error_message: null,
        created_at: mockResearchRun.created_at,
        started_at: mockResearchRun.started_at ?? null,
        completed_at: null,
        updated_at: mockResearchRun.updated_at,
        stage_history: mockResearchRun.stage_history.slice(0, 4),
        research_run: null,
      })
      .mockResolvedValueOnce({
        run_id: mockResearchRun.run_id,
        mode: "research",
        provider: "ollama",
        selected_model: "llama3.2:latest",
        answer_source: "ollama_response",
        run_mode: "research_full",
        run_stage: "complete",
        latency_ms: 81400,
        status_note: "Completed local Ollama inference in research full mode on delayed/public market context.",
        validation_summary_note: mockResearchRun.validation_summary_note ?? null,
        error_message: null,
        created_at: mockResearchRun.created_at,
        started_at: mockResearchRun.started_at ?? null,
        completed_at: mockResearchRun.completed_at ?? null,
        updated_at: mockResearchRun.updated_at,
        stage_history: mockResearchRun.stage_history,
        research_run: {
          ...mockResearchRun,
          provider: "ollama",
          selected_model: "llama3.2:latest",
          answer_source: "ollama_response",
          run_mode: "research_full",
          run_stage: "complete",
          latency_ms: 81400,
        },
      });

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[]}
        scenario={mockScenarioResearch}
        selectedAIModel={mockOllamaStatus.selected_model}
        selectedAIProvider="ollama"
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTradeId={null}
        timeframe="1d"
      />,
    );

    await screen.findByText(/Run A Grounded Memo/i);
    await user.click(screen.getByRole("button", { name: /Start research run/i }));

    expect(await screen.findByText("Active Run")).toBeInTheDocument();
    expect(screen.getByText("Research Console")).toBeInTheDocument();
    const activeRunPanel = screen.getByText("Active Run").closest("article");
    expect(activeRunPanel).not.toBeNull();
    expect(within(activeRunPanel!).getByRole("heading", { name: "Building advisory context" })).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText("Ollama")).toBeInTheDocument();
    expect(within(activeRunPanel!).getAllByText("llama3.2:latest").length).toBeGreaterThan(0);
    expect(within(activeRunPanel!).getByText("Refresh status")).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText("Prepare next query")).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText(/screen will keep polling automatically/i)).toBeInTheDocument();
    expect(within(activeRunPanel!).getByText(/Recent stages: Queued -> Building advisory context/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(apiClient.aiStatus).toHaveBeenCalled();
      expect(apiClient.startResearchRunAsync).toHaveBeenCalled();
    });
    expect(await screen.findByText("Recent Completion")).toBeInTheDocument();
    expect(screen.getByText("Latest Good Completion")).toBeInTheDocument();
    expect(screen.getAllByText("Validated before display against delayed/public desk truth.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Queued -> Building advisory context -> Running local inference -> Finalizing advisory response -> Complete/i).length).toBeGreaterThan(0);
    expect(vi.mocked(apiClient.researchRunStatus).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("creates a new research run from the current selected symbol", async () => {
    const user = userEvent.setup();
    const refreshRuns = vi.fn().mockResolvedValue(undefined);

    render(
      <ResearchTab
        onRefreshRuns={refreshRuns}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[]}
        scenario={mockScenarioResearch}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTradeId={null}
        timeframe="1d"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Start research run/i }));

    await waitFor(() => {
        expect(apiClient.startResearchRunAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            symbol: "WTI",
            provider: "local",
            model: null,
            mode: "research",
            active_tab: "research",
          }),
      );
    });
    await waitFor(() => {
      expect(refreshRuns).toHaveBeenCalled();
    });
  });

  it("shows resume polling for an active selected run outside the live polling loop", async () => {
    const activeRun = {
      ...mockResearchRun,
      run_stage: "running_model" as const,
      final_summary: "This run is still active.",
    };

    vi.mocked(apiClient.researchRunStatus).mockResolvedValueOnce({
      run_id: activeRun.run_id,
      mode: activeRun.mode,
      provider: activeRun.provider,
      selected_model: activeRun.selected_model,
      answer_source: activeRun.answer_source,
      retry_of_run_id: null,
      restart_family_id: null,
      run_mode: activeRun.run_mode,
      run_stage: "running_model",
      latency_ms: null,
      status_note: "Running local model.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: activeRun.created_at,
      started_at: activeRun.started_at ?? null,
      completed_at: null,
      updated_at: activeRun.updated_at,
      stage_history: activeRun.stage_history.slice(0, 3),
      research_run: null,
    });

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[activeRun]}
        scenario={mockScenarioResearch}
        selectedRiskReportId={activeRun.selected_risk_report_id}
        selectedSignalId={activeRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={activeRun.trade_context_id}
        timeframe="1d"
      />,
    );

    expect(await screen.findByRole("button", { name: /Resume polling/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Running local inference" })).toBeInTheDocument();
  });

  it("shows stale-run recovery guidance and retries the same question safely", async () => {
    const staleRun = {
      ...mockResearchRun,
      run_id: "research-stale-run",
      query: "Retry the stale oil memo safely.",
      run_stage: "running_model" as const,
      final_summary: "Stale oil memo still waiting for a result.",
    };
    const retriedRun = {
      ...mockResearchRun,
      run_id: "research-retry-run",
      query: staleRun.query,
      retry_of_run_id: staleRun.run_id,
      restart_family_id: staleRun.run_id,
      final_summary: "Retried oil memo completed cleanly.",
    };

    vi.mocked(apiClient.researchRunStatus).mockImplementation(async (runId: string) => {
      if (runId === staleRun.run_id) {
        return {
          run_id: staleRun.run_id,
          mode: staleRun.mode,
          provider: staleRun.provider,
          selected_model: staleRun.selected_model,
          answer_source: staleRun.answer_source,
          retry_of_run_id: null,
          restart_family_id: null,
          run_mode: staleRun.run_mode,
          run_stage: "running_model",
          latency_ms: null,
          status_note: "Running local model.",
          validation_summary_note: null,
          error_message: null,
          recovery_state: "stale_nonterminal",
          recovery_note: "This run may be stalled or orphaned. You can retry the same question safely.",
          can_retry: true,
          created_at: staleRun.created_at,
          started_at: staleRun.started_at ?? null,
          completed_at: null,
          updated_at: staleRun.updated_at,
          stage_history: staleRun.stage_history.slice(0, 3),
          research_run: null,
        };
      }
      return {
        run_id: retriedRun.run_id,
        mode: retriedRun.mode,
        provider: retriedRun.provider,
        selected_model: retriedRun.selected_model,
        answer_source: retriedRun.answer_source,
        retry_of_run_id: staleRun.run_id,
        restart_family_id: staleRun.run_id,
        run_mode: retriedRun.run_mode,
        run_stage: "complete",
        latency_ms: retriedRun.latency_ms,
        status_note: retriedRun.status_note,
        validation_summary_note: retriedRun.validation_summary_note ?? null,
        error_message: null,
        recovery_state: "terminal",
        recovery_note: null,
        can_retry: true,
        created_at: retriedRun.created_at,
        started_at: retriedRun.started_at ?? null,
        completed_at: retriedRun.completed_at ?? null,
        updated_at: retriedRun.updated_at,
        stage_history: retriedRun.stage_history,
        research_run: retriedRun,
      };
    });
    vi.mocked(apiClient.retryResearchRun).mockResolvedValueOnce({
      run_id: retriedRun.run_id,
      mode: retriedRun.mode,
      provider: retriedRun.provider,
      selected_model: retriedRun.selected_model,
      answer_source: null,
      retry_of_run_id: staleRun.run_id,
      restart_family_id: staleRun.run_id,
      run_mode: retriedRun.run_mode,
      run_stage: "queued",
      latency_ms: null,
      status_note: "Queued retry research run.",
      validation_summary_note: null,
      error_message: null,
      recovery_state: "active",
      recovery_note: null,
      can_retry: false,
      created_at: retriedRun.created_at,
      started_at: null,
      completed_at: null,
      updated_at: retriedRun.updated_at,
      stage_history: [],
      research_run: null,
    });

    const user = userEvent.setup();
    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[staleRun]}
        scenario={mockScenarioResearch}
        selectedRiskReportId={staleRun.selected_risk_report_id}
        selectedSignalId={staleRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={staleRun.trade_context_id}
        timeframe="1d"
      />,
    );

    const retryButton = await screen.findByRole("button", { name: /Retry this question/i });
    expect(await screen.findByText("This run may be stalled or orphaned. You can retry the same question safely.")).toBeInTheDocument();
    await user.click(retryButton);

    await waitFor(() => {
      expect(apiClient.retryResearchRun).toHaveBeenCalledWith(staleRun.run_id);
    });
    expect(await screen.findByText(`Retry of run ${staleRun.run_id}.`)).toBeInTheDocument();
  });

  it("prepares a fresh run from the selected memo without carrying retry lineage", async () => {
    const customRun = {
      ...mockResearchRun,
      query: "Build a fresh silver memo from this starting point.",
    };
    const user = userEvent.setup();

    vi.mocked(apiClient.researchRunStatus).mockResolvedValueOnce({
      run_id: customRun.run_id,
      mode: customRun.mode,
      provider: customRun.provider,
      selected_model: customRun.selected_model,
      answer_source: customRun.answer_source,
      retry_of_run_id: null,
      restart_family_id: null,
      run_mode: customRun.run_mode,
      run_stage: "complete",
      latency_ms: customRun.latency_ms,
      status_note: customRun.status_note,
      validation_summary_note: customRun.validation_summary_note ?? null,
      error_message: null,
      recovery_state: "terminal",
      recovery_note: null,
      can_retry: true,
      created_at: customRun.created_at,
      started_at: customRun.started_at ?? null,
      completed_at: customRun.completed_at ?? null,
      updated_at: customRun.updated_at,
      stage_history: customRun.stage_history,
      research_run: customRun,
    });

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[customRun]}
        scenario={mockScenarioResearch}
        selectedRiskReportId={customRun.selected_risk_report_id}
        selectedSignalId={customRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={customRun.trade_context_id}
        timeframe="1d"
      />,
    );

    await screen.findByText("Selected Run Status");
    await user.click(screen.getByRole("button", { name: /Start fresh run/i }));

    expect(screen.getByRole("textbox", { name: /Research question/i })).toHaveValue(customRun.query);
    expect(screen.queryByText(/Retry of run/i)).not.toBeInTheDocument();
  });

  it("uses focused fallback signal and risk ids when explicit selection ids are missing", async () => {
    const user = userEvent.setup();

    render(
      <ResearchTab
        focusedRiskReportId={mockResearchRun.selected_risk_report_id}
        focusedSignalId={mockResearchRun.selected_signal_id}
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[]}
        scenario={mockScenarioResearch}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTradeId={null}
        timeframe="1d"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Start research run/i }));

    await waitFor(() => {
        expect(apiClient.startResearchRunAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: "local",
            selected_signal_id: mockResearchRun.selected_signal_id,
            selected_risk_report_id: mockResearchRun.selected_risk_report_id,
          }),
      );
    });
  });

  it("shows an honest empty state when no research runs or deterministic rows are loaded", async () => {
    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={[]}
        runs={[]}
        scenario={{ ...mockScenarioResearch, source_status: "disabled", availability_note: "MiroFish is disabled.", base_case: null, bull_case: null, bear_case: null }}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTradeId={null}
        timeframe="1d"
      />,
    );

    await waitFor(() => {
      expect(apiClient.aiStatus).toHaveBeenCalled();
    });
    expect(screen.getByText("No research runs are stored yet.")).toBeInTheDocument();
    expect(screen.getByText("No deterministic research rows are loaded for the current board.")).toBeInTheDocument();
    expect(screen.getAllByText("MiroFish is disabled.").length).toBeGreaterThan(0);
  });

  it("restores the selected research run directly when the history list is empty on revisit", async () => {
    window.sessionStorage.setItem("ai-trader:selected-research-run-id", mockResearchRun.run_id);

    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[]}
        runsLoading
        scenario={mockScenarioResearch}
        selectedRiskReportId={mockResearchRun.selected_risk_report_id}
        selectedSignalId={mockResearchRun.selected_signal_id}
        selectedSymbol="WTI"
        selectedTradeId={mockResearchRun.trade_context_id}
        timeframe="1d"
      />,
    );

    await waitFor(() => {
      expect(apiClient.researchRun).toHaveBeenCalledWith(mockResearchRun.run_id);
    });

    expect(screen.getAllByText(/selected research memo/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Research Memo Detail" })).toBeInTheDocument();
  });

  it("shows explicit research-history hydration copy instead of the generic syncing block", async () => {
    render(
      <ResearchTab
        onRefreshRuns={vi.fn().mockResolvedValue(undefined)}
        onSelectSymbol={vi.fn()}
        rows={mockResearch}
        runs={[]}
        runsLoading
        scenario={mockScenarioResearch}
        selectedRiskReportId={null}
        selectedSignalId={null}
        selectedSymbol="WTI"
        selectedTradeId={null}
        timeframe="1d"
      />,
    );

    await waitFor(() => {
      expect(apiClient.aiStatus).toHaveBeenCalled();
    });

    expect(screen.getAllByText("Research history summary is live. Detailed run rows are hydrating.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Syncing operator data…")).not.toBeInTheDocument();
  });
});
