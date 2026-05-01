import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { duplicateWorkflowIdentityBases, duplicateWorkflowSymbols, workflowIdentityLabel } from "../lib/workflowIdentity";
import { formatDateTimeIST, compareTimestamps } from "../lib/time";
import { sameTerminalFocusSymbol } from "../lib/terminalFocus";
import { plainStatusLabel, proposalStateLabel, sourceTimingLabel, suitabilityLabel, titleCase } from "../lib/uiLabels";
import { StateBlock } from "../components/StateBlock";
import type {
  DataRealityView,
  PaperTradeCloseRequest,
  PaperTradeDetailView,
  PaperTradeOpenRequest,
  PaperTradePartialExitRequest,
  PaperTradeProposalRequest,
  PaperTradeScaleRequest,
  PaperTradeView,
} from "../types/api";

interface ActiveTradesTabProps {
  proposedRows: PaperTradeView[];
  proposedLoading?: boolean;
  proposedError?: string | null;
  openTradeCount?: number;
  activeRows: PaperTradeView[];
  activeLoading?: boolean;
  activeError?: string | null;
  closedRows: PaperTradeView[];
  detail: PaperTradeDetailView | null;
  selectedTradeId: string | null;
  selectedSymbol: string;
  selectedDisplaySymbol?: string | null;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
  selectedSignalReality: DataRealityView | null;
  onSelectSymbol: (symbol: string) => void;
  onSelectTrade: (tradeId: string | null) => void;
  onChanged: () => Promise<void>;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
}

function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(Math.abs(value) >= 100 ? 2 : 4);
}

function displaySymbol(row: { symbol: string; display_symbol?: string | null; data_reality?: DataRealityView | null } | null | undefined): string {
  return row?.display_symbol ?? row?.data_reality?.provenance.tradable_symbol ?? row?.symbol ?? "n/a";
}

function tradeLaneLabel(
  row: PaperTradeView,
  duplicateSymbols: Set<string>,
  duplicateBaseIdentities: Set<string>,
): string {
  return workflowIdentityLabel(
    {
      symbol: displaySymbol(row),
      family: row.linked_signal_family ?? row.strategy_id ?? "manual",
      side: row.side,
      lifecycle: proposalStateLabel(row.status),
      accountabilityState: row.integrity_state && row.integrity_state !== "valid" ? "blocked" : row.review_due ? "review due" : null,
      timestamp: row.opened_at ?? row.closed_at,
    },
    duplicateSymbols,
    "trade",
    duplicateBaseIdentities,
  );
}

function tradeAccountabilityLabel(row: PaperTradeView): string {
  if (row.integrity_state && row.integrity_state !== "valid") {
    return "blocked";
  }
  if (row.review_due) {
    return "review due";
  }
  if (row.closed_at) {
    return "history";
  }
  return "active";
}

function TradeTable({
  title,
  rows,
  emptyMessage,
  onRetry,
  selectedTradeId,
  onSelect,
  duplicateSymbols,
  duplicateBaseIdentities,
}: {
  title: string;
  rows: PaperTradeView[];
  emptyMessage?: string;
  onRetry?: () => void;
  selectedTradeId: string | null;
  onSelect: (trade: PaperTradeView) => void;
  duplicateSymbols: Set<string>;
  duplicateBaseIdentities: Set<string>;
}) {
  return (
      <article className="panel compact-panel detail-table-panel">
        <h3>{title}</h3>
        {rows.length === 0 ? (
          <div className="stack">
            <div className="showcase-note">
              <strong className="showcase-note-title">{title} lane is quiet</strong>
              <p className="showcase-note-body">{emptyMessage ?? "No trades in this state."}</p>
            </div>
            {emptyMessage && onRetry ? <button className="text-button" onClick={onRetry} type="button">Retry trade hydration</button> : null}
          </div>
        ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>State</th>
              <th>Entry</th>
              <th>Stop</th>
              <th>PnL</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={selectedTradeId === row.trade_id ? "row-selected" : ""}
                key={row.trade_id}
                onClick={() => onSelect(row)}
              >
                <td>
                  <strong>{tradeLaneLabel(row, duplicateSymbols, duplicateBaseIdentities)}</strong>
                  <div className="muted-copy">{row.strategy_id ?? "manual paper ops"}</div>
                </td>
                <td>{proposalStateLabel(row.status)}</td>
                <td>{compactNumber(row.actual_entry ?? row.proposed_entry_zone.low)}</td>
                <td>{compactNumber(row.stop)}</td>
                <td>{compactNumber(row.outcome?.realized_pnl_pct)}%</td>
                <td>{tradeAccountabilityLabel(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

export function ActiveTradesTab({
  proposedRows,
  proposedLoading = false,
  proposedError = null,
  openTradeCount = 0,
  activeRows,
  activeLoading = false,
  activeError = null,
  closedRows,
  detail,
  selectedTradeId,
  selectedSymbol,
  selectedDisplaySymbol = null,
  selectedSignalId,
  selectedRiskReportId,
  selectedSignalReality,
  onSelectSymbol,
  onSelectTrade,
  onChanged,
  onOpenSignal,
  onOpenRisk,
}: ActiveTradesTabProps) {
  const allRows = useMemo(() => [...proposedRows, ...activeRows, ...closedRows], [activeRows, closedRows, proposedRows]);
  const activeDuplicateShapes = useMemo(
    () =>
      [...proposedRows, ...activeRows].map((row) => ({
        symbol: displaySymbol(row),
        family: row.linked_signal_family ?? row.strategy_id ?? "manual",
        side: row.side,
        lifecycle: proposalStateLabel(row.status),
        accountabilityState: row.integrity_state && row.integrity_state !== "valid" ? "blocked" : row.review_due ? "review due" : null,
        timestamp: row.opened_at ?? row.closed_at,
      })),
    [activeRows, proposedRows],
  );
  const closedDuplicateShapes = useMemo(
    () =>
      closedRows.map((row) => ({
        symbol: displaySymbol(row),
        family: row.linked_signal_family ?? row.strategy_id ?? "manual",
        side: row.side,
        lifecycle: proposalStateLabel(row.status),
        accountabilityState: row.integrity_state && row.integrity_state !== "valid" ? "blocked" : row.review_due ? "review due" : null,
        timestamp: row.opened_at ?? row.closed_at,
      })),
    [closedRows],
  );
  const activeDuplicateSymbols = useMemo(() => duplicateWorkflowSymbols(activeDuplicateShapes), [activeDuplicateShapes]);
  const activeDuplicateBaseIdentities = useMemo(
    () => duplicateWorkflowIdentityBases(activeDuplicateShapes),
    [activeDuplicateShapes],
  );
  const closedDuplicateSymbols = useMemo(() => duplicateWorkflowSymbols(closedDuplicateShapes), [closedDuplicateShapes]);
  const closedDuplicateBaseIdentities = useMemo(
    () => duplicateWorkflowIdentityBases(closedDuplicateShapes),
    [closedDuplicateShapes],
  );
  const focusDisplaySymbol = selectedDisplaySymbol ?? selectedSymbol;
  const focusRows = useMemo(
    () => allRows.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)),
    [allRows, selectedSymbol],
  );
  const focusClosedRows = useMemo(
    () => closedRows.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol)),
    [closedRows, selectedSymbol],
  );
  const selectedTrade = detail
    ?? allRows.find((row) => row.trade_id === selectedTradeId)
    ?? focusRows[0]
    ?? (!selectedSymbol ? allRows[0] : null)
    ?? null;
  const linkedSignal = detail?.linked_signal ?? null;
  const linkedRisk = detail?.linked_risk ?? null;
  const selectedReality = selectedTrade?.data_reality ?? linkedSignal?.data_reality ?? selectedSignalReality;
  const selectedTradeIntegrityBlocked = Boolean(selectedTrade?.integrity_state && selectedTrade.integrity_state !== "valid");
  const missingLinkedSignal = Boolean(detail?.signal_id) && !linkedSignal;
  const missingLinkedRisk = Boolean(detail?.risk_report_id) && !linkedRisk;
  const focusReviewDueCount = focusClosedRows.filter((row) => row.review_due).length;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [proposalDraft, setProposalDraft] = useState<PaperTradeProposalRequest>({
    signal_id: selectedSignalId ?? "",
    risk_report_id: selectedRiskReportId,
    strategy_id: "manual_paper_ops",
    symbol: selectedDisplaySymbol ?? selectedSymbol ?? "BTC",
    side: "long",
    notes: "",
  });
  const [openDraft, setOpenDraft] = useState<PaperTradeOpenRequest>({
    actual_entry: selectedTrade?.actual_entry ?? 0,
    actual_size: selectedTrade?.actual_size || 0.5,
    opened_at: new Date().toISOString(),
    notes: "",
  });
  const [scaleDraft, setScaleDraft] = useState<PaperTradeScaleRequest>({
    actual_entry: selectedTrade?.actual_entry ?? 0,
    added_size: 0.25,
    notes: "",
  });
  const [partialExitDraft, setPartialExitDraft] = useState<PaperTradePartialExitRequest>({
    exit_price: selectedTrade?.targets?.base ?? selectedTrade?.actual_entry ?? 0,
    exit_size: Math.max(0.1, (selectedTrade?.actual_size ?? 0) / 2),
    closed_at: new Date().toISOString(),
    close_reason: "target_partial",
    notes: "",
  });
  const [closeDraft, setCloseDraft] = useState<PaperTradeCloseRequest>({
    close_price: selectedTrade?.targets?.base ?? selectedTrade?.actual_entry ?? 0,
    closed_at: new Date().toISOString(),
    close_reason: "manual_close",
    notes: "",
  });

  useEffect(() => {
    setProposalDraft((current) => ({
      ...current,
      signal_id: selectedSignalId ?? current.signal_id,
      risk_report_id: selectedRiskReportId,
      symbol: selectedDisplaySymbol ?? selectedSymbol ?? current.symbol,
    }));
  }, [selectedDisplaySymbol, selectedRiskReportId, selectedSignalId, selectedSymbol]);

  useEffect(() => {
    setOpenDraft({
      actual_entry: selectedTrade?.actual_entry ?? selectedTrade?.proposed_entry_zone.low ?? 0,
      actual_size: selectedTrade?.actual_size && selectedTrade.actual_size > 0 ? selectedTrade.actual_size : 0.5,
      opened_at: new Date().toISOString(),
      notes: "",
    });
    setScaleDraft({
      actual_entry: selectedTrade?.actual_entry ?? 0,
      added_size: 0.25,
      notes: "",
    });
    setPartialExitDraft({
      exit_price: selectedTrade?.targets?.base ?? selectedTrade?.actual_entry ?? 0,
      exit_size: Math.max(0.1, (selectedTrade?.actual_size ?? 0) / 2),
      closed_at: new Date().toISOString(),
      close_reason: "target_partial",
      notes: "",
    });
    setCloseDraft({
      close_price: selectedTrade?.targets?.base ?? selectedTrade?.actual_entry ?? 0,
      closed_at: new Date().toISOString(),
      close_reason: "manual_close",
      notes: "",
    });
  }, [selectedTrade]);

  function selectTrade(row: PaperTradeView) {
    onSelectTrade(row.trade_id);
    onSelectSymbol(row.symbol);
  }

  async function refreshAndSelect(tradeId?: string | null) {
    await onChanged();
    if (tradeId) {
      onSelectTrade(tradeId);
    }
  }

  async function handleCreateProposal() {
    if (!proposalDraft.signal_id) {
      setError("Select a signal before proposing a paper trade.");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const created = await apiClient.createProposedPaperTrade(proposalDraft);
      await refreshAndSelect(created.trade_id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Paper trade proposal failed");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: string, fn: () => Promise<{ trade_id: string } | null>) {
    if (!selectedTrade) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const updated = await fn();
      await refreshAndSelect(updated?.trade_id ?? selectedTrade.trade_id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Paper trade ${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  const proposedHydrationMessage =
    !proposedRows.length
      ? proposedLoading
        ? "Proposed rows are hydrating from the current paper-trade state."
        : proposedError
          ? `Proposed rows did not load cleanly. ${proposedError}`
          : openTradeCount > 0
            ? "Proposed rows are reconciling against the current paper-trade state."
            : focusClosedRows.length > 0
              ? `No proposed trades are open for ${focusDisplaySymbol}. Last known workflow context is ${focusClosedRows.length} recently closed trade(s), with ${focusReviewDueCount} still awaiting review.`
              : undefined
      : undefined;
  const activeHydrationMessage =
    !activeRows.length
      ? activeLoading
        ? "Active rows are hydrating from the current paper-trade state."
        : activeError
          ? `Active rows did not load cleanly. ${activeError}`
          : openTradeCount > 0
            ? "Some active paper trades were withheld because their linked context or tracking state could not be hydrated truthfully."
            : focusClosedRows.length > 0
              ? `No active trades are open for ${focusDisplaySymbol}. The most recent truthful context is ${focusClosedRows.length} closed trade(s), with ${focusReviewDueCount} review item(s) still due.`
              : undefined
      : undefined;
  const proposedRetryEnabled = Boolean(proposedError || (!proposedLoading && openTradeCount > 0));
  const activeRetryEnabled = Boolean(activeError || (!activeLoading && openTradeCount > 0));

  return (
    <div className="split-stack">
      <div className="stack">
        <StateBlock error={error} />
        <TradeTable
          emptyMessage={proposedHydrationMessage}
          onRetry={proposedRetryEnabled ? () => void onChanged() : undefined}
          onSelect={selectTrade}
          rows={proposedRows}
          selectedTradeId={selectedTradeId}
          title="Proposed"
          duplicateSymbols={activeDuplicateSymbols}
          duplicateBaseIdentities={activeDuplicateBaseIdentities}
        />
        <TradeTable
          emptyMessage={activeHydrationMessage}
          onRetry={activeRetryEnabled ? () => void onChanged() : undefined}
          onSelect={selectTrade}
          rows={activeRows}
          selectedTradeId={selectedTradeId}
          title="Active"
          duplicateSymbols={activeDuplicateSymbols}
          duplicateBaseIdentities={activeDuplicateBaseIdentities}
        />
        <TradeTable
          emptyMessage={
            focusRows.length > 0
              ? `No recent closed trades are recorded for ${focusDisplaySymbol} yet.`
              : undefined
          }
          onSelect={selectTrade}
          rows={closedRows}
          selectedTradeId={selectedTradeId}
          title={focusClosedRows.length > 0 ? "Closed / Recent context" : "Closed"}
          duplicateSymbols={closedDuplicateSymbols}
          duplicateBaseIdentities={closedDuplicateBaseIdentities}
        />
      </div>

      <div className="stack">
        <article className="panel compact-panel detail-shell-panel active-trade-proposal-panel">
          <h3>Propose Paper Trade</h3>
          <div className="stack">
            <small>Signal context: {detail?.linked_signal ? `${displaySymbol(detail.linked_signal)} ${titleCase(detail.linked_signal.signal_type)}` : selectedSignalId ? "Loaded from selected setup" : "no signal selected"}</small>
            <small>Risk context: {detail?.linked_risk ? `${displaySymbol(detail.linked_risk)} stop ${compactNumber(detail.linked_risk.stop_price)}` : selectedRiskReportId ? "Loaded from selected risk frame" : "no risk selected"}</small>
            {!proposalDraft.signal_id ? <small>Select a signal first to create a proposal from the current setup and risk frame.</small> : null}
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Strategy</span>
              <input
                value={proposalDraft.strategy_id ?? ""}
                onChange={(event) => setProposalDraft((current) => ({ ...current, strategy_id: event.target.value || null }))}
              />
            </label>
            <label className="field">
              <span>Symbol</span>
              <input value={proposalDraft.symbol ?? ""} onChange={(event) => setProposalDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} />
            </label>
            <label className="field">
              <span>Side</span>
              <select value={proposalDraft.side ?? "long"} onChange={(event) => setProposalDraft((current) => ({ ...current, side: event.target.value }))}>
                <option value="long">long</option>
                <option value="short">short</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea value={proposalDraft.notes ?? ""} onChange={(event) => setProposalDraft((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          {selectedSignalReality ? (
            <div className="stack">
              <div className="metric-row compact-row">
                <span>
                  {selectedSignalReality.provenance.research_symbol} {"->"} {selectedSignalReality.provenance.tradable_symbol}
                </span>
                <span>{sourceTimingLabel(selectedSignalReality.provenance.source_timing)}</span>
              </div>
              <div className="metric-row compact-row">
                <span>{selectedSignalReality.execution_grade_allowed ? "Execution-capable" : "Not execution-grade"}</span>
                <span>{suitabilityLabel(selectedSignalReality.news_suitability)}</span>
              </div>
              <small>{selectedSignalReality.tradable_alignment_note}</small>
              {!selectedSignalReality.execution_grade_allowed ? <small>Commodity truth is degraded here. Keep proposals in research and paper workflow only.</small> : null}
            </div>
          ) : null}
          <div className="metric-row">
            <button className="text-button" disabled={busy === "create"} onClick={() => void handleCreateProposal()} type="button">
              {busy === "create" ? "Saving…" : "Create Proposed Trade"}
            </button>
            <small>Uses the selected signal and risk context when present.</small>
          </div>
        </article>

        <article className="panel compact-panel hero-panel detail-shell-panel active-trade-detail-panel">
          <h3>Selected Paper Trade</h3>
          {selectedTrade ? (
            <>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Trade</span>
                  <strong>{selectedTrade.display_symbol ?? selectedTrade.data_reality?.provenance.tradable_symbol ?? selectedTrade.symbol} {proposalStateLabel(selectedTrade.status)}</strong>
                  <small>{formatDateTimeIST(selectedTrade.opened_at ?? selectedTrade.closed_at ?? null)}</small>
                </div>
                <div>
                  <span className="metric-label">State</span>
                  <strong>{proposalStateLabel(selectedTrade.status)}</strong>
                </div>
                <div>
                  <span className="metric-label">Asset</span>
                  <strong>{displaySymbol(selectedTrade)}</strong>
                </div>
                <div>
                  <span className="metric-label">Setup family</span>
                  <strong>{selectedTrade.linked_signal_family ?? selectedTrade.strategy_id ?? "manual"}</strong>
                </div>
                <div>
                  <span className="metric-label">Realized</span>
                  <strong>{compactNumber(selectedTrade.outcome?.realized_pnl_pct)}%</strong>
                </div>
              </div>
              <div className="stack detail-meta-stack">
                <small>Signal source: {linkedSignal ? `${displaySymbol(linkedSignal)} ${titleCase(linkedSignal.signal_type)}` : missingLinkedSignal ? "Linked setup is no longer available." : selectedTrade.signal_id ? "Signal reference is attached to this trade and will resolve when the current setup is available." : "No linked signal"}</small>
                <small>Risk frame: {linkedRisk ? `${displaySymbol(linkedRisk)} stop ${compactNumber(linkedRisk.stop_price)}` : missingLinkedRisk ? "Linked risk frame is no longer available." : selectedTrade.risk_report_id ? "Risk reference is attached to this trade and will resolve when the current frame is available." : "No linked risk"}</small>
                {selectedTradeIntegrityBlocked ? (
                  <>
                    <small>Integrity state: {titleCase(selectedTrade.integrity_state ?? "broken")}</small>
                    <small>{selectedTrade.integrity_note ?? "This paper trade is preserved for auditability, but its linked context no longer hydrates truthfully."}</small>
                    <small>Operator actions are blocked here until the trade is reconciled, archived, or reviewed from history.</small>
                  </>
                ) : (
                  <small>Next obligation: {selectedTrade.review_due ? "complete the post-trade review chain before treating this as closed-loop discipline." : selectedTrade.closed_at ? "keep this trade in audit/history unless you need to inspect the completed loop." : "carry this trade into ticket follow-through, observation, or closure without leaving the audit thread behind."}</small>
                )}
              </div>
              <div className="metric-row detail-action-row">
                {linkedSignal ? (
                  <button className="text-button" onClick={() => onOpenSignal(linkedSignal.signal_id)} type="button">
                    Open Signal
                  </button>
                ) : null}
                {linkedRisk ? (
                  <button className="text-button" onClick={() => onOpenRisk(linkedRisk.risk_report_id)} type="button">
                    Open Risk
                  </button>
                ) : null}
              </div>
              <div className="field-grid">
                <div className="field">
                  <span>Entry Zone</span>
                  <div className="muted-copy">
                    {compactNumber(selectedTrade.proposed_entry_zone.low)} to {compactNumber(selectedTrade.proposed_entry_zone.high)}
                  </div>
                </div>
                <div className="field">
                  <span>Stop</span>
                  <div className="muted-copy">{compactNumber(selectedTrade.stop)}</div>
                </div>
                <div className="field">
                  <span>Targets</span>
                  <div className="muted-copy">
                    {compactNumber(selectedTrade.targets.base)} / {compactNumber(selectedTrade.targets.stretch)}
                  </div>
                </div>
                <div className="field">
                  <span>Review</span>
                  <div className="muted-copy">{selectedTrade.review_due ? "due" : "clear"}</div>
                </div>
              </div>
              <p className="muted-copy">{selectedTrade.notes || "No operator notes on this trade yet."}</p>
              {selectedReality ? (
                <div className="stack detail-meta-stack">
                  <div className="metric-row compact-row">
                    <span>
                      {selectedReality.provenance.research_symbol} {"->"} {selectedReality.provenance.tradable_symbol}
                    </span>
                    <span>{plainStatusLabel(selectedReality.provenance.intended_venue)}</span>
                  </div>
                  <div className="metric-row compact-row">
                    <span>{selectedReality.execution_grade_allowed ? "Execution-capable" : "Not execution-grade"}</span>
                    <span>{sourceTimingLabel(selectedReality.provenance.source_timing)}</span>
                  </div>
                  {!selectedReality.execution_grade_allowed ? <small>Current commodity truth is degraded or proxy-backed. Keep this paper-trade path explicitly research-only.</small> : null}
                  {selectedReality.event_context_note ? <small>{selectedReality.event_context_note}</small> : null}
                </div>
              ) : null}
              {selectedTrade.paper_account ? (
                <article className="panel compact-panel detail-subpanel">
                  <h4>10k Paper Account</h4>
                  <div className="metric-grid">
                    <div>
                      <span className="metric-label">Equity</span>
                      <strong>{compactNumber(selectedTrade.paper_account.current_equity)}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Allocated</span>
                      <strong>{compactNumber(selectedTrade.paper_account.allocated_capital)}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Open Risk</span>
                      <strong>{compactNumber(selectedTrade.paper_account.open_risk_amount)}</strong>
                    </div>
                    <div>
                      <span className="metric-label">% at Risk</span>
                      <strong>{compactNumber(selectedTrade.paper_account.risk_pct_of_account)}%</strong>
                    </div>
                    <div>
                      <span className="metric-label">Target P/L</span>
                      <strong>{compactNumber(selectedTrade.paper_account.projected_base_pnl)}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Stop Loss</span>
                      <strong>{compactNumber(selectedTrade.paper_account.projected_stop_loss)}</strong>
                    </div>
                  </div>
                </article>
              ) : null}
              {selectedTrade.execution_realism ? (
                <article className="panel compact-panel detail-subpanel">
                  <h4>Execution Realism</h4>
                  <div className="metric-grid">
                    <div>
                      <span className="metric-label">Entry Slip</span>
                      <strong>{compactNumber(selectedTrade.execution_realism.entry_slippage_bps)} bps</strong>
                    </div>
                    <div>
                      <span className="metric-label">Stop Slip</span>
                      <strong>{compactNumber(selectedTrade.execution_realism.stop_slippage_bps)} bps</strong>
                    </div>
                    <div>
                      <span className="metric-label">Fill Mode</span>
                      <strong>{selectedTrade.execution_realism.target_fill_mode}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Gap Risk</span>
                      <strong>{selectedTrade.execution_realism.gap_through_stop_flag ? "flagged" : "clear"}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Latency</span>
                      <strong>{compactNumber(selectedTrade.execution_realism.event_latency_penalty)} bps</strong>
                    </div>
                    <div>
                      <span className="metric-label">Delayed Source</span>
                      <strong>{compactNumber(selectedTrade.execution_realism.delayed_source_penalty)} bps</strong>
                    </div>
                  </div>
                  <small>{selectedTrade.execution_realism.fill_note}</small>
                </article>
              ) : null}
              {selectedTrade.execution_quality ? (
                <article className="panel compact-panel detail-subpanel">
                  <h4>Execution Diagnostics</h4>
                  <div className="metric-row compact-row">
                    <span>signal: {plainStatusLabel(selectedTrade.execution_quality.signal_quality)}</span>
                    <span>plan: {plainStatusLabel(selectedTrade.execution_quality.plan_quality)}</span>
                    <span>execution: {plainStatusLabel(selectedTrade.execution_quality.execution_quality)}</span>
                  </div>
                  <div className="metric-row compact-row">
                    <span>slippage {compactNumber(selectedTrade.execution_quality.slippage_penalty_bps)} bps</span>
                    <span>latency {compactNumber(selectedTrade.execution_quality.latency_penalty)} bps</span>
                    <span>delay {compactNumber(selectedTrade.execution_quality.delayed_penalty)} bps</span>
                  </div>
                  {selectedTrade.execution_quality.notes.map((note) => (
                    <small key={note}>{note}</small>
                  ))}
                </article>
              ) : null}

              {selectedTrade.status === "proposed" && !selectedTradeIntegrityBlocked ? (
                <div className="stack detail-action-surface">
                  <div className="field-grid">
                    <label className="field">
                      <span>Actual Entry</span>
                      <input
                        type="number"
                        value={openDraft.actual_entry}
                        onChange={(event) => setOpenDraft((current) => ({ ...current, actual_entry: Number(event.target.value) }))}
                      />
                    </label>
                    <label className="field">
                      <span>Actual Size</span>
                      <input
                        type="number"
                        value={openDraft.actual_size}
                        onChange={(event) => setOpenDraft((current) => ({ ...current, actual_size: Number(event.target.value) }))}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>Open Notes</span>
                    <textarea value={openDraft.notes ?? ""} onChange={(event) => setOpenDraft((current) => ({ ...current, notes: event.target.value }))} />
                  </label>
                  <div className="metric-row detail-action-row">
                    <button
                      className="text-button"
                      disabled={busy === "open"}
                      onClick={() => void runAction("open", () => apiClient.openPaperTrade(selectedTrade.trade_id, openDraft))}
                      type="button"
                    >
                      {busy === "open" ? "Saving…" : "Open Trade"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy === "cancel"}
                      onClick={() => void runAction("cancel", () => apiClient.cancelPaperTrade(selectedTrade.trade_id, "Cancelled before entry"))}
                      type="button"
                    >
                      {busy === "cancel" ? "Saving…" : "Cancel"}
                    </button>
                  </div>
                </div>
              ) : null}

              {["opened", "scaled_in", "partially_exited"].includes(selectedTrade.status) && !selectedTradeIntegrityBlocked ? (
                <div className="stack detail-action-surface">
                  <div className="field-grid">
                    <label className="field">
                      <span>Scale Entry</span>
                      <input
                        type="number"
                        value={scaleDraft.actual_entry}
                        onChange={(event) => setScaleDraft((current) => ({ ...current, actual_entry: Number(event.target.value) }))}
                      />
                    </label>
                    <label className="field">
                      <span>Add Size</span>
                      <input
                        type="number"
                        value={scaleDraft.added_size}
                        onChange={(event) => setScaleDraft((current) => ({ ...current, added_size: Number(event.target.value) }))}
                      />
                    </label>
                    <label className="field">
                      <span>Partial Exit Price</span>
                      <input
                        type="number"
                        value={partialExitDraft.exit_price}
                        onChange={(event) => setPartialExitDraft((current) => ({ ...current, exit_price: Number(event.target.value) }))}
                      />
                    </label>
                    <label className="field">
                      <span>Partial Exit Size</span>
                      <input
                        type="number"
                        value={partialExitDraft.exit_size}
                        onChange={(event) => setPartialExitDraft((current) => ({ ...current, exit_size: Number(event.target.value) }))}
                      />
                    </label>
                    <label className="field">
                      <span>Close Price</span>
                      <input
                        type="number"
                        value={closeDraft.close_price}
                        onChange={(event) => setCloseDraft((current) => ({ ...current, close_price: Number(event.target.value) }))}
                      />
                    </label>
                    <label className="field">
                      <span>Close Reason</span>
                      <input
                        value={closeDraft.close_reason}
                        onChange={(event) => setCloseDraft((current) => ({ ...current, close_reason: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="metric-row detail-action-row">
                    <button
                      className="text-button"
                      disabled={busy === "scale"}
                      onClick={() => void runAction("scale", () => apiClient.scalePaperTrade(selectedTrade.trade_id, scaleDraft))}
                      type="button"
                    >
                      {busy === "scale" ? "Saving…" : "Scale In"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy === "partial-exit"}
                      onClick={() => void runAction("partial-exit", () => apiClient.partialExitPaperTrade(selectedTrade.trade_id, partialExitDraft))}
                      type="button"
                    >
                      {busy === "partial-exit" ? "Saving…" : "Partial Exit"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy === "close"}
                      onClick={() => void runAction("close", () => apiClient.closePaperTrade(selectedTrade.trade_id, closeDraft))}
                      type="button"
                    >
                      {busy === "close" ? "Saving…" : "Close"}
                    </button>
                  </div>
                  <div className="metric-row detail-action-row">
                    <button
                      className="text-button"
                      disabled={busy === "invalidate"}
                      onClick={() => void runAction("invalidate", () => apiClient.invalidatePaperTrade(selectedTrade.trade_id, "Invalidation was breached."))}
                      type="button"
                    >
                      {busy === "invalidate" ? "Saving…" : "Invalidate"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy === "timeout"}
                      onClick={() => void runAction("timeout", () => apiClient.timeoutPaperTrade(selectedTrade.trade_id, "Time stop reached."))}
                      type="button"
                    >
                      {busy === "timeout" ? "Saving…" : "Time Stop"}
                    </button>
                  </div>
                </div>
              ) : null}

              <article className="panel compact-panel detail-subpanel">
                <h4>Outcome Attribution</h4>
                {selectedTrade.outcome ? (
                  <div className="metric-grid">
                    <div>
                      <span className="metric-label">Entry Quality</span>
                      <strong>{selectedTrade.outcome.entry_quality_label}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Zone Delta</span>
                      <strong>{compactNumber(selectedTrade.outcome.entry_zone_delta_pct)}%</strong>
                    </div>
                    <div>
                      <span className="metric-label">MFE</span>
                      <strong>{compactNumber(selectedTrade.outcome.mfe_pct)}%</strong>
                    </div>
                    <div>
                      <span className="metric-label">MAE</span>
                      <strong>{compactNumber(selectedTrade.outcome.mae_pct)}%</strong>
                    </div>
                    <div>
                      <span className="metric-label">Target</span>
                      <strong>{selectedTrade.outcome.target_attainment}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Time</span>
                      <strong>{selectedTrade.outcome.time_to_outcome_minutes}m</strong>
                    </div>
                  </div>
                ) : (
                  <div className="showcase-note showcase-note-inline">
                    <p className="showcase-note-body">No attribution yet.</p>
                  </div>
                )}
              </article>
              <article className="panel compact-panel detail-subpanel">
                <h4>Trade Timeline</h4>
                {detail?.timeline ? (
                  <div className="stack">
                    {[...detail.timeline.pre_event, ...detail.timeline.event_trigger, ...detail.timeline.trade_actions, ...detail.timeline.progression, ...detail.timeline.post_event]
                      .sort((left, right) => compareTimestamps(left.timestamp, right.timestamp))
                      .map((event) => (
                        <div className="metric-row compact-row" key={`${event.phase}-${event.event_type}-${event.timestamp}`}>
                          <span>{event.phase}</span>
                          <span>{event.title}</span>
                          <span>{formatDateTimeIST(event.timestamp)}</span>
                          <span>{event.price !== null ? compactNumber(event.price) : "n/a"}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="showcase-note showcase-note-inline">
                    <p className="showcase-note-body">Timeline will populate once the trade detail is loaded.</p>
                  </div>
                )}
              </article>
              <article className="panel compact-panel detail-subpanel">
                <h4>Scenario Stress</h4>
                {detail?.scenario_stress?.length ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Scenario</th>
                        <th>Shock</th>
                        <th>PnL</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.scenario_stress.map((item) => (
                        <tr key={`${item.entity_id}-${item.scenario}`}>
                          <td>{item.scenario}</td>
                          <td>{compactNumber(item.shock_pct)}%</td>
                          <td>{compactNumber(item.pnl_impact_pct)}%</td>
                          <td>{compactNumber(item.confidence_impact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="showcase-note showcase-note-inline">
                    <p className="showcase-note-body">No scenario stress summary yet.</p>
                  </div>
                )}
              </article>
            </>
          ) : (
            <div className="showcase-note">
              <strong className="showcase-note-title">Select a paper trade</strong>
              <p className="showcase-note-body">No paper trade selected.</p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
