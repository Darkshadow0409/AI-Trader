import type { ResearchView, WatchlistView } from "../types/api";

interface LeftRailProps {
  selectedSymbol: string;
  watchlist: WatchlistView[];
  research: ResearchView[];
  onSelectSymbol: (symbol: string) => void;
}

export function LeftRail({ selectedSymbol, watchlist, research, onSelectSymbol }: LeftRailProps) {
  const scoutAssets = [...research].sort((left, right) => right.breakout_distance - left.breakout_distance).slice(0, 6);

  return (
    <aside className="left-rail">
      <section className="rail-panel">
        <div className="rail-header">
          <span className="eyebrow">Watchlists</span>
        </div>
        {watchlist.map((item) => (
          <button
            className={selectedSymbol === item.symbol ? "rail-item active" : "rail-item"}
            key={item.symbol}
            onClick={() => onSelectSymbol(item.symbol)}
            type="button"
          >
            <strong>{item.symbol}</strong>
            <span>{item.status}</span>
            <small>{item.last_signal_score.toFixed(1)}</small>
          </button>
        ))}
      </section>

      <section className="rail-panel">
        <div className="rail-header">
          <span className="eyebrow">Scout Assets</span>
        </div>
        {scoutAssets.map((item) => (
          <button
            className={selectedSymbol === item.symbol ? "rail-item active" : "rail-item"}
            key={item.symbol}
            onClick={() => onSelectSymbol(item.symbol)}
            type="button"
          >
            <strong>{item.symbol}</strong>
            <span>{item.trend_state}</span>
            <small>{item.breakout_distance.toFixed(2)}%</small>
          </button>
        ))}
      </section>
    </aside>
  );
}
