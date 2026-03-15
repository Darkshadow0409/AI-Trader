import { StateBlock } from "../components/StateBlock";
import type { OpportunityHunterView, WatchlistView } from "../types/api";

interface WatchlistTabProps {
  rows: WatchlistView[];
  opportunities: OpportunityHunterView;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenRisk: (riskReportId: string) => void;
}

export function WatchlistTab({ rows, opportunities, selectedSymbol, onSelectSymbol, onOpenSignal, onOpenRisk }: WatchlistTabProps) {
  const renderQueue = (title: string, items: OpportunityHunterView["focus_queue"]) => (
    <article className="panel compact-panel">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Queue</th>
              <th>Score</th>
              <th>Reasons</th>
              <th>Risk Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                className={selectedSymbol === item.symbol ? "row-selected" : ""}
                key={`${title}-${item.symbol}`}
                onClick={() => {
                  onSelectSymbol(item.symbol);
                  if (item.signal_id) {
                    onOpenSignal(item.signal_id);
                  }
                  if (item.risk_report_id) {
                    onOpenRisk(item.risk_report_id);
                  }
                }}
              >
                <td>{item.symbol}</td>
                <td>{item.queue}</td>
                <td>{item.score.toFixed(1)}</td>
                <td>{item.promotion_reasons.join(", ")}</td>
                <td>{item.risk_notes.join(" | ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <StateBlock empty emptyLabel={`No ${title.toLowerCase()} items.`} />
      )}
    </article>
  );

  return (
    <div className="stack">
      <div className="split-stack">
        {renderQueue("Focus Queue", opportunities.focus_queue)}
        {renderQueue("Scout Queue", opportunities.scout_queue)}
      </div>

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
    </div>
  );
}
