import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import type {
  BrokerAdapterSnapshotView,
  ManualFillCreateRequest,
  TradeTicketApprovalRequest,
  TradeTicketCreateRequest,
  TradeTicketDetailView,
  TradeTicketUpdateRequest,
  TradeTicketView,
} from "../types/api";

interface TradeTicketsTabProps {
  tickets: TradeTicketView[];
  shadowRows: TradeTicketDetailView[];
  detail: TradeTicketDetailView | null;
  brokerSnapshot: BrokerAdapterSnapshotView;
  selectedTicketId: string | null;
  selectedSymbol: string;
  selectedSignalId: string | null;
  selectedRiskReportId: string | null;
  onSelectTicket: (ticketId: string | null) => void;
  onSelectTrade: (tradeId: string | null) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
  onChanged: () => Promise<void>;
}

function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(Math.abs(value) >= 100 ? 2 : 4);
}

export function TradeTicketsTab({
  tickets,
  shadowRows,
  detail,
  brokerSnapshot,
  selectedTicketId,
  selectedSymbol,
  selectedSignalId,
  selectedRiskReportId,
  onSelectTicket,
  onSelectTrade,
  onOpenSignal,
  onOpenRisk,
  onChanged,
}: TradeTicketsTabProps) {
  const selectedTicket = detail ?? tickets.find((row) => row.ticket_id === selectedTicketId) ?? tickets[0] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<TradeTicketCreateRequest>({
    signal_id: selectedSignalId ?? "",
    risk_report_id: selectedRiskReportId,
    strategy_id: "manual_shadow_ops",
    symbol: selectedSymbol,
    side: "long",
    notes: "",
  });
  const [checklistDraft, setChecklistDraft] = useState<Record<string, boolean>>({});
  const [fillDraft, setFillDraft] = useState<ManualFillCreateRequest>({
    fill_price: 0,
    fill_size: 0.25,
    filled_at: new Date().toISOString(),
    fees: 0,
    notes: "",
  });

  useEffect(() => {
    setCreateDraft((current) => ({
      ...current,
      signal_id: selectedSignalId ?? current.signal_id,
      risk_report_id: selectedRiskReportId,
      symbol: selectedSymbol || current.symbol,
    }));
  }, [selectedRiskReportId, selectedSignalId, selectedSymbol]);

  useEffect(() => {
    if (!selectedTicket) {
      return;
    }
    setChecklistDraft({
      freshness_acceptable: selectedTicket.checklist_status.freshness_acceptable,
      realism_acceptable: selectedTicket.checklist_status.realism_acceptable,
      risk_budget_available: selectedTicket.checklist_status.risk_budget_available,
      cluster_exposure_acceptable: selectedTicket.checklist_status.cluster_exposure_acceptable,
      review_complete: selectedTicket.checklist_status.review_complete,
      operator_acknowledged: selectedTicket.checklist_status.operator_acknowledged,
    });
    setFillDraft({
      fill_price: selectedTicket.proposed_entry_zone.low ?? 0,
      fill_size: Number(selectedTicket.planned_size.target_units ?? 0.25),
      filled_at: new Date().toISOString(),
      fees: 0,
      notes: "",
      trade_id: selectedTicket.trade_id,
    });
  }, [selectedTicket]);

  async function runAction(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Ticket action ${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="split-stack">
      <div className="stack">
        <StateBlock error={error} />
        <article className="panel compact-panel">
          <h3>Trade Tickets</h3>
          {tickets.length === 0 ? (
            <p className="muted-copy">No trade tickets available.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Asset</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Freshness</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    className={ticket.ticket_id === selectedTicketId ? "row-selected" : ""}
                    key={ticket.ticket_id}
                    onClick={() => onSelectTicket(ticket.ticket_id)}
                  >
                    <td>{ticket.ticket_id}</td>
                    <td>{ticket.symbol}</td>
                    <td>{ticket.status}</td>
                    <td>{ticket.approval_status}</td>
                    <td>{ticket.freshness_summary.freshness_state as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="panel compact-panel">
          <h3>Create Draft Ticket</h3>
          <div className="field-grid">
            <label className="field">
              <span>Signal</span>
              <input value={createDraft.signal_id} onChange={(event) => setCreateDraft((current) => ({ ...current, signal_id: event.target.value }))} />
            </label>
            <label className="field">
              <span>Risk</span>
              <input value={createDraft.risk_report_id ?? ""} onChange={(event) => setCreateDraft((current) => ({ ...current, risk_report_id: event.target.value || null }))} />
            </label>
            <label className="field">
              <span>Strategy</span>
              <input value={createDraft.strategy_id ?? ""} onChange={(event) => setCreateDraft((current) => ({ ...current, strategy_id: event.target.value || null }))} />
            </label>
            <label className="field">
              <span>Symbol</span>
              <input value={createDraft.symbol ?? ""} onChange={(event) => setCreateDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))} />
            </label>
            <label className="field">
              <span>Side</span>
              <select value={createDraft.side ?? "long"} onChange={(event) => setCreateDraft((current) => ({ ...current, side: event.target.value }))}>
                <option value="long">long</option>
                <option value="short">short</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea value={createDraft.notes ?? ""} onChange={(event) => setCreateDraft((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          <button
            className="text-button"
            disabled={busy === "create-ticket" || !createDraft.signal_id}
            onClick={() => void runAction("create-ticket", () => apiClient.createTradeTicket(createDraft))}
            type="button"
          >
            {busy === "create-ticket" ? "Saving…" : "Create Draft Ticket"}
          </button>
        </article>
      </div>

      <div className="stack">
        <article className="panel compact-panel">
          <h3>Ticket Detail</h3>
          {selectedTicket ? (
            <>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Ticket</span>
                  <strong>{selectedTicket.ticket_id}</strong>
                </div>
                <div>
                  <span className="metric-label">Status</span>
                  <strong>{selectedTicket.status}</strong>
                </div>
                <div>
                  <span className="metric-label">Approval</span>
                  <strong>{selectedTicket.approval_status}</strong>
                </div>
                <div>
                  <span className="metric-label">Shadow</span>
                  <strong>{selectedTicket.shadow_status}</strong>
                </div>
              </div>
              {selectedTicket.paper_account ? (
                <div className="metric-grid">
                  <div>
                    <span className="metric-label">Paper Equity</span>
                    <strong>{compactNumber(selectedTicket.paper_account.current_equity)}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Allocated</span>
                    <strong>{compactNumber(selectedTicket.paper_account.allocated_capital)}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Open Risk</span>
                    <strong>{compactNumber(selectedTicket.paper_account.open_risk_amount)}</strong>
                  </div>
                  <div>
                    <span className="metric-label">Target / Stop</span>
                    <strong>{compactNumber(selectedTicket.paper_account.projected_base_pnl)} / {compactNumber(selectedTicket.paper_account.projected_stop_loss)}</strong>
                  </div>
                </div>
              ) : null}
              <div className="metric-row">
                {selectedTicket.signal_id ? (
                  <button className="text-button" onClick={() => onOpenSignal(selectedTicket.signal_id!)} type="button">
                    Open Signal
                  </button>
                ) : null}
                {selectedTicket.risk_report_id ? (
                  <button className="text-button" onClick={() => onOpenRisk(selectedTicket.risk_report_id!)} type="button">
                    Open Risk
                  </button>
                ) : null}
                {selectedTicket.trade_id ? (
                  <button className="text-button" onClick={() => onSelectTrade(selectedTicket.trade_id)} type="button">
                    Open Trade
                  </button>
                ) : null}
              </div>
              <div className="field-grid">
                {Object.entries(checklistDraft).map(([key, value]) => (
                  <label className="field checkbox-field" key={key}>
                    <span>{key}</span>
                    <input
                      checked={value}
                      onChange={(event) => setChecklistDraft((current) => ({ ...current, [key]: event.target.checked }))}
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
              {selectedTicket.checklist_status.blocked_reasons.length > 0 ? (
                <div className="stack">
                  {selectedTicket.checklist_status.blocked_reasons.map((reason) => (
                    <small key={reason}>{reason}</small>
                  ))}
                </div>
              ) : null}
              <div className="metric-row">
                <button
                  className="text-button"
                  disabled={busy === "save-checklist"}
                  onClick={() => void runAction("save-checklist", () => apiClient.updateTradeTicket(selectedTicket.ticket_id, { checklist_status: checklistDraft }))}
                  type="button"
                >
                  {busy === "save-checklist" ? "Saving…" : "Save Checklist"}
                </button>
                <button
                  className="text-button"
                  disabled={busy === "approve-ticket"}
                  onClick={() => void runAction("approve-ticket", () => apiClient.approveTradeTicket(selectedTicket.ticket_id, { approval_status: "approved", approval_notes: "Checklist completed." }))}
                  type="button"
                >
                  {busy === "approve-ticket" ? "Saving…" : "Approve"}
                </button>
                <button
                  className="text-button"
                  disabled={busy === "reject-ticket"}
                  onClick={() => void runAction("reject-ticket", () => apiClient.approveTradeTicket(selectedTicket.ticket_id, { approval_status: "rejected", approval_notes: "Rejected in console." }))}
                  type="button"
                >
                  {busy === "reject-ticket" ? "Saving…" : "Reject"}
                </button>
              </div>
              <div className="metric-row">
                <button
                  className="text-button"
                  disabled={busy === "shadow-ticket"}
                  onClick={() => void runAction("shadow-ticket", () => apiClient.shadowActivateTradeTicket(selectedTicket.ticket_id, "Shadow mode armed."))}
                  type="button"
                >
                  {busy === "shadow-ticket" ? "Saving…" : "Shadow Active"}
                </button>
                <button
                  className="text-button"
                  disabled={busy === "execute-ticket"}
                  onClick={() => void runAction("execute-ticket", () => apiClient.manualExecuteTradeTicket(selectedTicket.ticket_id, "Manual external fill recorded.", selectedTicket.trade_id))}
                  type="button"
                >
                  {busy === "execute-ticket" ? "Saving…" : "Manual Execute"}
                </button>
                <button
                  className="text-button"
                  disabled={busy === "expire-ticket"}
                  onClick={() => void runAction("expire-ticket", () => apiClient.expireTradeTicket(selectedTicket.ticket_id, "Expired before entry."))}
                  type="button"
                >
                  {busy === "expire-ticket" ? "Saving…" : "Expire"}
                </button>
              </div>
              <article className="panel compact-panel">
                <h4>Shadow Mode</h4>
                {detail?.shadow_summary ? (
                  <>
                    <div className="metric-row compact-row">
                      <span>{detail.shadow_summary.ticket_valid ? "valid" : "invalid"}</span>
                      <span>{detail.shadow_summary.freshness_state}</span>
                      <span>{compactNumber(detail.shadow_summary.observed_vs_plan_pct)}%</span>
                    </div>
                    <small>{detail.shadow_summary.market_path_note}</small>
                    {detail.shadow_summary.divergence_reason ? <small>{detail.shadow_summary.divergence_reason}</small> : null}
                  </>
                ) : (
                  <p className="muted-copy">No shadow summary yet.</p>
                )}
              </article>
              <article className="panel compact-panel">
                <h4>Manual Fill Reconciliation</h4>
                <div className="field-grid">
                  <label className="field">
                    <span>Fill Price</span>
                    <input type="number" value={fillDraft.fill_price} onChange={(event) => setFillDraft((current) => ({ ...current, fill_price: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Fill Size</span>
                    <input type="number" value={fillDraft.fill_size} onChange={(event) => setFillDraft((current) => ({ ...current, fill_size: Number(event.target.value) }))} />
                  </label>
                  <label className="field">
                    <span>Fees</span>
                    <input type="number" value={fillDraft.fees ?? 0} onChange={(event) => setFillDraft((current) => ({ ...current, fees: Number(event.target.value) }))} />
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <textarea value={fillDraft.notes ?? ""} onChange={(event) => setFillDraft((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <div className="metric-row">
                  <button
                    className="text-button"
                    disabled={busy === "create-fill"}
                    onClick={() => void runAction("create-fill", () => apiClient.createManualFill(selectedTicket.ticket_id, fillDraft))}
                    type="button"
                  >
                    {busy === "create-fill" ? "Saving…" : "Record Fill"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy === "import-fill"}
                    onClick={() =>
                      void runAction("import-fill", () =>
                        apiClient.importManualFills(selectedTicket.ticket_id, {
                          fills: [fillDraft],
                          import_batch_id: "import_console_001",
                          notes: "Imported from operator console.",
                        }))
                    }
                    type="button"
                  >
                    {busy === "import-fill" ? "Saving…" : "Import Fill"}
                  </button>
                </div>
                {detail?.manual_fills?.length ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fill</th>
                        <th>Price</th>
                        <th>Slip</th>
                        <th>Variance</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.manual_fills.map((fill) => (
                        <tr key={fill.fill_id}>
                          <td>{fill.fill_id}</td>
                          <td>{compactNumber(fill.fill_price)}</td>
                          <td>{compactNumber(fill.reconciliation.actual_slippage_bps)}bps</td>
                          <td>{compactNumber(fill.reconciliation.slippage_variance_bps)}bps</td>
                          <td>{fill.reconciliation.requires_review ? "needed" : "clear"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted-copy">No manual fills linked yet.</p>
                )}
              </article>
            </>
          ) : (
            <p className="muted-copy">No trade ticket selected.</p>
          )}
        </article>

        <article className="panel compact-panel">
          <h3>Broker-Ready Snapshot</h3>
          <div className="metric-row compact-row">
            <span>balances {brokerSnapshot.balances.length}</span>
            <span>positions {brokerSnapshot.positions.length}</span>
            <span>imports {brokerSnapshot.fill_imports.length}</span>
          </div>
          <small>Read-only mock adapter surface only. No order routing is enabled.</small>
        </article>

        <article className="panel compact-panel">
          <h3>Shadow Queue</h3>
          {shadowRows.length === 0 ? (
            <p className="muted-copy">No shadow-mode tickets.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Asset</th>
                  <th>Validity</th>
                  <th>Divergence</th>
                </tr>
              </thead>
              <tbody>
                {shadowRows.map((ticket) => (
                  <tr key={ticket.ticket_id} onClick={() => onSelectTicket(ticket.ticket_id)}>
                    <td>{ticket.ticket_id}</td>
                    <td>{ticket.symbol}</td>
                    <td>{ticket.shadow_summary?.ticket_valid ? "valid" : "invalid"}</td>
                    <td>{ticket.shadow_summary?.divergence_reason || "clear"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </div>
    </div>
  );
}
