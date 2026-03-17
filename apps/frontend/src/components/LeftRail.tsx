import type { ExecutionGateView, OperationalBacklogView, ResearchView, WatchlistView } from "../types/api";

export interface NavItem {
  key: string;
  label: string;
  badge?: string;
  tone?: "default" | "warning" | "critical" | "active";
}

interface LeftRailProps {
  activeTab: string;
  backlog: OperationalBacklogView;
  executionGate: ExecutionGateView | null;
  navItems: NavItem[];
  onSelectSymbol: (symbol: string) => void;
  onSelectTab: (key: string) => void;
  research: ResearchView[];
  selectedSymbol: string;
  watchlist: WatchlistView[];
}

function scoutAssets(research: ResearchView[]): ResearchView[] {
  return [...research]
    .sort((left, right) => {
      const rightPenalty = right.data_reality?.ranking_penalty ?? 0;
      const leftPenalty = left.data_reality?.ranking_penalty ?? 0;
      return (right.breakout_distance - rightPenalty / 100) - (left.breakout_distance - leftPenalty / 100);
    })
    .slice(0, 6);
}

export function LeftRail({
  activeTab,
  backlog,
  executionGate,
  navItems,
  onSelectSymbol,
  onSelectTab,
  research,
  selectedSymbol,
  watchlist,
}: LeftRailProps) {
  const scout = scoutAssets(research);
  const gateTone = executionGate?.status === "execution_candidate" ? "active" : executionGate?.status === "review_required" ? "warning" : "default";

  return (
    <aside className="left-rail">
      <section className="rail-panel nav-panel">
        <div className="rail-header">
          <div>
            <span className="eyebrow">Desk</span>
            <strong>Operator Surface</strong>
          </div>
          <small className={`status-pill ${gateTone}`}>{executionGate?.status ?? "loading"}</small>
        </div>
        <div className="nav-list">
          {navItems.map((item) => (
            <button
              className={activeTab === item.key ? "nav-item active" : `nav-item ${item.tone ?? "default"}`}
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              type="button"
            >
              <span>{item.label}</span>
              {item.badge ? <small>{item.badge}</small> : null}
            </button>
          ))}
        </div>
        <div className="rail-meta">
          <small>{backlog.overdue_count} overdue</small>
          <small>{backlog.high_priority_count} high priority</small>
        </div>
      </section>

      <section className="rail-panel">
        <div className="rail-header">
          <div>
            <span className="eyebrow">Watchlist</span>
            <strong>Focus Assets</strong>
          </div>
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
          <div>
            <span className="eyebrow">Scout Queue</span>
            <strong>Breakout Scan</strong>
          </div>
        </div>
        {scout.map((item) => (
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
