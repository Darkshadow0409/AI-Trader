import type { ResearchView } from "../types/api";

interface ResearchTabProps {
  rows: ResearchView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function ResearchTab({ rows, selectedSymbol, onSelectSymbol }: ResearchTabProps) {
  return (
    <div className="stack">
      <small className="compact-copy">Research is the asset-scout surface: click a row to load the chart, then use the right rail for news, risk, and crowd context.</small>
      <table className="data-table">
        <thead>
          <tr>
            <th>Trader Asset</th>
            <th>Underlying</th>
            <th>Last</th>
            <th>1D</th>
            <th>5D</th>
            <th>Trend</th>
            <th>Rel Vol</th>
            <th>ATR%</th>
            <th>Breakout%</th>
            <th>Crowd</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className={selectedSymbol === row.symbol ? "row-selected" : ""} key={row.symbol} onClick={() => onSelectSymbol(row.symbol)}>
              <td>{row.label}</td>
              <td>{row.symbol}</td>
              <td>{row.last_price.toFixed(2)}</td>
              <td>{row.return_1d_pct.toFixed(2)}%</td>
              <td>{row.return_5d_pct.toFixed(2)}%</td>
              <td>{row.trend_state}</td>
              <td>{row.relative_volume.toFixed(2)}</td>
              <td>{row.atr_pct.toFixed(2)}%</td>
              <td>{row.breakout_distance.toFixed(2)}%</td>
              <td>{row.related_polymarket_markets?.[0]?.outcomes?.[0] ? `${row.related_polymarket_markets[0].outcomes[0].label} ${(row.related_polymarket_markets[0].outcomes[0].probability * 100).toFixed(0)}%` : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
