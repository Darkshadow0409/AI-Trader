import type { WatchlistView } from "../types/api";

interface WatchlistTabProps {
  rows: WatchlistView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function WatchlistTab({ rows, selectedSymbol, onSelectSymbol }: WatchlistTabProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Label</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Signal</th>
          <th>Thesis</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr
            className={selectedSymbol === item.symbol ? "row-selected" : ""}
            key={item.symbol}
            onClick={() => onSelectSymbol(item.symbol)}
          >
            <td>{item.symbol}</td>
            <td>{item.label}</td>
            <td>{item.status}</td>
            <td>{item.priority}</td>
            <td>{item.last_signal_score.toFixed(1)}</td>
            <td>{item.thesis}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
