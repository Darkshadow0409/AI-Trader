import type { ResearchView } from "../types/api";

interface ResearchTabProps {
  rows: ResearchView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function ResearchTab({ rows, selectedSymbol, onSelectSymbol }: ResearchTabProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Last</th>
          <th>1D</th>
          <th>5D</th>
          <th>Trend</th>
          <th>Rel Vol</th>
          <th>ATR%</th>
          <th>Breakout%</th>
          <th>Structure</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr className={selectedSymbol === row.symbol ? "row-selected" : ""} key={row.symbol} onClick={() => onSelectSymbol(row.symbol)}>
            <td>{row.symbol}</td>
            <td>{row.last_price.toFixed(2)}</td>
            <td>{row.return_1d_pct.toFixed(2)}%</td>
            <td>{row.return_5d_pct.toFixed(2)}%</td>
            <td>{row.trend_state}</td>
            <td>{row.relative_volume.toFixed(2)}</td>
            <td>{row.atr_pct.toFixed(2)}%</td>
            <td>{row.breakout_distance.toFixed(2)}%</td>
            <td>{row.structure_score.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
