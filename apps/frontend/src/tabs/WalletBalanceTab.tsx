import type {
  PaperEquityCurvePointView,
  PaperLedgerTransactionView,
  PaperPerformanceSummaryView,
  PaperRejectionAnalysisItemView,
  PaperRiskDecisionView,
  PaperRiskPolicyView,
  PaperReviewQueueItemView,
  PaperWalletView,
  SimulatedOrderView,
  WalletBalanceView,
} from "../types/api";

interface WalletBalanceTabProps {
  rows: WalletBalanceView[];
  paperWallet?: PaperWalletView | null;
  paperLedger?: PaperLedgerTransactionView[];
  paperRiskPolicy?: PaperRiskPolicyView | null;
  paperRiskDecisions?: PaperRiskDecisionView[];
  paperPerformance?: PaperPerformanceSummaryView | null;
  paperEquityCurve?: PaperEquityCurvePointView[];
  paperRejectionAnalysis?: PaperRejectionAnalysisItemView[];
  paperReviewQueue?: PaperReviewQueueItemView[];
  simulatedOrders?: SimulatedOrderView[];
}

function formatMoney(value: number, currency = "USD") {
  return `${currency} ${value.toFixed(2)}`;
}

function formatMaybe(value: number | null) {
  return value === null ? "n/a" : value.toFixed(2);
}

export function WalletBalanceTab({
  rows,
  paperWallet,
  paperLedger = [],
  paperRiskPolicy,
  paperRiskDecisions = [],
  paperPerformance,
  paperEquityCurve = [],
  paperRejectionAnalysis = [],
  paperReviewQueue = [],
  simulatedOrders = [],
}: WalletBalanceTabProps) {
  return (
    <div className="stack">
      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Paper-only simulation</p>
            <h3>Paper Wallet Ledger</h3>
          </div>
          <span className="status-pill">{paperWallet?.status ?? "loading"}</span>
        </div>
        <p className="muted-copy">
          {paperWallet?.accounting_note ??
            "Paper-only simulated cash ledger. Wallet details will appear when the local API is ready."}
        </p>
        {paperWallet ? (
          <>
            <div className="metric-grid">
              <div className="metric-card">
                <span>Cash</span>
                <strong>{formatMoney(paperWallet.cash_balance, paperWallet.currency)}</strong>
              </div>
              <div className="metric-card">
                <span>Reserved</span>
                <strong>{formatMoney(paperWallet.reserved_cash, paperWallet.currency)}</strong>
              </div>
              <div className="metric-card">
                <span>Equity</span>
                <strong>{formatMoney(paperWallet.equity, paperWallet.currency)}</strong>
              </div>
              <div className="metric-card">
                <span>Realized PnL</span>
                <strong>{formatMoney(paperWallet.realized_pnl, paperWallet.currency)}</strong>
              </div>
            </div>
            {!paperWallet.unrealized_pnl_available ? (
              <p className="muted-copy">Unrealized PnL is unavailable until Phase 9 inventory tracking lands.</p>
            ) : null}
          </>
        ) : null}
      </article>

      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Paper performance review</p>
            <h3>Paper Performance</h3>
          </div>
          <span className="status-pill">paper-only</span>
        </div>
        {paperPerformance ? (
          <>
            <div className="metric-grid">
              <div className="metric-card">
                <span>Orders</span>
                <strong>{paperPerformance.total_orders}</strong>
              </div>
              <div className="metric-card">
                <span>Filled</span>
                <strong>{paperPerformance.filled_orders}</strong>
              </div>
              <div className="metric-card">
                <span>Rejected</span>
                <strong>{paperPerformance.rejected_orders}</strong>
              </div>
              <div className="metric-card">
                <span>Acceptance</span>
                <strong>{paperPerformance.acceptance_rate.toFixed(1)}%</strong>
              </div>
              <div className="metric-card">
                <span>Fees paid</span>
                <strong>{formatMoney(paperPerformance.fees_paid, paperPerformance.currency)}</strong>
              </div>
              <div className="metric-card">
                <span>Gross notional</span>
                <strong>{formatMoney(paperPerformance.gross_notional_traded, paperPerformance.currency)}</strong>
              </div>
            </div>
            <p className="muted-copy">
              Unrealized PnL is {paperPerformance.unrealized_pnl_available ? "available" : "unavailable"}; this panel does not
              invent mark-to-market performance.
            </p>
            {paperPerformance.performance_warnings.length > 0 ? (
              <div className="tag-row compact-link-row">
                {paperPerformance.performance_warnings.slice(0, 3).map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted-copy">Paper performance summary will appear when the local API is ready.</p>
        )}
      </article>

      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ledger-derived curve</p>
            <h3>Paper Equity Curve</h3>
          </div>
        </div>
        {paperEquityCurve.length === 0 ? (
          <p className="muted-copy">No equity curve points are available yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Cash</th>
                <th>Reserved</th>
                <th>Realized PnL</th>
                <th>Equity</th>
              </tr>
            </thead>
            <tbody>
              {paperEquityCurve.slice(-6).map((point) => (
                <tr key={`${point.sequence_number}-${point.timestamp}`}>
                  <td>{point.sequence_number}</td>
                  <td>{point.cash_balance.toFixed(2)}</td>
                  <td>{point.reserved_cash.toFixed(2)}</td>
                  <td>{point.realized_pnl.toFixed(2)}</td>
                  <td>{point.equity.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Rejected-order analysis</p>
            <h3>Paper Rejections</h3>
          </div>
        </div>
        {paperRejectionAnalysis.length === 0 ? (
          <p className="muted-copy">No rejected paper orders have been grouped yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Reason</th>
                <th>Count</th>
                <th>Symbols</th>
                <th>Latest note</th>
              </tr>
            </thead>
            <tbody>
              {paperRejectionAnalysis.slice(0, 6).map((group) => (
                <tr key={group.reason_code}>
                  <td>{group.reason_code}</td>
                  <td>{group.count}</td>
                  <td>{group.symbols.join(", ") || "-"}</td>
                  <td>{group.latest_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operator review queue</p>
            <h3>Paper Review Queue</h3>
          </div>
        </div>
        {paperReviewQueue.length === 0 ? (
          <p className="muted-copy">No paper review tasks are open.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Status</th>
                <th>Title</th>
                <th>Symbol</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {paperReviewQueue.slice(0, 6).map((item) => (
                <tr key={item.review_id}>
                  <td>{item.severity}</td>
                  <td>{item.status}</td>
                  <td>{item.title}</td>
                  <td>{item.symbol ?? "-"}</td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Paper risk governor</p>
            <h3>Manual Simulation Limits</h3>
          </div>
          <span className="status-pill">{paperRiskPolicy?.status ?? "loading"}</span>
        </div>
        <p className="muted-copy">
          {paperRiskPolicy?.policy_note ??
            "Paper-only risk policy will appear when the local API is ready. No scheduler or outside order path is attached."}
        </p>
        {paperRiskPolicy ? (
          <>
            <div className="metric-grid">
              <div className="metric-card">
                <span>Max order</span>
                <strong>{formatMoney(paperRiskPolicy.max_order_notional, paperWallet?.currency ?? "USD")}</strong>
              </div>
              <div className="metric-card">
                <span>Open orders</span>
                <strong>{paperRiskPolicy.max_open_orders}</strong>
              </div>
              <div className="metric-card">
                <span>Daily loss cap</span>
                <strong>{formatMoney(paperRiskPolicy.max_daily_loss, paperWallet?.currency ?? "USD")}</strong>
              </div>
              <div className="metric-card">
                <span>Cash buffer</span>
                <strong>{formatMoney(paperRiskPolicy.min_cash_buffer, paperWallet?.currency ?? "USD")}</strong>
              </div>
            </div>
            <div className="tag-row compact-link-row">
              <span>Allowed: {paperRiskPolicy.allowed_symbols.join(", ")}</span>
              <span>Research-only blocked: {paperRiskPolicy.research_only_symbols.join(", ")}</span>
              <span>Max drawdown {paperRiskPolicy.max_drawdown_pct.toFixed(1)}%</span>
            </div>
            {paperRiskPolicy.pause_reason ? <p className="muted-copy">Pause note: {paperRiskPolicy.pause_reason}</p> : null}
          </>
        ) : null}
        {paperRiskDecisions.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Action</th>
                <th>Reason</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {paperRiskDecisions.slice(0, 5).map((decision) => (
                <tr key={decision.decision_id}>
                  <td>{decision.accepted ? "accepted" : "rejected"}</td>
                  <td>{decision.action}</td>
                  <td>{decision.reason}</td>
                  <td>{decision.simulated_order_id ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-copy">No paper risk decisions have been recorded yet.</p>
        )}
      </article>

      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Append-only audit</p>
            <h3>Recent Ledger Entries</h3>
          </div>
        </div>
        {paperLedger.length === 0 ? <p className="muted-copy">No paper ledger entries are available yet.</p> : null}
        {paperLedger.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Cash delta</th>
                <th>Reserved delta</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {paperLedger.slice(0, 8).map((entry) => (
                <tr key={entry.transaction_id}>
                  <td>{entry.sequence_number}</td>
                  <td>{entry.transaction_type}</td>
                  <td>{entry.symbol ?? "-"}</td>
                  <td>{entry.cash_delta.toFixed(2)}</td>
                  <td>{entry.reserved_delta.toFixed(2)}</td>
                  <td>{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </article>

      <article className="panel compact-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Manual simulation only</p>
            <h3>Simulated Orders</h3>
          </div>
        </div>
        {simulatedOrders.length === 0 ? <p className="muted-copy">No simulated paper orders have been recorded yet.</p> : null}
        {simulatedOrders.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Status</th>
                <th>Qty</th>
                <th>Fill</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              {simulatedOrders.slice(0, 8).map((order) => (
                <tr key={order.simulated_order_id}>
                  <td>{order.symbol}</td>
                  <td>{order.side}</td>
                  <td>{order.status}</td>
                  <td>{order.quantity}</td>
                  <td>{formatMaybe(order.fill_price)}</td>
                  <td>{order.fee.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </article>

      {rows.length === 0 ? <p className="muted-copy">No wallet balances are available in the current mode.</p> : null}
      {rows.map((wallet) => (
        <article className="panel compact-panel" key={`${wallet.venue}-${wallet.account_label}`}>
          <h3>Wallet Balance</h3>
          <div className="metric-row">
            <strong>{wallet.account_label}</strong>
            <span>{wallet.venue}</span>
          </div>
          <div className="metric-row">
            <span>Total {wallet.total_usd.toFixed(2)}</span>
            <span>Available {wallet.available_usd.toFixed(2)}</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Free</th>
                <th>Locked</th>
                <th>USD</th>
              </tr>
            </thead>
            <tbody>
              {wallet.balances.map((row) => (
                <tr key={row.asset}>
                  <td>{row.asset}</td>
                  <td>{row.free}</td>
                  <td>{row.locked}</td>
                  <td>{row.usd_value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}
