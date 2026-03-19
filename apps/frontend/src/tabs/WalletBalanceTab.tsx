import type { WalletBalanceView } from "../types/api";

export function WalletBalanceTab({ rows }: { rows: WalletBalanceView[] }) {
  return (
    <div className="stack">
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
