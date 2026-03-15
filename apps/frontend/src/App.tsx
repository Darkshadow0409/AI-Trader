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
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [selectedRiskReportId, setSelectedRiskReportId] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const resources = useDashboardData(selectedSymbol, selectedSignalId, selectedRiskReportId);

  useEffect(() => {
    const preferredSymbol = resources.watchlist.data[0]?.symbol ?? resources.signals.data[0]?.symbol;
    if (preferredSymbol) {
      setSelectedSymbol((current) => current || preferredSymbol);
    }
  }, [resources.signals.data, resources.watchlist.data]);

  useEffect(() => {
    const signalId = resources.assetContext.data.latest_signal?.signal_id ?? resources.signals.data.find((row) => row.symbol === selectedSymbol)?.signal_id ?? null;
    const riskReportId = resources.assetContext.data.latest_risk?.risk_report_id ?? resources.risk.data.find((row) => row.symbol === selectedSymbol)?.risk_report_id ?? null;
    setSelectedSignalId((current) => {
      const isCurrentForSymbol = resources.signals.data.some((row) => row.signal_id === current && row.symbol === selectedSymbol);
      return isCurrentForSymbol ? current : signalId;
    });
    setSelectedRiskReportId((current) => {
      const isCurrentForSymbol = resources.risk.data.some((row) => row.risk_report_id === current && row.symbol === selectedSymbol);
      return isCurrentForSymbol ? current : riskReportId;
    });
  }, [resources.assetContext.data.latest_risk, resources.assetContext.data.latest_signal, resources.risk.data, resources.signals.data, selectedSymbol]);

  useEffect(() => {
    const tradeId = resources.activeTrades.data.find((row) => row.symbol === selectedSymbol)?.trade_id ?? null;
    setSelectedTradeId(tradeId);
  }, [resources.activeTrades.data, selectedSymbol]);

  function focusSymbol(symbol: string, signalId?: string | null, riskReportId?: string | null) {
    setSelectedSymbol(symbol);
    if (signalId !== undefined) {
      setSelectedSignalId(signalId);
    }
    if (riskReportId !== undefined) {
      setSelectedRiskReportId(riskReportId);
    }
  }

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
        return (
          <SignalTable
            onSelectSignal={setSelectedSignalId}
            onSelectSymbol={setSelectedSymbol}
            rows={resources.signals.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "high_risk":
        return (
          <SignalTable
            onSelectSignal={setSelectedSignalId}
            onSelectSymbol={setSelectedSymbol}
            rows={resources.highRiskSignals.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "research":
        return <ResearchTab onSelectSymbol={setSelectedSymbol} rows={resources.research.data} selectedSymbol={selectedSymbol} />;
      case "news":
        return <NewsTab onSelectSymbol={setSelectedSymbol} rows={resources.news.data} />;
      case "active_trades":
        return (
          <ActiveTradesTab
            onChanged={resources.activeTrades.refresh}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={setSelectedSymbol}
            rows={resources.activeTrades.data}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
          />
        );
      case "wallet_balance":
        return <WalletBalanceTab rows={resources.walletBalance.data} />;
      case "watchlist":
        return (
          <WatchlistTab
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={setSelectedSymbol}
            opportunities={resources.opportunities.data}
            rows={resources.watchlist.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "strategy_lab":
        return <StrategyLabTab />;
      case "backtests":
        return <BacktestsTab rows={resources.backtests.data} />;
      case "risk":
        return (
          <RiskExposureTab
            exposures={resources.riskExposure.data}
            onOpenRisk={setSelectedRiskReportId}
            onSelectSymbol={setSelectedSymbol}
            reports={resources.risk.data}
            selectedSymbol={selectedSymbol}
          />
        );
      case "journal":
        return (
          <JournalTab
            onChanged={resources.journal.refresh}
            rows={resources.journal.data}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
          />
        );
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
            <SignalDetailsCard
              context={resources.assetContext.data}
              detail={resources.signalDetail.data}
              error={resources.signalDetail.error}
              loading={resources.signalDetail.loading}
            />
          </div>

          <Panel title={activeTabLabel(activeTab)} eyebrow="Workspace">
            {renderTabContent()}
          </Panel>
        </main>

        <aside className="right-pane">
          <ContextSidebar
            alerts={resources.alerts.data}
            context={resources.assetContext.data}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={(symbol) => focusSymbol(symbol)}
            ribbon={resources.overview.data}
            riskDetail={resources.riskDetail.data}
            riskError={resources.riskDetail.error}
            riskLoading={resources.riskDetail.loading}
          />
        </aside>
      </div>
    </div>
  );
}
