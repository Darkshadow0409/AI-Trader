import type { ActiveTradeView } from "../types/api";

interface ActiveTradesTabProps {
  rows: ActiveTradeView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function ActiveTradesTab({ rows, selectedSymbol, onSelectSymbol }: ActiveTradesTabProps) {
  return (
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
          <tr className={selectedSymbol === row.symbol ? "row-selected" : ""} key={`${row.symbol}-${row.entry_time}`} onClick={() => onSelectSymbol(row.symbol)}>
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
  );
}
