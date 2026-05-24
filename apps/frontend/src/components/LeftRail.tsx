import type { ExecutionGateView, OperationalBacklogView, ResearchView, SelectedAssetTruthView, WatchlistSummaryView } from "../types/api";
import { selectedAssetTruthFallbackLabel, selectedAssetTruthSourceFamilyLabel } from "../lib/selectedAssetTruth";
import { terminalFocusPriority } from "../lib/terminalFocus";
import { gateStatusLabel } from "../lib/uiLabels";

export interface NavItem {
  key: string;
  label: string;
  badge?: string;
  tone?: "default" | "warning" | "critical" | "active";
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

interface HotkeyHint {
  key: string;
  label: string;
  shortcut: string;
}

interface LeftRailProps {
  activeTab: string;
  backlog: OperationalBacklogView;
  executionGate: ExecutionGateView | null;
  hotkeyHints?: HotkeyHint[];
  navGroups: NavGroup[];
  onSelectSymbol: (symbol: string) => void;
  onSelectTab: (key: string) => void;
  research: ResearchView[];
  selectedAssetTruth?: SelectedAssetTruthView | null;
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
    return "No live price";
  }
  return `${item.last_price.toFixed(2)} / ${item.change_pct >= 0 ? "+" : ""}${item.change_pct.toFixed(2)}%`;
}

function watchlistTruthLine(item: WatchlistSummaryView): string {
  const reality = `Reality ${item.realism_grade}`;
  if (!item.instrument_mapping.broker_truth) {
    return `${reality} / ${item.freshness_minutes}m ${item.freshness_state} / proxy via ${item.instrument_mapping.broker_symbol}`;
  }
  return `${reality} / ${item.freshness_minutes}m ${item.freshness_state} / ${item.top_setup_tag.replace(/_/g, " ")}`;
}

function postureLabel(item: WatchlistSummaryView): string {
  return item.top_setup_tag.replace(/_/g, " ");
}

export function LeftRail({
  activeTab,
  backlog,
  executionGate,
  hotkeyHints = [],
  navGroups,
  onSelectSymbol,
  onSelectTab,
  research,
  selectedAssetTruth = null,
  selectedSymbol,
  watchlist,
}: LeftRailProps) {
  const scout = scoutAssets(research);
  const gateTone = executionGate?.status === "execution_candidate" ? "active" : executionGate?.status === "review_required" ? "warning" : "default";
  const gateLabel = gateStatusLabel(executionGate?.status);

  return (
    <aside className="left-rail showcase-left-rail shell-scroll-region" data-testid="left-rail">
      <section className="rail-panel nav-panel left-rail-shell-panel rail-panel-primary shell-scroll-region">
        <div className="rail-header">
          <div>
            <span className="eyebrow">Workspace Status</span>
            <strong className="left-rail-shell-name">Trader Workspace</strong>
          </div>
          <small className={`status-pill ${gateTone}`}>{gateLabel}</small>
        </div>
        <small className="compact-copy rail-intro-copy">Core routes stay grouped by the operator’s next decision, while market rotation stays secondary.</small>
        {navGroups.map((group) => (
          <div className="nav-group" key={group.title}>
            <small className="eyebrow">{group.title}</small>
            <div className="nav-list">
              {group.items.map((item) => (
                <button
                  className={activeTab === item.key ? "nav-item active" : `nav-item ${item.tone ?? "default"}`}
                  key={item.key}
                  onClick={() => onSelectTab(item.key)}
                  type="button"
                >
                  <span className="nav-item-label">{item.label}</span>
                  {item.badge ? <small className="nav-item-badge">{item.badge}</small> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        {hotkeyHints.length > 0 ? (
          <div className="rail-hotkey-strip" data-testid="rail-hotkeys">
            <small className="eyebrow">Quick Keys</small>
            <div className="rail-hotkey-list">
              {hotkeyHints.map((item) => (
                <span className="rail-hotkey-chip" key={item.key}>
                  <strong>{item.shortcut}</strong>
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rail-meta">
          <small>{backlog.overdue_count} overdue</small>
          <small>{backlog.high_priority_count} high priority</small>
          <small>{watchlist.length} tracked</small>
        </div>
      </section>

      <section className="rail-panel left-rail-market-panel rail-panel-support">
        <div className="rail-header">
          <div>
            <span className="eyebrow">Market Watch</span>
            <strong>Lead Markets</strong>
          </div>
        </div>
        <small className="compact-copy rail-intro-copy">USOUSD leads the oil view. Gold and silver stay nearby, with posture first and quote second.</small>
        {watchlist.map((item) => (
          <button
            className={selectedSymbol === item.symbol ? "rail-item active" : "rail-item"}
            key={item.symbol}
            onClick={() => onSelectSymbol(item.symbol)}
            type="button"
          >
            <div className="stack compact-stack rail-item-main">
              <div className="rail-header rail-item-head">
                <div className="stack compact-stack">
                  <strong>{item.instrument_mapping.trader_symbol}</strong>
                  <small>{item.instrument_mapping.display_name}</small>
                </div>
                <span className="tag subtle-tag rail-posture-tag">{postureLabel(item)}</span>
              </div>
              <small title={item.instrument_mapping.mapping_notes}>{watchlistTruthLine(item)}</small>
              <div className="metric-row compact-row rail-item-context">
                <span>{watchlistPriceLabel(item)}</span>
                <span>
                  {selectedSymbol === item.symbol && selectedAssetTruth
                    ? `${selectedAssetTruthSourceFamilyLabel(selectedAssetTruth)} / ${selectedAssetTruthFallbackLabel(selectedAssetTruth)}`
                    : item.source_label}
                </span>
              </div>
            </div>
            <Sparkline points={item.sparkline} />
          </button>
        ))}
      </section>

      <section className="rail-panel left-rail-scout-panel rail-panel-support">
        <div className="rail-header">
          <div>
            <span className="eyebrow">Next Markets</span>
            <strong>Rotation Queue</strong>
          </div>
        </div>
        <small className="compact-copy rail-intro-copy">Compact rotation context for the next market to review when the lead board goes quiet.</small>
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
