import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { StateBlock } from "../components/StateBlock";
import { compactWorkflowId, duplicateWorkflowIdentityBases, duplicateWorkflowSymbols, workflowIdentityLabel } from "../lib/workflowIdentity";
import {
  selectedAssetTruthFallbackLabel,
  selectedAssetTruthFreshnessLabel,
  selectedAssetTruthSourceFamilyLabel,
  selectedAssetTruthStateLabel,
} from "../lib/selectedAssetTruth";
import { sameTerminalFocusSymbol } from "../lib/terminalFocus";
import { formatDateTimeIST } from "../lib/time";
import { checklistLabel, commodityTruthIsReadyCurrent, commodityTruthStateLabel, commodityTruthSummaryLabel, proposalStateLabel, titleCase, traderFreshnessStateLabel } from "../lib/uiLabels";
import type {
  AlertEnvelope,
  BrokerAdapterSnapshotView,
  CommodityTruthStatusView,
  ManualFillCreateRequest,
  SelectedAssetTruthView,
  TradeTicketApprovalRequest,
  TradeTicketCreateRequest,
  TradeTicketDetailView,
  TradeTicketUpdateRequest,
  TradeTicketView,
} from "../types/api";

interface TradeTicketsTabProps {
  alerts?: AlertEnvelope[];
  tickets: TradeTicketView[];
  hydrationLoading?: boolean;
  hydrationError?: string | null;
  shadowRows: TradeTicketDetailView[];
  detail: TradeTicketDetailView | null;
  brokerSnapshot: BrokerAdapterSnapshotView;
  commodityTruth?: CommodityTruthStatusView | null;
  selectedTicketId: string | null;
  selectedSymbol: string;
  selectedDisplaySymbol?: string | null;
  selectedAssetTruth?: SelectedAssetTruthView | null;
  selectedSignalId: string | null;
  selectedSignalLabel?: string | null;
  selectedRiskReportId: string | null;
  selectedRiskLabel?: string | null;
  summaryCount?: number;
  systemRefreshMinutes?: number | null;
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

function ticketHeadline(ticket: TradeTicketView | TradeTicketDetailView): string {
  const displaySymbol = ticket.display_symbol ?? ticket.data_reality?.provenance.tradable_symbol ?? ticket.symbol;
  const family = ticket.linked_signal_family || ticket.strategy_id || "";
  return family ? `${displaySymbol} ${titleCase(family)}` : `${displaySymbol} ${proposalStateLabel(ticket.status)}`;
}

function ticketLaneLabel(
  ticket: TradeTicketView | TradeTicketDetailView,
  duplicateSymbols: Set<string>,
  duplicateBaseIdentities: Set<string>,
): string {
  const family = ticket.linked_signal_family || ticket.strategy_id || "";
  return workflowIdentityLabel(
    {
      symbol: ticket.display_symbol ?? ticket.data_reality?.provenance.tradable_symbol ?? ticket.symbol,
      family: family ? titleCase(family) : "Draft setup",
      side: ticket.side,
      lifecycle: proposalStateLabel(ticket.status),
      accountabilityState:
        ticket.approval_status && ticket.approval_status !== ticket.status
          ? proposalStateLabel(ticket.approval_status)
          : null,
      timestamp: ticket.created_at,
      compactId: compactWorkflowId(ticket.ticket_id),
    },
    duplicateSymbols,
    "ticket",
    duplicateBaseIdentities,
  );
}

function isLiveUsefulTicketRow(ticket: TradeTicketView | TradeTicketDetailView): boolean {
  const status = String(ticket.status ?? "").toLowerCase();
  const approvalStatus = String(ticket.approval_status ?? "").toLowerCase();

  if (ticket.history_only) {
    return false;
  }

  if (status === "cancelled" || status === "expired" || status === "invalidated") {
    return false;
  }

  if (approvalStatus === "rejected") {
    return false;
  }

  return true;
}

type TicketAlertLevel = "critical" | "review required" | "informational";

interface TicketPriorityAlert {
  id: string;
  level: TicketAlertLevel;
  title: string;
  detail: string;
}

function ticketAlertRank(level: TicketAlertLevel): number {
  switch (level) {
    case "critical":
      return 0;
    case "review required":
      return 1;
    default:
      return 2;
  }
}

function externalAlertLevel(alert: AlertEnvelope): TicketAlertLevel {
  if (alert.status === "failed" || alert.severity === "critical") {
    return "critical";
  }
  if (
    alert.severity === "warning"
    || alert.category.includes("review")
    || alert.category.includes("violation")
    || alert.category.includes("high_risk")
  ) {
    return "review required";
  }
  return "informational";
}

export function TradeTicketsTab({
  alerts = [],
  tickets,
  hydrationLoading = false,
  hydrationError = null,
  shadowRows,
  detail,
  brokerSnapshot,
  commodityTruth = null,
  selectedTicketId,
  selectedSymbol,
  selectedDisplaySymbol,
  selectedAssetTruth = null,
  selectedSignalId,
  selectedSignalLabel,
  selectedRiskReportId,
  selectedRiskLabel,
  summaryCount = 0,
  systemRefreshMinutes = null,
  onSelectTicket,
  onSelectTrade,
  onOpenSignal,
  onOpenRisk,
  onChanged,
}: TradeTicketsTabProps) {
  const focusDisplaySymbol = selectedDisplaySymbol ?? selectedSymbol;
  const relevantTicketRows = tickets.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol));
  const visibleTicketRows = relevantTicketRows.filter((row) => isLiveUsefulTicketRow(row));
  const historicalTicketRows = relevantTicketRows.filter((row) => !isLiveUsefulTicketRow(row));
  const relevantShadowRows = shadowRows.filter((row) => sameTerminalFocusSymbol(row.symbol, selectedSymbol));
  const visibleShadowRows = relevantShadowRows.filter((row) => row.status !== "cancelled" && row.approval_status !== "rejected");
  const activeShadowRows = visibleShadowRows.filter((row) => !row.history_only);
  const historicalShadowRows = visibleShadowRows.filter((row) => row.history_only);
  const hasFocusedWorkflowFallback = Boolean(
    visibleShadowRows.length > 0
    || summaryCount > 0
    || selectedSignalLabel
    || selectedRiskLabel,
  );
  const canSettleIntoEmptyTicketState = Boolean(
    !hydrationError
    && summaryCount === 0
    && relevantShadowRows.length === 0,
  );
  const activeDuplicateShapes = [...visibleTicketRows, ...activeShadowRows].map((row) => ({
    symbol: row.display_symbol ?? row.data_reality?.provenance.tradable_symbol ?? row.symbol,
    family: row.linked_signal_family || row.strategy_id ? titleCase(row.linked_signal_family || row.strategy_id || "") : "Draft setup",
    side: row.side,
    lifecycle: proposalStateLabel(row.status),
    accountabilityState:
      row.approval_status && row.approval_status !== row.status ? proposalStateLabel(row.approval_status) : null,
    timestamp: row.created_at,
    compactId: compactWorkflowId(row.ticket_id),
  }));
  const historicalDuplicateShapes = [...historicalTicketRows, ...historicalShadowRows].map((row) => ({
    symbol: row.display_symbol ?? row.data_reality?.provenance.tradable_symbol ?? row.symbol,
    family: row.linked_signal_family || row.strategy_id ? titleCase(row.linked_signal_family || row.strategy_id || "") : "Draft setup",
    side: row.side,
    lifecycle: proposalStateLabel(row.status),
    accountabilityState:
      row.approval_status && row.approval_status !== row.status ? proposalStateLabel(row.approval_status) : null,
    timestamp: row.created_at,
    compactId: compactWorkflowId(row.ticket_id),
  }));
  const activeDuplicateSymbols = duplicateWorkflowSymbols(activeDuplicateShapes);
  const activeDuplicateBaseIdentities = duplicateWorkflowIdentityBases(activeDuplicateShapes);
  const historicalDuplicateSymbols = duplicateWorkflowSymbols(historicalDuplicateShapes);
  const historicalDuplicateBaseIdentities = duplicateWorkflowIdentityBases(historicalDuplicateShapes);
  const selectedTicket =
    detail
    ?? [...tickets, ...shadowRows].find((row) => row.ticket_id === selectedTicketId)
    ?? visibleTicketRows[0]
    ?? relevantShadowRows[0]
    ?? (!selectedSymbol ? tickets[0] : null)
    ?? (!selectedSymbol ? shadowRows[0] : null)
    ?? null;
  const linkedSignal = detail?.linked_signal ?? null;
  const linkedRisk = detail?.linked_risk ?? null;
  const missingLinkedSignal = Boolean(detail?.signal_id) && !linkedSignal;
  const missingLinkedRisk = Boolean(detail?.risk_report_id) && !linkedRisk;
  const integrityBlocked = selectedTicket ? !selectedTicket.promotable : false;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<TradeTicketCreateRequest>({
    signal_id: selectedSignalId ?? "",
    risk_report_id: selectedRiskReportId,
    strategy_id: "manual_shadow_ops",
    symbol: selectedDisplaySymbol ?? selectedSymbol,
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
  const ticketRowsMessage =
    visibleShadowRows.length > 0
      ? `No active ticket rows are open for ${focusDisplaySymbol}. Recent ticket history is available in the collapsed shadow history panel below.`
      : hydrationError
        ? `Ticket rows for ${focusDisplaySymbol} failed to load. ${hydrationError}`
        : hydrationLoading && canSettleIntoEmptyTicketState
          ? `No active ticket rows are open for ${focusDisplaySymbol} right now. The ticket lane is checking recent shadow and reconciliation context, but no current workflow is in scope yet.`
        : hydrationLoading && hasFocusedWorkflowFallback
          ? summaryCount > 0
            ? `Ticket summary state is already live for ${focusDisplaySymbol}. No active rows are open right now, so the workspace is carrying the current setup and risk context while ticket history reconciles.`
            : `No active ticket rows are open for ${focusDisplaySymbol} yet. The current setup and risk context are already loaded while the ticket lane reconciles recent state.`
          : summaryCount > 0
            ? `Ticket summary state is live, but no ${focusDisplaySymbol} rows are active right now.`
            : hydrationLoading
              ? `Ticket rows for ${focusDisplaySymbol} are hydrating from the current paper-trade and shadow-mode state.`
              : shadowRows.length > 0
                ? "No active ticket rows are open for the current asset, but shadow-mode ticket context is still available below."
                : "No trade tickets are available in the current state.";
  const showRetryButton = hydrationLoading || hydrationError || summaryCount > 0;
  const ticketDetailFallbackMessage =
    visibleShadowRows.length > 0
      ? `No active ${focusDisplaySymbol} ticket is selected. Recent shadow history is available if you need to audit the last-known ticket context for this asset.`
      : canSettleIntoEmptyTicketState
        ? `No focused ${focusDisplaySymbol} ticket is open right now. There is no current ticket workflow in scope for this asset yet.`
      : hasFocusedWorkflowFallback
        ? `No focused ${focusDisplaySymbol} ticket is open right now. The current setup and risk context are already loaded, so you can review the lane before drafting or reopening a paper ticket.`
        : "No trade ticket selected.";

  useEffect(() => {
    setCreateDraft((current) => ({
      ...current,
      signal_id: selectedSignalId ?? current.signal_id,
      risk_report_id: selectedRiskReportId,
      symbol: selectedDisplaySymbol || selectedSymbol || current.symbol,
    }));
  }, [selectedDisplaySymbol, selectedRiskReportId, selectedSignalId, selectedSymbol]);

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

  const focusedGuidance = selectedTicket
    ? Array.from(new Set(selectedTicket.operator_guidance)).slice(0, 2)
    : [];
  const draftWorkflowReady = Boolean(
    !selectedTicket
    && (
      selectedSignalId
      || selectedRiskReportId
      || selectedSignalLabel
      || selectedRiskLabel
      || hasFocusedWorkflowFallback
    ),
  );
  const heroMode: "focused" | "draft" | "empty" = selectedTicket ? "focused" : draftWorkflowReady ? "draft" : "empty";
  const reviewStatus =
    selectedTicket
      ? proposalStateLabel(selectedTicket.approval_status)
      : draftWorkflowReady
        ? "draft pending"
        : "idle";
  const routeAlerts = alerts
    .filter((item) => item.status !== "suppressed")
    .filter((item) => item.asset_ids.length === 0 || item.asset_ids.some((asset) => sameTerminalFocusSymbol(asset, selectedSymbol)))
    .map((item) => ({
      id: `alert:${item.alert_id}`,
      level: externalAlertLevel(item),
      title: item.title,
      detail: item.body,
    }));
  const manualFillReviewAlerts = detail?.manual_fills
    ?.filter((fill) => Math.abs(fill.reconciliation.slippage_variance_bps) >= 50)
    .map((fill) => ({
      id: `fill:${fill.fill_id}`,
      level: "review required" as const,
      title: "Manual fill review needed",
      detail: `${compactNumber(fill.reconciliation.slippage_variance_bps)}bps variance from plan requires operator review before this ticket counts as reconciled.`,
    })) ?? [];
  const localPriorityAlerts: TicketPriorityAlert[] = [
    ...(hydrationError ? [{
      id: "ticket-hydration-error",
      level: "critical",
      title: "Ticket lane refresh failed",
      detail: hydrationError,
    } satisfies TicketPriorityAlert] : []),
    ...(commodityTruth && !commodityTruthIsReadyCurrent(commodityTruth) ? [{
      id: "commodity-truth-warning",
      level: commodityTruth.truth_state === "ready_last_verified" ? "review required" : "critical",
      title: commodityTruthStateLabel(commodityTruth),
      detail: commodityTruthSummaryLabel(commodityTruth),
    } satisfies TicketPriorityAlert] : []),
    ...(integrityBlocked ? [{
      id: "ticket-integrity-block",
      level: "critical",
      title: "Focused ticket is blocked",
      detail: selectedTicket?.integrity_note ?? "Checklist or integrity blockers must clear before this ticket can progress.",
    } satisfies TicketPriorityAlert] : []),
    ...(missingLinkedSignal ? [{
      id: "missing-linked-signal",
      level: "review required",
      title: "Linked setup needs review",
      detail: "The focused ticket references a setup that is no longer available in the current workspace context.",
    } satisfies TicketPriorityAlert] : []),
    ...(missingLinkedRisk ? [{
      id: "missing-linked-risk",
      level: "review required",
      title: "Linked risk frame needs review",
      detail: "The focused ticket references a risk frame that is no longer available in the current workspace context.",
    } satisfies TicketPriorityAlert] : []),
    ...(selectedTicket?.paper_account && selectedTicket.paper_account.allocated_capital > selectedTicket.paper_account.account_size ? [{
      id: "paper-over-allocation",
      level: "review required",
      title: "Paper account is over-allocated",
      detail: "Allocated paper capital exceeds the 10k account and should be treated as overlapping exposure.",
    } satisfies TicketPriorityAlert] : []),
    ...manualFillReviewAlerts,
    ...routeAlerts,
  ];
  const prioritizedAlerts = Array.from(
    new Map(localPriorityAlerts.map((item) => [`${item.level}|${item.title}|${item.detail}`, item])).values(),
  ).sort((left, right) => {
    const levelDiff = ticketAlertRank(left.level) - ticketAlertRank(right.level);
    if (levelDiff !== 0) {
      return levelDiff;
    }
    return left.title.localeCompare(right.title);
  });
  const visiblePriorityAlerts = prioritizedAlerts.slice(0, 3);
  const overflowPriorityAlerts = prioritizedAlerts.slice(3);

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

  function renderDraftForm() {
    return (
      <>
        <div className="stack">
          <small>Signal context: {selectedSignalLabel ?? "no signal selected"}</small>
          <small>Risk context: {selectedRiskLabel ?? "no risk selected"}</small>
          {!createDraft.signal_id ? <small>Select a signal first, then create the ticket from that loaded setup context.</small> : null}
        </div>
        <div className="field-grid detail-field-grid">
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
      </>
    );
  }

  return (
    <div className="tickets-workstation">
      <section className="tickets-primary-zone stack">
        <StateBlock error={error} />
        <article className="panel compact-panel detail-table-panel tickets-queue-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Active Queue</p>
              <h2>Ticket Queue</h2>
            </div>
            <small>{visibleTicketRows.length} open</small>
          </div>
          {visibleTicketRows.length === 0 ? (
            <div className="stack">
              <div className="showcase-note">
                <strong className="showcase-note-title">Ticket lane is quiet</strong>
                <p className="showcase-note-body">{ticketRowsMessage}</p>
              </div>
              {showRetryButton ? <button className="text-button" onClick={() => void onChanged()} type="button">Retry ticket hydration</button> : null}
            </div>
          ) : (
            <div className="tickets-queue-list">
              {visibleTicketRows.map((ticket) => (
                <button
                  className={`wire-row tickets-queue-item ${ticket.ticket_id === selectedTicketId ? "active" : ""}`}
                  key={ticket.ticket_id}
                  onClick={() => onSelectTicket(ticket.ticket_id)}
                  type="button"
                >
                  <div className="stack compact-stack">
                    <strong>{ticketLaneLabel(ticket, activeDuplicateSymbols, activeDuplicateBaseIdentities)}</strong>
                    <small>{formatDateTimeIST(ticket.created_at)}</small>
                  </div>
                  <div className="stack compact-stack tickets-queue-meta">
                    <small>{proposalStateLabel(ticket.status)}</small>
                    <small>{traderFreshnessStateLabel((ticket.freshness_summary.freshness_state as string) ?? ticket.data_reality?.freshness_state, ticket.data_reality?.execution_grade_allowed)}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="panel compact-panel hero-panel detail-shell-panel ticket-workstation-hero ticket-detail-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Primary Action</p>
              <h2>{heroMode === "focused" ? "Focused Ticket" : heroMode === "draft" ? "Draft Ticket Workflow" : "Open Ticket Workflow"}</h2>
            </div>
            <small className="compact-copy">
              {heroMode === "focused"
                ? "Ticket action stays dominant while context and audit move into secondary lanes."
                : heroMode === "draft"
                  ? "Draft a paper-review ticket from the current setup and risk context."
                  : "Load setup context first, then open a draft ticket workflow."}
            </small>
          </div>

          {heroMode === "focused" && selectedTicket ? (
            <>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Ticket</span>
                  <strong>{ticketHeadline(selectedTicket)}</strong>
                  <small>{formatDateTimeIST(selectedTicket.created_at)}</small>
                </div>
                <div>
                  <span className="metric-label">Status</span>
                  <strong>{proposalStateLabel(selectedTicket.status)}</strong>
                </div>
                <div>
                  <span className="metric-label">Approval</span>
                  <strong>{proposalStateLabel(selectedTicket.approval_status)}</strong>
                </div>
                <div>
                  <span className="metric-label">Review Gate</span>
                  <strong>{titleCase(selectedTicket.integrity_state ?? "unknown")}</strong>
                </div>
              </div>
              <div className="stack detail-meta-stack">
                <small>Signal source: {linkedSignal?.display_symbol ? `${linkedSignal.display_symbol} ${titleCase(linkedSignal.signal_type)}` : missingLinkedSignal ? "Linked setup is no longer available." : selectedSignalLabel ?? "No linked signal in scope"}</small>
                <small>Risk frame: {linkedRisk ? `${linkedRisk.display_symbol ?? linkedRisk.symbol} stop ${compactNumber(linkedRisk.stop_price)}` : missingLinkedRisk ? "Linked risk frame is no longer available." : selectedRiskLabel ?? "No linked risk in scope"}</small>
                {selectedTicket.integrity_note ? <small>{selectedTicket.integrity_note}</small> : null}
                <small>Next obligation: clear checklist blockers, then either move into paper execution review or archive into history.</small>
                {commodityTruth?.truth_state === "ready_last_verified" ? <small>Using last verified delayed futures context. Keep this workflow paper-only and review-first.</small> : null}
                {commodityTruth?.truth_state === "warming_up" || commodityTruth?.truth_state === "unavailable" ? <small>Commodity truth is not current-ready. Keep this workflow in research and paper-review mode only.</small> : null}
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
              <div className="stack detail-meta-stack">
                <small>Current trading symbol: {selectedTicket.data_reality?.provenance.tradable_symbol ?? selectedTicket.symbol}</small>
                <small>{selectedTicket.data_reality?.tradable_alignment_note ?? "Use data reality and risk context before approving the ticket."}</small>
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
                {selectedTicket.trade_id ? (
                  <button className="text-button" onClick={() => onSelectTrade(selectedTicket.trade_id)} type="button">
                    Open Trade
                  </button>
                ) : null}
              </div>
              <div className="field-grid detail-field-grid">
                {Object.entries(checklistDraft).map(([key, value]) => (
                  <label className="field checkbox-field" key={key}>
                    <span>{checklistLabel(key)}</span>
                    <input
                      checked={value}
                      onChange={(event) => setChecklistDraft((current) => ({ ...current, [key]: event.target.checked }))}
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
              {selectedTicket.checklist_status.blocked_reasons.length > 0 ? (
                <div className="stack detail-note-stack">
                  {selectedTicket.checklist_status.blocked_reasons.map((reason) => (
                    <small key={reason}>{reason}</small>
                  ))}
                </div>
              ) : null}
              <div className="metric-row detail-action-row">
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
                  disabled={busy === "approve-ticket" || integrityBlocked}
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
              <div className="metric-row detail-action-row">
                <button
                  className="text-button"
                  disabled={busy === "shadow-ticket" || integrityBlocked}
                  onClick={() => void runAction("shadow-ticket", () => apiClient.shadowActivateTradeTicket(selectedTicket.ticket_id, "Shadow mode armed."))}
                  type="button"
                >
                  {busy === "shadow-ticket" ? "Saving…" : "Paper Execution Check"}
                </button>
                <button
                  className="text-button"
                  disabled={busy === "execute-ticket" || integrityBlocked}
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
              <details className="ticket-draft-details" open>
                <summary>Start another draft ticket</summary>
                <div className="stack">{renderDraftForm()}</div>
              </details>
            </>
          ) : heroMode === "draft" ? (
            <div className="stack">
              <div className="showcase-note">
                <strong className="showcase-note-title">Draft from the current setup</strong>
                <p className="showcase-note-body">{ticketDetailFallbackMessage}</p>
              </div>
              {renderDraftForm()}
            </div>
          ) : (
            <div className="stack detail-meta-stack">
              <div className="showcase-note">
                <strong className="showcase-note-title">No active ticket is open</strong>
                <p className="showcase-note-body">{ticketDetailFallbackMessage}</p>
              </div>
              <small>Next step: select a signal or risk frame first, then open a paper-review draft ticket.</small>
              {selectedSignalLabel ? <small>Signal context: {selectedSignalLabel}</small> : null}
              {selectedRiskLabel ? <small>Risk context: {selectedRiskLabel}</small> : null}
            </div>
          )}
        </article>
      </section>

      <aside className="tickets-context-rail stack">
        <article className="panel compact-panel detail-subpanel tickets-liveness-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Route Liveness</p>
              <h2>Route Status</h2>
            </div>
          </div>
          <div className="tickets-status-strip">
            <div>
              <span className="metric-label">Market data</span>
              <strong>{selectedAssetTruthStateLabel(selectedAssetTruth)}</strong>
              <small>{selectedAssetTruthFreshnessLabel(selectedAssetTruth)}</small>
            </div>
            <div>
              <span className="metric-label">Last update</span>
              <strong>{formatDateTimeIST(selectedAssetTruth?.as_of)}</strong>
              <small>{selectedAssetTruthSourceFamilyLabel(selectedAssetTruth)}</small>
            </div>
            <div>
              <span className="metric-label">System refresh</span>
              <strong>{systemRefreshMinutes === null ? "n/a" : `${systemRefreshMinutes}m ago`}</strong>
              <small>{selectedAssetTruthFallbackLabel(selectedAssetTruth)}</small>
            </div>
            <div>
              <span className="metric-label">Review status</span>
              <strong>{reviewStatus}</strong>
              <small>{integrityBlocked ? "blocked" : "reviewable"}</small>
            </div>
          </div>
        </article>

        <article className="panel compact-panel detail-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Decision Context</p>
              <h2>Signal & Risk Context</h2>
            </div>
          </div>
          <div className="stack detail-meta-stack">
            <small>Signal context: {selectedSignalLabel ?? "No loaded setup is attached to this route yet."}</small>
            <small>Risk context: {selectedRiskLabel ?? "No loaded risk frame is attached to this route yet."}</small>
            {focusedGuidance.map((item) => (
              <small key={item}>{item}</small>
            ))}
          </div>
          <div className="metric-row detail-action-row">
            {linkedSignal ? <button className="text-button" onClick={() => onOpenSignal(linkedSignal.signal_id)} type="button">Open Signal</button> : null}
            {linkedRisk ? <button className="text-button" onClick={() => onOpenRisk(linkedRisk.risk_report_id)} type="button">Open Risk</button> : null}
          </div>
        </article>

        <article className="panel compact-panel detail-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Market Truth</p>
              <h2>Data Reality</h2>
            </div>
          </div>
          <div className="stack detail-meta-stack">
            <small>Trader-facing symbol: {selectedTicket?.data_reality?.provenance.tradable_symbol ?? selectedDisplaySymbol ?? selectedSymbol}</small>
            <small>{selectedTicket?.data_reality?.tradable_alignment_note ?? commodityTruthSummaryLabel(commodityTruth)}</small>
            {!commodityTruth && !selectedTicket?.data_reality?.execution_grade_allowed ? <small>Degraded market truth. Keep timing claims paper-only and review-first.</small> : null}
          </div>
        </article>

        <article className="panel compact-panel detail-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Adapter State</p>
              <h2>Broker Adapter Snapshot</h2>
            </div>
          </div>
          <div className="metric-row compact-row">
            <span>balances {brokerSnapshot.balances.length}</span>
            <span>positions {brokerSnapshot.positions.length}</span>
            <span>imports {brokerSnapshot.fill_imports.length}</span>
          </div>
          <small>Read-only mock adapter surface only. No order routing is enabled.</small>
        </article>

        <article className="panel compact-panel detail-subpanel">
          <details className="ticket-research-context">
            <summary>Research Context</summary>
            <div className="stack detail-meta-stack">
              <small>Use research prompts to sharpen the ticket plan, not to replace the linked setup, risk frame, or market truth.</small>
              <small>WTI stays research-only context. USOUSD remains the trader-facing oil instrument for this workstation.</small>
              <small>XAGUSD remains the trader-facing silver instrument.</small>
            </div>
          </details>
        </article>
      </aside>

      <section className="tickets-history-band stack">
        <article className="panel compact-panel detail-subpanel tickets-alerts-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Priority Alerts</p>
              <h2>Priority Alerts</h2>
            </div>
            <small>{prioritizedAlerts.length} total</small>
          </div>
          {visiblePriorityAlerts.length > 0 ? (
            <div className="tickets-alert-stack">
              {visiblePriorityAlerts.map((item, index) => {
                const previousLevel = index > 0 ? visiblePriorityAlerts[index - 1]?.level : null;
                return (
                  <div className="tickets-alert-group" key={item.id}>
                    {item.level !== previousLevel ? <small className="tickets-alert-label">{item.level}</small> : null}
                    <div className={`showcase-note tickets-alert-note tickets-alert-${item.level.replace(/\s+/g, "-")}`}>
                      <strong className="showcase-note-title">{item.title}</strong>
                      <p className="showcase-note-body">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
              {overflowPriorityAlerts.length > 0 ? (
                <details className="ticket-draft-details">
                  <summary>More alerts ({overflowPriorityAlerts.length})</summary>
                  <div className="stack">
                    {overflowPriorityAlerts.map((item) => (
                      <div className={`showcase-note tickets-alert-note tickets-alert-${item.level.replace(/\s+/g, "-")}`} key={item.id}>
                        <strong className="showcase-note-title">{item.title}</strong>
                        <p className="showcase-note-body">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">No ticket-specific blockers are open right now.</p>
            </div>
          )}
        </article>

        <article className="panel compact-panel detail-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Paper Workflow</p>
              <h2>Paper Execution Check</h2>
            </div>
          </div>
          {detail?.shadow_summary ? (
            <>
              <div className="metric-row compact-row">
                <span>{detail.shadow_summary.ticket_valid ? "valid" : "invalid"}</span>
                <span>{traderFreshnessStateLabel(detail.shadow_summary.freshness_state, selectedTicket?.data_reality?.execution_grade_allowed)}</span>
                <span>{compactNumber(detail.shadow_summary.observed_vs_plan_pct)}%</span>
              </div>
              <small>{detail.shadow_summary.market_path_note}</small>
              {detail.shadow_summary.divergence_reason ? <small>{detail.shadow_summary.divergence_reason}</small> : null}
            </>
          ) : (
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">No shadow summary is linked to the focused ticket yet.</p>
            </div>
          )}
        </article>

        <article className="panel compact-panel detail-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Manual Review</p>
              <h2>Manual Fill Review</h2>
            </div>
          </div>
          {selectedTicket ? (
            <>
              <div className="field-grid detail-field-grid">
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
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fill Time</th>
                        <th>Price</th>
                        <th>Slip</th>
                        <th>Variance</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.manual_fills.map((fill) => (
                        <tr key={fill.fill_id}>
                          <td>{formatDateTimeIST(fill.filled_at)}</td>
                          <td>{compactNumber(fill.fill_price)}</td>
                          <td>{compactNumber(fill.reconciliation.actual_slippage_bps)}bps</td>
                          <td>{compactNumber(fill.reconciliation.slippage_variance_bps)}bps</td>
                          <td>{fill.reconciliation.requires_review ? "needed" : "clear"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detail.manual_fills.some((fill) => Math.abs(fill.reconciliation.slippage_variance_bps) >= 50) ? (
                    <small>Large slippage variance usually means the manual fill was recorded well away from the original plan or under a delayed or proxy context. Treat it as a reconciliation exception, not a live execution claim.</small>
                  ) : null}
                </>
              ) : (
                <div className="showcase-note showcase-note-inline">
                  <p className="showcase-note-body">No manual fills linked yet.</p>
                </div>
              )}
            </>
          ) : (
            <div className="showcase-note showcase-note-inline">
              <p className="showcase-note-body">Select a ticket before recording or importing a manual fill.</p>
            </div>
          )}
        </article>

        <article className="panel compact-panel detail-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Audit Band</p>
              <h2>Ticket History</h2>
            </div>
          </div>
          <details className="ticket-shadow-history" open={historicalTicketRows.length > 0 || visibleShadowRows.length > 0}>
            <summary>
              <span>Review recent ticket and shadow continuity</span>
              <span>{historicalTicketRows.length + visibleShadowRows.length}</span>
            </summary>
            {tickets.length === 0 && (historicalTicketRows.length > 0 || visibleShadowRows.length > 0) ? (
              <div className="showcase-note showcase-note-inline">
                <p className="showcase-note-body">No current live ticket rows are open. Shadow-mode history is available here for audit continuity, not as the primary workflow lane.</p>
              </div>
            ) : null}
            {historicalTicketRows.length === 0 && visibleShadowRows.length === 0 ? (
              <div className="showcase-note showcase-note-inline">
                <p className="showcase-note-body">No shadow-mode ticket history is visible for the current asset.</p>
              </div>
            ) : (
              <div className="stack">
                {historicalTicketRows.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Setup</th>
                        <th>Asset</th>
                        <th>Status</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalTicketRows.map((ticket) => (
                        <tr key={ticket.ticket_id} onClick={() => onSelectTicket(ticket.ticket_id)}>
                          <td>{ticketLaneLabel(ticket, historicalDuplicateSymbols, historicalDuplicateBaseIdentities)}</td>
                          <td>{ticket.display_symbol ?? ticket.data_reality?.provenance.tradable_symbol ?? ticket.symbol}</td>
                          <td>{proposalStateLabel(ticket.status)}</td>
                          <td>{ticket.notes || "Closed-trade-linked audit ticket."}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {visibleShadowRows.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Setup</th>
                        <th>Asset</th>
                        <th>Validity</th>
                        <th>Divergence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleShadowRows.map((ticket) => (
                        <tr key={ticket.ticket_id} onClick={() => onSelectTicket(ticket.ticket_id)}>
                          <td>
                            {ticketLaneLabel(
                              ticket,
                              ticket.history_only ? historicalDuplicateSymbols : activeDuplicateSymbols,
                              ticket.history_only ? historicalDuplicateBaseIdentities : activeDuplicateBaseIdentities,
                            )}
                          </td>
                          <td>{ticket.display_symbol ?? ticket.data_reality?.provenance.tradable_symbol ?? ticket.symbol}</td>
                          <td>{ticket.shadow_summary?.ticket_valid ? "Valid" : "Invalid"}</td>
                          <td>{ticket.shadow_summary?.divergence_reason || "Clear"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            )}
          </details>
        </article>
      </section>
    </div>
  );
}
