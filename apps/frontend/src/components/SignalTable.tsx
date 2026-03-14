import type { SignalView } from "../types/api";

interface SignalTableProps {
  rows: SignalView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function SignalTable({ rows, selectedSymbol, onSelectSymbol }: SignalTableProps) {
  return (
    <table className="data-table signal-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Type</th>
          <th>Score</th>
          <th>Confidence</th>
          <th>Noise</th>
          <th>Invalidation</th>
          <th>Targets</th>
          <th>Quality</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            className={row.symbol === selectedSymbol ? "row-selected" : ""}
            key={`${row.symbol}-${row.signal_type}-${row.timestamp}`}
            onClick={() => onSelectSymbol(row.symbol)}
          >
            <td>{row.symbol}</td>
            <td>{row.signal_type.replace(/_/g, " ")}</td>
            <td>{row.score.toFixed(1)}</td>
            <td>{(row.confidence * 100).toFixed(0)}%</td>
            <td>{(row.noise_probability * 100).toFixed(0)}%</td>
            <td>{row.invalidation.toFixed(2)}</td>
            <td>
              {row.targets.base?.toFixed(2)} / {row.targets.stretch?.toFixed(2)}
            </td>
            <td>{row.data_quality}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
