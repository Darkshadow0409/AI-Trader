import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { formatDateTimeIST } from "../lib/time";
import type {
  AIAdvisorResponseView,
  AIDeskContextSnapshotView,
  AIProviderStatusView,
  AssetContextView,
  MarketChartView,
  RiskDetailView,
  SignalDetailView,
  SignalView,
  WatchlistSummaryView,
} from "../types/api";

interface AIDeskTabProps {
  activeTab: string;
  assetContext: AssetContextView;
  assetLabel: string;
  chart: MarketChartView;
  deskSectionNotes: Record<string, string>;
  onNavigate: (tab: string) => void;
  riskDetail: RiskDetailView | null;
  selectedRiskReportId: string | null;
  selectedSignalId: string | null;
  selectedSymbol: string;
  signalDetail: SignalDetailView | null;
  signals: SignalView[];
  timeframe: string;
  watchlist: WatchlistSummaryView[];
}

const emptyStatus: AIProviderStatusView = {
  provider: "openai",
  auth_mode: "oauth",
  status: "oauth_not_configured",
  connected: false,
  oauth_enabled: false,
  oauth_connect_url: null,
  oauth_callback_url: null,
  connected_account: null,
  default_model: "gpt-5.4",
  selected_model: "gpt-5.4",
  available_models: ["gpt-5.4", "gpt-5", "gpt-5-mini"],
  guidance: "Connect with OpenAI to enable the advisory agents.",
  warning: null,
  session_expires_at: null,
};

const workspaceLabels: Record<string, string> = {
  desk: "Desk",
  signals: "Signals",
  high_risk: "High Risk",
  watchlist: "Watchlist",
  trade_tickets: "Tickets",
  active_trades: "Trades",
  journal: "Journal",
  session: "Review Queue",
  strategy_lab: "Strategy",
  backtests: "Backtests",
  replay: "Replay",
  pilot_ops: "Pilot Ops",
  risk: "Risk",
  research: "Research",
  news: "News",
  polymarket: "Polymarket",
  ai_desk: "AI Desk",
  wallet_balance: "Wallet",
};

interface AIViewState {
  status: AIProviderStatusView;
  response: AIAdvisorResponseView | null;
  loading: boolean;
  error: string | null;
}

function friendlyAiError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("Failed to fetch")) {
    return "AI Desk cannot reach the local backend right now. Refresh the local stack and try again.";
  }
  if (message.includes("/ai/status returned 404")) {
    return "AI settings are unavailable on the current backend. Refresh the local stack and try again.";
  }
  if (message.includes("/ai/status returned 503")) {
    return "OpenAI OAuth is not configured on this backend yet. Add the OAuth env vars, then reload this page.";
  }
  if (message.includes("/ai/advisor returned 404")) {
    return "The advisory service is unavailable on this backend right now. Refresh the local stack and retry.";
  }
  if (message.includes("/ai/advisor returned 422")) {
    return "The advisory request was rejected. Check the current desk context and retry after the backend finishes loading.";
  }
  if (message.includes("/ai/advisor returned 401") || message.includes("/ai/advisor returned 403")) {
    return "OpenAI auth is missing or expired for this advisory run. Reconnect and try again.";
  }
  if (message.includes("/ai/advisor returned 503")) {
    return "OpenAI OAuth is not configured on this backend yet. Add the OAuth env vars, then retry.";
  }
  if (message.includes("timed out")) {
    return "The AI request timed out while the local stack was busy. Retry after the desk finishes loading.";
  }
  return message;
}

function contextLeadSignal(selectedSymbol: string, rows: SignalView[]): SignalView | null {
  return rows.find((row) => row.symbol === selectedSymbol) ?? null;
}

function dataModeLabel(mode: string): string {
  return {
    fixture: "Fixture data",
    public_live: "Public live data",
    broker_live: "Broker live data",
  }[mode] ?? mode.replace(/_/g, " ");
}

function feedSourceLabel(sourceMode: string): string {
  return {
    live: "Live-capable source family",
    sample: "Sample source family",
    fixture: "Fixture source family",
  }[sourceMode] ?? sourceMode.replace(/_/g, " ");
}

function workspaceLabel(tab: string): string {
  return workspaceLabels[tab] ?? tab.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function localSnapshot(
  activeTab: string,
  assetContext: AssetContextView,
  assetLabel: string,
  chart: MarketChartView,
  leadSignal: SignalView | null,
  riskDetail: RiskDetailView | null,
  signalDetail: SignalDetailView | null,
  watchlist: WatchlistSummaryView[],
): AIDeskContextSnapshotView {
  const freshnessMinutes = chart.freshness_minutes;
  const freshnessState = chart.freshness_state ?? "loading";
  const signalFocus = signalDetail
    ? `${signalDetail.symbol} ${signalDetail.signal_type} · score ${signalDetail.score.toFixed(1)} · ${Math.round(signalDetail.confidence * 100)}% confidence`
    : leadSignal
      ? `${leadSignal.symbol} ${leadSignal.signal_type} · score ${leadSignal.score.toFixed(1)} · ${Math.round(leadSignal.confidence * 100)}% confidence`
      : null;
  const riskFocus = riskDetail
    ? `${riskDetail.symbol} stop ${riskDetail.stop_price.toFixed(2)} · size ${riskDetail.size_band} · max risk ${riskDetail.max_portfolio_risk_pct.toFixed(3)}%`
    : assetContext.latest_risk
      ? `${assetContext.latest_risk.symbol} stop ${assetContext.latest_risk.stop_price.toFixed(2)} · size ${assetContext.latest_risk.size_band}`
      : null;
  return {
    selected_instrument: assetLabel,
    active_workspace: workspaceLabel(activeTab),
    timeframe: chart.timeframe,
    market_freshness: freshnessMinutes == null ? freshnessState : `${freshnessState} · ${freshnessMinutes}m`,
    data_mode_label: dataModeLabel(chart.market_data_mode),
    feed_source_label: feedSourceLabel(chart.source_mode),
    truth_note:
      chart.status_note
      ?? assetContext.data_reality?.ui_warning
      ?? assetContext.data_reality?.tradable_alignment_note
      ?? "Current desk truth is still bounded by local feed availability and freshness.",
    signal_focus: signalFocus,
    risk_focus: riskFocus,
    watchlist_board: watchlist.slice(0, 5).map((row) => row.instrument_mapping.trader_symbol),
    catalyst_headlines: assetContext.related_news?.slice(0, 3).map((row) => row.title) ?? [],
    crowd_markets: assetContext.related_polymarket_markets?.slice(0, 3).map((row) => row.question) ?? [],
  };
}

function providerStatusMessage(status: AIProviderStatusView): string | null {
  if (status.connected) {
    return status.warning ?? null;
  }
  switch (status.status) {
    case "oauth_not_configured":
      return "OpenAI connection is not configured on this backend. AI Desk will keep using the local structured brief until OAuth credentials are added.";
    case "session_expired":
      return "Your OpenAI session expired or was revoked. Reconnect to continue authenticated advisory runs.";
    case "auth_unavailable":
      return "OpenAI could not refresh the saved session right now. Reconnect or keep using the local structured brief.";
    case "auth_required":
      return "Connect with OpenAI if you want an authenticated advisory run. The local terminal brief stays available without it.";
    default:
      return status.warning ?? null;
  }
}

function connectionLabel(status: AIProviderStatusView): string {
  if (status.connected) {
    return "Connected";
  }
  switch (status.status) {
    case "oauth_not_configured":
      return "OAuth not configured";
    case "session_expired":
      return "Session expired";
    case "auth_unavailable":
      return "Reconnect needed";
    default:
      return "Not connected";
  }
}

export function AIDeskTab({
  activeTab,
  assetContext,
  assetLabel,
  chart,
  deskSectionNotes,
  onNavigate,
  riskDetail,
  selectedRiskReportId,
  selectedSignalId,
  selectedSymbol,
  signalDetail,
  signals,
  timeframe,
  watchlist,
}: AIDeskTabProps) {
  const [question, setQuestion] = useState(`What matters most right now for ${assetLabel}, and what would invalidate the next commodity trade?`);
  const [state, setState] = useState<AIViewState>({
    status: emptyStatus,
    response: null,
    loading: false,
    error: null,
  });

  const leadSignal = useMemo(() => contextLeadSignal(selectedSymbol, signals), [selectedSymbol, signals]);
  const snapshot = useMemo(
    () => state.response?.context_snapshot ?? localSnapshot(activeTab, assetContext, assetLabel, chart, leadSignal, riskDetail, signalDetail, watchlist),
    [activeTab, assetContext, assetLabel, chart, leadSignal, riskDetail, signalDetail, state.response, watchlist],
  );
  const degradedNotes = useMemo(() => Object.values(deskSectionNotes).filter((item) => item.trim().length > 0), [deskSectionNotes]);

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    setQuestion(`What matters most right now for ${assetLabel}, and what would invalidate the next commodity trade?`);
  }, [assetLabel]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const payload = event.data as { type?: string; status?: string; message?: string } | null;
      if (!payload || payload.type !== "ai-oauth") {
        return;
      }
      if (payload.status === "error") {
        setState((current) => ({ ...current, error: payload.message ?? "OpenAI connection failed." }));
      }
      void loadStatus();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function loadStatus() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const status = await apiClient.aiStatus();
      setState((current) => ({ ...current, status, loading: false }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: emptyStatus,
        loading: false,
        error: friendlyAiError(error, "Unable to load AI provider status."),
      }));
    }
  }

  async function disconnectOpenAI() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      await apiClient.aiLogout();
      await loadStatus();
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: friendlyAiError(error, "Unable to disconnect OpenAI."),
      }));
    }
  }

  function connectOpenAI() {
    const popup = window.open(apiClient.aiOauthStartUrl(window.location.origin), "ai-trader-openai-oauth", "popup=yes,width=640,height=780");
    if (!popup) {
      setState((current) => ({
        ...current,
        error: "Browser blocked the OpenAI login popup. Allow popups for this local site and try again.",
      }));
    }
  }

  async function runAdvisor() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await apiClient.runAdvisor(
        {
          query: question,
          symbol: selectedSymbol,
          timeframe,
          model: state.status.selected_model,
          active_tab: activeTab,
          selected_signal_id: selectedSignalId,
          selected_risk_report_id: selectedRiskReportId,
        },
      );
      setState((current) => ({ ...current, response, status: response.provider_status, loading: false }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: friendlyAiError(error, "AI advisory request failed."),
      }));
    }
  }

  const statusCardMessage = state.error ?? providerStatusMessage(state.status);

  return (
    <div className="stack">
      {statusCardMessage ? (
        <article className="panel compact-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">AI Status</p>
              <h3>Connection Guidance</h3>
            </div>
            <span className="tag">{state.status.status}</span>
          </div>
          <div className="stack">
            <small>{statusCardMessage}</small>
            <small>AI Desk stays advisory-only and uses the current desk state for research, review, and paper workflow only.</small>
          </div>
        </article>
      ) : null}

      <article className="panel compact-panel hero-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Terminal Brain</p>
            <h3>Structured Commodity Advisory</h3>
          </div>
          <div className="inline-tags">
            <span className="tag">{snapshot.selected_instrument}</span>
            <span className="tag">{snapshot.timeframe}</span>
            <span className="tag">{snapshot.data_mode_label}</span>
            <span className="tag">{state.status.status}</span>
          </div>
        </div>
        <div className="stack">
          <small>AI Desk is the terminal copilot. It reads the current asset, workspace, signal, risk, catalyst, crowd, and truth state, then turns that into an operator brief.</small>
          <small>No orders are placed here. Any next action stays inside chart review, research, ticket drafting, and paper-trade workflow.</small>
        </div>
      </article>

      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Context In Scope</p>
            <h3>Current Desk Snapshot</h3>
          </div>
          <span className="tag">{snapshot.market_freshness}</span>
        </div>
        <div className="metric-grid">
          <div>
            <span className="metric-label">Selected instrument</span>
            <strong>{snapshot.selected_instrument}</strong>
            <small>{snapshot.active_workspace}</small>
          </div>
          <div>
            <span className="metric-label">Board in scope</span>
            <strong>{snapshot.watchlist_board.join(" / ") || "board loading"}</strong>
            <small>Commodity-first board context is carried into every advisory run.</small>
          </div>
          <div>
            <span className="metric-label">Signal focus</span>
            <strong>{snapshot.signal_focus ?? "No signal loaded"}</strong>
            <small>AI Desk uses the selected signal when one is already in scope.</small>
          </div>
          <div>
            <span className="metric-label">Risk focus</span>
            <strong>{snapshot.risk_focus ?? "No risk frame loaded"}</strong>
            <small>Risk stays part of the brief even when the market view is partial.</small>
          </div>
          <div>
            <span className="metric-label">Catalyst lead</span>
            <strong>{snapshot.catalyst_headlines[0] ?? "No catalyst headline loaded"}</strong>
            <small>{snapshot.feed_source_label}</small>
          </div>
          <div>
            <span className="metric-label">Truth note</span>
            <strong>{snapshot.data_mode_label}</strong>
            <small>{snapshot.truth_note}</small>
          </div>
        </div>
      </article>

      {degradedNotes.length > 0 ? (
        <article className="panel compact-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Desk Notes</p>
              <h3>Degraded But Usable</h3>
            </div>
            <span className="tag">partial</span>
          </div>
          <div className="stack">
            {degradedNotes.slice(0, 4).map((note) => (
              <small key={note}>{note}</small>
            ))}
          </div>
        </article>
      ) : null}

      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">OpenAI Settings</p>
            <h3>Connection + Model</h3>
          </div>
          <span className="tag">{state.status.auth_mode}</span>
        </div>
          <div className="field-grid">
          <label className="field">
            <span>OpenAI connection</span>
            <div className="stack">
              <strong>{connectionLabel(state.status)}</strong>
              <small>{state.status.connected_account ?? "No OpenAI user session is attached to this local desk yet."}</small>
              {state.status.session_expires_at ? <small>Session expires {formatDateTimeIST(state.status.session_expires_at)}</small> : null}
            </div>
          </label>
          <label className="field">
            <span>Model</span>
            <select
              value={state.status.selected_model}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  status: { ...current.status, selected_model: event.target.value },
                }))}
            >
              {state.status.available_models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="metric-row">
          <button className="action-button" disabled={!state.status.oauth_enabled} onClick={() => connectOpenAI()} type="button">
            {state.status.connected ? "Reconnect OpenAI" : "Connect with OpenAI"}
          </button>
          {state.status.connected ? (
            <button className="text-button" onClick={() => void disconnectOpenAI()} type="button">
              Disconnect
            </button>
          ) : null}
        </div>
        <small>{state.status.guidance}</small>
        <small>Current callback URL: {state.status.oauth_callback_url ?? "unavailable"}</small>
        <small>Set `AI_TRADER_OPENAI_OAUTH_CLIENT_ID` and `AI_TRADER_OPENAI_OAUTH_CLIENT_SECRET`, register the callback above, then return here to connect.</small>
        {state.status.warning ? <small>{state.status.warning}</small> : null}
      </article>

      <article className="panel compact-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operator Prompt</p>
            <h3>Ask The Desk Brain</h3>
          </div>
          <span className="tag">{state.status.connected ? "OpenAI-backed" : "Local advisory"}</span>
        </div>
        <label className="field">
          <span>Question</span>
          <textarea
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="metric-row">
          <button className="action-button" disabled={state.loading || question.trim().length === 0} onClick={() => void runAdvisor()} type="button">
            {state.loading ? "Running brain…" : state.status.connected ? "Run Terminal Brain" : "Run Local Terminal Brief"}
          </button>
        </div>
      </article>

      {state.response ? (
        <>
          <article className="panel compact-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Terminal Advisory</p>
                <h3>Brain Summary</h3>
              </div>
              <span className="tag">{state.response.live_data_available ? "timing usable" : "research only"}</span>
            </div>
            <div className="stack">
              <small>{state.response.context_summary}</small>
              <small>{state.response.data_truth_note}</small>
              {state.response.warnings.map((warning) => (
                <small key={warning}>{warning}</small>
              ))}
              <p className="compact-copy">{state.response.final_answer}</p>
            </div>
          </article>

          <div className="split-stack">
            <article className="panel compact-panel">
              <p className="eyebrow">Current Market Read</p>
              <p className="compact-copy">{state.response.market_view}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Why It Matters Now</p>
              <p className="compact-copy">{state.response.why_it_matters_now}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Key Levels / Scenarios</p>
              <div className="stack">
                {state.response.key_levels.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Catalyst Watch</p>
              <div className="stack">
                {state.response.catalysts.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Invalidation / What Changes The View</p>
              <p className="compact-copy">{state.response.invalidation}</p>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Risk Frame</p>
              <div className="stack">
                {state.response.risk_frame.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Related Assets To Monitor</p>
              <div className="stack">
                {state.response.related_markets.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            </article>
            <article className="panel compact-panel">
              <p className="eyebrow">Next Actions In Platform</p>
              <div className="stack">
                {state.response.next_actions.map((action) => (
                  <button className="news-item" key={`${action.workspace}-${action.label}`} onClick={() => onNavigate(action.workspace)} type="button">
                    <strong>{action.label}</strong>
                    <small>{action.workspace.replace(/_/g, " ")}</small>
                    <small>{action.note}</small>
                  </button>
                ))}
              </div>
            </article>
          </div>

          <article className="panel compact-panel">
            <h3>Contributing Agents</h3>
            <div className="split-stack">
              {state.response.agent_results.map((agent) => (
                <article className="panel compact-panel" key={agent.agent}>
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Agent</p>
                      <h3>{agent.agent}</h3>
                    </div>
                    <span className="tag">{Math.round(agent.confidence * 100)}%</span>
                  </div>
                  <strong>{agent.headline}</strong>
                  <p className="compact-copy">{agent.summary}</p>
                  {agent.warnings.length > 0 ? (
                    <div className="stack">
                      {agent.warnings.map((warning) => (
                        <small key={warning}>{warning}</small>
                      ))}
                    </div>
                  ) : null}
                  {agent.citations.length > 0 ? (
                    <div className="inline-tags">
                      {agent.citations.slice(0, 3).map((citation) => (
                        <span className="tag" key={citation}>
                          {citation}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </article>
        </>
      ) : (
        <article className="panel compact-panel">
          <h3>Structured Output</h3>
          <div className="split-stack">
            <div className="stack">
              <strong>Current Market Read</strong>
              <small>Concise structure and truth summary for the selected instrument.</small>
            </div>
            <div className="stack">
              <strong>Why It Matters Now</strong>
              <small>One short operator explanation tied to the current workspace and current desk conditions.</small>
            </div>
            <div className="stack">
              <strong>Key Levels / Scenarios</strong>
              <small>Chart, signal, and risk levels already in scope for this asset.</small>
            </div>
            <div className="stack">
              <strong>Catalyst Watch</strong>
              <small>Current news, macro, and event-sensitive drivers already attached to the desk context.</small>
            </div>
            <div className="stack">
              <strong>Invalidation / What Changes The View</strong>
              <small>One operator-facing line explaining what would break the current setup.</small>
            </div>
            <div className="stack">
              <strong>Risk Frame</strong>
              <small>Size band, risk budget, and proxy/live caveat in trader language.</small>
            </div>
            <div className="stack">
              <strong>Related Assets To Monitor</strong>
              <small>Relevant crowd or cross-asset markets only, not generic noise.</small>
            </div>
            <div className="stack">
              <strong>Next Actions In Platform</strong>
              <small>Direct follow-ups so the brain feeds the operator workflow rather than free-floating chat.</small>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
