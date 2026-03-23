import type { ExecutionGateView, OperationalBacklogView, ResearchView, WatchlistSummaryView } from "../types/api";
import { terminalFocusPriority } from "../lib/terminalFocus";
import { gateStatusLabel } from "../lib/uiLabels";

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
  watchlist: WatchlistSummaryView[];
}

function scoutAssets(research: ResearchView[]): ResearchView[] {
  return [...research]
    .sort((left, right) => {
      if (terminalFocusPriority(left.symbol) !== terminalFocusPriority(right.symbol)) {
        return terminalFocusPriority(left.symbol) - terminalFocusPriority(right.symbol);
      }
      const rightPenalty = right.data_reality?.ranking_penalty ?? 0;
      const leftPenalty = left.data_reality?.ranking_penalty ?? 0;
      return (right.breakout_distance - rightPenalty / 100) - (left.breakout_distance - leftPenalty / 100);
    })
    .slice(0, 6);
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <span className="compact-copy">n/a</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 44;
      const y = 16 - ((point - min) / range) * 16;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg aria-hidden="true" className="sparkline" viewBox="0 0 44 16">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function watchlistPriceLabel(item: WatchlistSummaryView): string {
  if (item.freshness_state === "unusable" || item.last_price === 0) {
    return "No live price in current mode";
  }
  return `${item.last_price.toFixed(2)} / ${item.change_pct >= 0 ? "+" : ""}${item.change_pct.toFixed(2)}%`;
}

function watchlistTruthLine(item: WatchlistSummaryView): string {
  const reality = `Reality ${item.realism_grade}`;
  if (!item.instrument_mapping.broker_truth) {
    return `${reality} / ${item.market_data_mode} / proxy via ${item.instrument_mapping.broker_symbol}`;
  }
  return `${reality} / ${item.market_data_mode} / ${item.top_setup_tag.replace(/_/g, " ")}`;
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
  const gateLabel = gateStatusLabel(executionGate?.status);

  return (
    <aside className="left-rail">
      <section className="rail-panel nav-panel">
        <div className="rail-header">
          <div>
            <span className="eyebrow">Terminal</span>
            <strong>Commodity Operator Surface</strong>
          </div>
          <small className={`status-pill ${gateTone}`}>{gateLabel}</small>
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
            <span className="eyebrow">Primary Board</span>
            <strong>Oil / Gold / Silver First</strong>
          </div>
        </div>
        <small className="compact-copy">Click an asset to load its chart. USOUSD, XAUUSD, and XAGUSD are the lead operator board; BTC and ETH stay available as secondary context.</small>
        {watchlist.map((item) => (
          <button
            className={selectedSymbol === item.symbol ? "rail-item active" : "rail-item"}
            key={item.symbol}
            onClick={() => onSelectSymbol(item.symbol)}
            type="button"
          >
            <div className="stack compact-stack">
              <div className="rail-header">
                <div className="stack compact-stack">
                  <strong>{item.instrument_mapping.trader_symbol}</strong>
                  <small>{item.instrument_mapping.display_name}</small>
                </div>
                <div className="stack compact-stack">
                  <strong>{watchlistPriceLabel(item)}</strong>
                  <small>{item.freshness_minutes}m / {item.freshness_state}</small>
                </div>
              </div>
              <small title={item.instrument_mapping.mapping_notes}>{watchlistTruthLine(item)}</small>
            </div>
            <Sparkline points={item.sparkline} />
            <small>{item.source_label}</small>
          </button>
        ))}
      </section>

      <section className="rail-panel">
        <div className="rail-header">
          <div>
            <span className="eyebrow">Scout Queue</span>
            <strong>Commodity Breakout Scan</strong>
          </div>
        </div>
        <small className="compact-copy">This queue stays compact and commodities-led so the operator can jump from chart to signal context without scanning a generic dashboard list.</small>
        {scout.map((item) => (
          <button
            className={selectedSymbol === item.symbol ? "rail-item active" : "rail-item"}
            key={item.symbol}
            onClick={() => onSelectSymbol(item.symbol)}
            type="button"
          >
            <strong>{item.label}</strong>
            <span>{item.trend_state}</span>
            <small>{item.breakout_distance.toFixed(2)}%</small>
          </button>
        ))}
      </section>
    </aside>
  );
}
