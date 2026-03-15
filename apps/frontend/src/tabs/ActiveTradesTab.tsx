import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
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
  activeRows: PaperTradeView[];
  closedRows: PaperTradeView[];
  detail: PaperTradeDetailView | null;
  selectedTradeId: string | null;
  selectedSymbol: string;
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

function TradeTable({
  title,
  rows,
  selectedTradeId,
  onSelect,
}: {
  title: string;
  rows: PaperTradeView[];
  selectedTradeId: string | null;
  onSelect: (trade: PaperTradeView) => void;
}) {
  return (
    <article className="panel compact-panel">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted-copy">No trades in this state.</p>
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
                <td>{row.symbol}</td>
                <td>{row.status}</td>
                <td>{compactNumber(row.actual_entry ?? row.proposed_entry_zone.low)}</td>
                <td>{compactNumber(row.stop)}</td>
                <td>{compactNumber(row.outcome?.realized_pnl_pct)}%</td>
                <td>{row.review_due ? "due" : "ok"}</td>
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
  activeRows,
  closedRows,
  detail,
  selectedTradeId,
  selectedSymbol,
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
  const selectedTrade = detail ?? allRows.find((row) => row.trade_id === selectedTradeId) ?? allRows[0] ?? null;
  const selectedReality = selectedTrade?.data_reality ?? detail?.linked_signal?.data_reality ?? selectedSignalReality;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [proposalDraft, setProposalDraft] = useState<PaperTradeProposalRequest>({
    signal_id: selectedSignalId ?? "",
    risk_report_id: selectedRiskReportId,
    strategy_id: "manual_paper_ops",
    symbol: selectedSymbol || "BTC",
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
      symbol: selectedSymbol || current.symbol,
    }));
  }, [selectedRiskReportId, selectedSignalId, selectedSymbol]);

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

  return (
    <div className="split-stack">
      <div className="stack">
        <StateBlock error={error} />
        <TradeTable onSelect={selectTrade} rows={proposedRows} selectedTradeId={selectedTradeId} title="Proposed" />
        <TradeTable onSelect={selectTrade} rows={activeRows} selectedTradeId={selectedTradeId} title="Active" />
        <TradeTable onSelect={selectTrade} rows={closedRows} selectedTradeId={selectedTradeId} title="Closed" />
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Propose Paper Trade</h3>
          <div className="field-grid">
            <label className="field">
              <span>Signal</span>
              <input value={proposalDraft.signal_id} onChange={(event) => setProposalDraft((current) => ({ ...current, signal_id: event.target.value }))} />
            </label>
            <label className="field">
              <span>Risk</span>
              <input
                value={proposalDraft.risk_report_id ?? ""}
                onChange={(event) => setProposalDraft((current) => ({ ...current, risk_report_id: event.target.value || null }))}
              />
            </label>
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
                <span>{selectedSignalReality.provenance.source_timing}</span>
              </div>
              <div className="metric-row compact-row">
                <span>{selectedSignalReality.execution_suitability}</span>
                <span>{selectedSignalReality.news_suitability}</span>
              </div>
              <small>{selectedSignalReality.tradable_alignment_note}</small>
            </div>
          ) : null}
          <div className="metric-row">
            <button className="text-button" disabled={busy === "create"} onClick={() => void handleCreateProposal()} type="button">
              {busy === "create" ? "Saving…" : "Create Proposed Trade"}
            </button>
            <small>Uses the selected signal and risk context when present.</small>
          </div>
        </article>

        <article className="panel compact-panel">
          <h3>Selected Paper Trade</h3>
          {selectedTrade ? (
            <>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Trade</span>
                  <strong>{selectedTrade.trade_id}</strong>
                </div>
                <div>
                  <span className="metric-label">State</span>
                  <strong>{selectedTrade.status}</strong>
                </div>
                <div>
                  <span className="metric-label">Asset</span>
                  <strong>{selectedTrade.symbol}</strong>
                </div>
                <div>
                  <span className="metric-label">Realized</span>
                  <strong>{compactNumber(selectedTrade.outcome?.realized_pnl_pct)}%</strong>
                </div>
              </div>
              <div className="metric-row">
                {selectedTrade.signal_id ? (
                  <button className="text-button" onClick={() => onOpenSignal(selectedTrade.signal_id!)} type="button">
                    Open Signal
                  </button>
                ) : null}
                {selectedTrade.risk_report_id ? (
                  <button className="text-button" onClick={() => onOpenRisk(selectedTrade.risk_report_id!)} type="button">
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
                <div className="stack">
                  <div className="metric-row compact-row">
                    <span>
                      {selectedReality.provenance.research_symbol} {"->"} {selectedReality.provenance.tradable_symbol}
                    </span>
                    <span>{selectedReality.provenance.intended_venue}</span>
                  </div>
                  <div className="metric-row compact-row">
                    <span>{selectedReality.execution_suitability}</span>
                    <span>{selectedReality.provenance.source_timing}</span>
                  </div>
                  {selectedReality.event_context_note ? <small>{selectedReality.event_context_note}</small> : null}
                </div>
              ) : null}

              {selectedTrade.status === "proposed" ? (
                <div className="stack">
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
                  <div className="metric-row">
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

              {["opened", "scaled_in", "partially_exited"].includes(selectedTrade.status) ? (
                <div className="stack">
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
                  <div className="metric-row">
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
                  <div className="metric-row">
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

              <article className="panel compact-panel">
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
                  <p className="muted-copy">No attribution yet.</p>
                )}
              </article>
            </>
          ) : (
            <p className="muted-copy">No paper trade selected.</p>
          )}
        </article>
      </div>
    </div>
  );
}
