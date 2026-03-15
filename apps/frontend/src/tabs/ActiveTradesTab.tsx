import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import type { ActiveTradeCreateRequest, ActiveTradeUpdateRequest, ActiveTradeView } from "../types/api";

interface ActiveTradesTabProps {
  rows: ActiveTradeView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
  onChanged: () => Promise<void>;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
}

export function ActiveTradesTab({
  rows,
  selectedSymbol,
  onSelectSymbol,
  selectedSignalId,
  selectedRiskReportId,
  onChanged,
  onOpenSignal,
  onOpenRisk,
}: ActiveTradesTabProps) {
  const selectedTrade = rows.find((row) => row.symbol === selectedSymbol) ?? rows[0] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<ActiveTradeCreateRequest>({
    symbol: selectedSymbol || "BTC",
    strategy_name: "manual_track_v1",
    side: "long",
    entry_time: new Date().toISOString(),
    entry_price: 0,
    current_price: 0,
    stop_price: 0,
    target_price: 0,
    size_band: "small",
    status: "open",
    thesis: "",
    signal_id: selectedSignalId,
    risk_report_id: selectedRiskReportId,
    notes: "",
    data_quality: "manual",
  });
  const [editDraft, setEditDraft] = useState<ActiveTradeUpdateRequest>({
    current_price: selectedTrade?.current_price,
    stop_price: selectedTrade?.stop_price,
    target_price: selectedTrade?.target_price,
    status: selectedTrade?.status,
    size_band: selectedTrade?.size_band,
    thesis: selectedTrade?.thesis,
    notes: selectedTrade?.notes,
    signal_id: selectedTrade?.signal_id,
    risk_report_id: selectedTrade?.risk_report_id,
  });

  useEffect(() => {
    setCreateDraft((current) => ({
      ...current,
      symbol: selectedSymbol || current.symbol,
      signal_id: selectedSignalId,
      risk_report_id: selectedRiskReportId,
    }));
  }, [selectedRiskReportId, selectedSignalId, selectedSymbol]);

  useEffect(() => {
    setEditDraft({
      current_price: selectedTrade?.current_price,
      stop_price: selectedTrade?.stop_price,
      target_price: selectedTrade?.target_price,
      status: selectedTrade?.status,
      size_band: selectedTrade?.size_band,
      thesis: selectedTrade?.thesis,
      notes: selectedTrade?.notes,
      signal_id: selectedTrade?.signal_id,
      risk_report_id: selectedTrade?.risk_report_id,
    });
  }, [selectedTrade]);

  async function handleCreate() {
    setBusy("create");
    setError(null);
    try {
      await apiClient.createActiveTrade(createDraft);
      await onChanged();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Trade create failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdate() {
    if (!selectedTrade) {
      return;
    }
    setBusy("update");
    setError(null);
    try {
      await apiClient.updateActiveTrade(selectedTrade.trade_id, editDraft);
      await onChanged();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Trade update failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!selectedTrade) {
      return;
    }
    setBusy("delete");
    setError(null);
    try {
      await apiClient.deleteActiveTrade(selectedTrade.trade_id);
      await onChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Trade delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="split-stack">
      <div className="stack">
        <StateBlock error={error} />
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Strategy</th>
              <th>Entry</th>
              <th>Current</th>
              <th>Stop</th>
              <th>Target</th>
              <th>PnL</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={selectedTrade?.trade_id === row.trade_id ? "row-selected" : ""}
                key={row.trade_id}
                onClick={() => onSelectSymbol(row.symbol)}
              >
                <td>{row.symbol}</td>
                <td>{row.strategy_name}</td>
                <td>{row.entry_price.toFixed(2)}</td>
                <td>{row.current_price.toFixed(2)}</td>
                <td>{row.stop_price.toFixed(2)}</td>
                <td>{row.target_price.toFixed(2)}</td>
                <td>{row.pnl_pct.toFixed(2)}%</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Create Tracked Trade</h3>
          <div className="field-grid">
            <label className="field">
              <span>Symbol</span>
              <input value={createDraft.symbol} onChange={(event) => setCreateDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} />
            </label>
            <label className="field">
              <span>Strategy</span>
              <input value={createDraft.strategy_name} onChange={(event) => setCreateDraft((current) => ({ ...current, strategy_name: event.target.value }))} />
            </label>
            <label className="field">
              <span>Entry</span>
              <input type="number" value={createDraft.entry_price} onChange={(event) => setCreateDraft((current) => ({ ...current, entry_price: Number(event.target.value) }))} />
            </label>
            <label className="field">
              <span>Current</span>
              <input type="number" value={createDraft.current_price} onChange={(event) => setCreateDraft((current) => ({ ...current, current_price: Number(event.target.value) }))} />
            </label>
            <label className="field">
              <span>Stop</span>
              <input type="number" value={createDraft.stop_price} onChange={(event) => setCreateDraft((current) => ({ ...current, stop_price: Number(event.target.value) }))} />
            </label>
            <label className="field">
              <span>Target</span>
              <input type="number" value={createDraft.target_price} onChange={(event) => setCreateDraft((current) => ({ ...current, target_price: Number(event.target.value) }))} />
            </label>
          </div>
          <label className="field">
            <span>Thesis</span>
            <textarea value={createDraft.thesis} onChange={(event) => setCreateDraft((current) => ({ ...current, thesis: event.target.value }))} />
          </label>
          <div className="metric-row">
            <button className="text-button" disabled={busy === "create"} onClick={() => void handleCreate()} type="button">
              {busy === "create" ? "Saving…" : "Create Trade"}
            </button>
            <small>Links to selected signal/risk when present.</small>
          </div>
        </article>

        <article className="panel compact-panel">
          <h3>Update Selected Trade</h3>
          {selectedTrade ? (
            <>
              <div className="metric-row">
                <strong>{selectedTrade.symbol}</strong>
                <span>{selectedTrade.strategy_name}</span>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Current</span>
                  <input type="number" value={editDraft.current_price ?? 0} onChange={(event) => setEditDraft((current) => ({ ...current, current_price: Number(event.target.value) }))} />
                </label>
                <label className="field">
                  <span>Stop</span>
                  <input type="number" value={editDraft.stop_price ?? 0} onChange={(event) => setEditDraft((current) => ({ ...current, stop_price: Number(event.target.value) }))} />
                </label>
                <label className="field">
                  <span>Target</span>
                  <input type="number" value={editDraft.target_price ?? 0} onChange={(event) => setEditDraft((current) => ({ ...current, target_price: Number(event.target.value) }))} />
                </label>
              </div>
              <label className="field">
                <span>Notes</span>
                <textarea value={editDraft.notes ?? ""} onChange={(event) => setEditDraft((current) => ({ ...current, notes: event.target.value }))} />
              </label>
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
              <div className="metric-row">
                <button className="text-button" disabled={busy === "update"} onClick={() => void handleUpdate()} type="button">
                  {busy === "update" ? "Saving…" : "Update Trade"}
                </button>
                <button className="text-button" disabled={busy === "delete"} onClick={() => void handleDelete()} type="button">
                  {busy === "delete" ? "Removing…" : "Delete Trade"}
                </button>
              </div>
            </>
          ) : (
            <p className="muted-copy">No tracked trade selected.</p>
          )}
        </article>
      </div>
    </div>
  );
}
