import type { PaperLedgerTransactionView, PaperWalletView, SimulatedOrderView, WalletBalanceView } from "../types/api";

interface WalletBalanceTabProps {
  rows: WalletBalanceView[];
  paperWallet?: PaperWalletView | null;
  paperLedger?: PaperLedgerTransactionView[];
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
