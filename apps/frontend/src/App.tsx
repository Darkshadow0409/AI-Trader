import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "./api/hooks";
import { ContextSidebar } from "./components/ContextSidebar";
import { LeftRail } from "./components/LeftRail";
import { Panel } from "./components/Panel";
import { PriceChart } from "./components/PriceChart";
import { SignalDetailsCard } from "./components/SignalDetailsCard";
import { SignalTable } from "./components/SignalTable";
import { StateBlock } from "./components/StateBlock";
import { TopRibbon } from "./components/TopRibbon";
import { ActiveTradesTab } from "./tabs/ActiveTradesTab";
import { BacktestsTab } from "./tabs/BacktestsTab";
import { JournalTab } from "./tabs/JournalTab";
import { NewsTab } from "./tabs/NewsTab";
import { ResearchTab } from "./tabs/ResearchTab";
import { RiskExposureTab } from "./tabs/RiskExposureTab";
import { StrategyLabTab } from "./tabs/StrategyLabTab";
import { WalletBalanceTab } from "./tabs/WalletBalanceTab";
import { WatchlistTab } from "./tabs/WatchlistTab";

type TabKey =
  | "signals"
  | "high_risk"
  | "research"
  | "news"
  | "active_trades"
  | "wallet_balance"
  | "watchlist"
  | "strategy_lab"
  | "backtests"
  | "risk"
  | "journal";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "signals", label: "Signals" },
  { key: "high_risk", label: "High-Risk Signals" },
  { key: "research", label: "Research" },
  { key: "news", label: "News" },
  { key: "active_trades", label: "Active Trades" },
  { key: "wallet_balance", label: "Wallet Balance" },
  { key: "watchlist", label: "Watchlist / Opportunity Hunter" },
  { key: "strategy_lab", label: "Strategy Lab" },
  { key: "backtests", label: "Backtests" },
  { key: "risk", label: "Risk / Exposure" },
  { key: "journal", label: "Journal / Trade Review" },
];

function activeTabLabel(tab: TabKey): string {
  return tabs.find((item) => item.key === tab)?.label ?? "Workspace";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("signals");
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const resources = useDashboardData(selectedSymbol);

  useEffect(() => {
    const preferredSymbol = resources.watchlist.data[0]?.symbol ?? resources.signals.data[0]?.symbol;
    if (preferredSymbol) {
      setSelectedSymbol((current) => current || preferredSymbol);
    }
  }, [resources.signals.data, resources.watchlist.data]);

  const shellError = useMemo(
    () =>
      [
        resources.health.error,
        resources.overview.error,
        resources.watchlist.error,
        resources.assetContext.error,
        resources.bars.error,
      ]
        .filter(Boolean)
        .join(" | "),
    [resources.assetContext.error, resources.bars.error, resources.health.error, resources.overview.error, resources.watchlist.error],
  );

  function renderTabContent() {
    switch (activeTab) {
      case "signals":
        return <SignalTable onSelectSymbol={setSelectedSymbol} rows={resources.signals.data} selectedSymbol={selectedSymbol} />;
      case "high_risk":
        return <SignalTable onSelectSymbol={setSelectedSymbol} rows={resources.highRiskSignals.data} selectedSymbol={selectedSymbol} />;
      case "research":
        return <ResearchTab onSelectSymbol={setSelectedSymbol} rows={resources.research.data} selectedSymbol={selectedSymbol} />;
      case "news":
        return <NewsTab onSelectSymbol={setSelectedSymbol} rows={resources.news.data} />;
      case "active_trades":
        return <ActiveTradesTab onSelectSymbol={setSelectedSymbol} rows={resources.activeTrades.data} selectedSymbol={selectedSymbol} />;
      case "wallet_balance":
        return <WalletBalanceTab rows={resources.walletBalance.data} />;
      case "watchlist":
        return <WatchlistTab onSelectSymbol={setSelectedSymbol} rows={resources.watchlist.data} selectedSymbol={selectedSymbol} />;
      case "strategy_lab":
        return <StrategyLabTab />;
      case "backtests":
        return <BacktestsTab rows={resources.backtests.data} />;
      case "risk":
        return (
          <RiskExposureTab
            exposures={resources.riskExposure.data}
            onSelectSymbol={setSelectedSymbol}
            reports={resources.risk.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "journal":
        return <JournalTab rows={resources.journal.data} />;
      default:
        return null;
    }
  }

  return (
    <div className="terminal-shell">
      <TopRibbon health={resources.health.data} ribbon={resources.overview.data} />

      <div className="workspace">
        <LeftRail
          onSelectSymbol={setSelectedSymbol}
          research={resources.research.data}
          selectedSymbol={selectedSymbol}
          watchlist={resources.watchlist.data}
        />

        <main className="main-pane">
          <div className="tab-nav" aria-label="Dashboard tabs">
            {tabs.map((tab) => (
              <button
                className={activeTab === tab.key ? "tab-button active" : "tab-button"}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <StateBlock
            error={shellError || null}
            loading={
              resources.watchlist.loading ||
              resources.assetContext.loading ||
              resources.overview.loading ||
              resources.health.loading
            }
          />

          <div className="focus-layout">
            <Panel
              title={`${selectedSymbol} Chart`}
              eyebrow="Main Pane"
              extra={
                <div className="inline-tags">
                  <span className="tag">{resources.assetContext.data.research?.trend_state ?? "n/a"}</span>
                  <span className="tag">{resources.assetContext.data.research?.data_quality ?? resources.health.data.status}</span>
                </div>
              }
            >
              {resources.bars.data.length > 0 ? <PriceChart bars={resources.bars.data} /> : <StateBlock empty />}
            </Panel>
            <SignalDetailsCard context={resources.assetContext.data} />
          </div>

          <Panel title={activeTabLabel(activeTab)} eyebrow="Workspace">
            {renderTabContent()}
          </Panel>
        </main>

        <aside className="right-pane">
          <ContextSidebar context={resources.assetContext.data} onSelectSymbol={setSelectedSymbol} ribbon={resources.overview.data} />
        </aside>
      </div>
    </div>
  );
}
