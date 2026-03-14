import type { BarView, SignalView } from "../types/api";
import { PriceChart } from "../components/PriceChart";

interface SignalsTabProps {
  signals: SignalView[];
  bars: BarView[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function SignalsTab({ signals, bars, selectedSymbol, onSelectSymbol }: SignalsTabProps) {
  return (
    <section className="tab-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Signals</h2>
          <div className="pill-row">
            {signals.map((signal) => (
              <button
                key={`${signal.symbol}-${signal.signal_type}`}
                className={selectedSymbol === signal.symbol ? "pill active" : "pill"}
                onClick={() => onSelectSymbol(signal.symbol)}
                type="button"
              >
                {signal.symbol}
              </button>
            ))}
          </div>
        </div>
        <PriceChart bars={bars} />
      </div>
      <div className="stack">
        {signals.map((signal) => (
          <article className="panel signal-card" key={`${signal.symbol}-${signal.signal_type}`}>
            <div className="card-topline">
              <strong>{signal.symbol}</strong>
              <span className={`direction ${signal.direction}`}>{signal.direction}</span>
            </div>
            <h3>{signal.signal_type.replace(/_/g, " ")}</h3>
            <p>{signal.thesis}</p>
            <div className="metric-row">
              <span>Score {signal.score.toFixed(1)}</span>
              <span>Uncertainty {signal.uncertainty.toFixed(2)}</span>
              <span>Quality {signal.data_quality}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
