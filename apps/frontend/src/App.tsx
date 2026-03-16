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
import { ReplayTab } from "./tabs/ReplayTab";
import { RiskExposureTab } from "./tabs/RiskExposureTab";
import { SessionDashboardTab } from "./tabs/SessionDashboardTab";
import { StrategyLabTab } from "./tabs/StrategyLabTab";
import { TradeTicketsTab } from "./tabs/TradeTicketsTab";
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
  | "journal"
  | "session"
  | "replay"
  | "trade_tickets";

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
  { key: "session", label: "Session / Review Queue" },
  { key: "replay", label: "Replay / Stress" },
  { key: "trade_tickets", label: "Trade Tickets / Shadow" },
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
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const resources = useDashboardData(selectedSymbol, selectedSignalId, selectedRiskReportId, selectedTradeId, selectedTicketId);
  const paperTradeRows = useMemo(
    () => [...resources.proposedPaperTrades.data, ...resources.activePaperTrades.data, ...resources.closedPaperTrades.data],
    [resources.activePaperTrades.data, resources.closedPaperTrades.data, resources.proposedPaperTrades.data],
  );

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
    const nextTradeId = paperTradeRows.find((row) => row.trade_id === selectedTradeId && row.symbol === selectedSymbol)?.trade_id
      ?? paperTradeRows.find((row) => row.symbol === selectedSymbol)?.trade_id
      ?? paperTradeRows[0]?.trade_id
      ?? null;
    setSelectedTradeId(nextTradeId);
  }, [paperTradeRows, selectedSymbol, selectedTradeId]);

  useEffect(() => {
    const ticketRows = resources.tradeTickets.data;
    const nextTicketId = ticketRows.find((row) => row.ticket_id === selectedTicketId && row.symbol === selectedSymbol)?.ticket_id
      ?? ticketRows.find((row) => row.symbol === selectedSymbol)?.ticket_id
      ?? ticketRows[0]?.ticket_id
      ?? null;
    setSelectedTicketId(nextTicketId);
  }, [resources.tradeTickets.data, selectedSymbol, selectedTicketId]);

  function focusSymbol(symbol: string, signalId?: string | null, riskReportId?: string | null) {
    setSelectedSymbol(symbol);
    if (signalId !== undefined) {
      setSelectedSignalId(signalId);
    }
    if (riskReportId !== undefined) {
      setSelectedRiskReportId(riskReportId);
    }
  }

  function focusTrade(tradeId: string | null) {
    setSelectedTradeId(tradeId);
    const trade = paperTradeRows.find((row) => row.trade_id === tradeId);
    if (!trade) {
      return;
    }
    setSelectedSymbol(trade.symbol);
    if (trade.signal_id) {
      setSelectedSignalId(trade.signal_id);
    }
    if (trade.risk_report_id) {
      setSelectedRiskReportId(trade.risk_report_id);
    }
  }

  function focusTicket(ticketId: string | null) {
    setSelectedTicketId(ticketId);
    const ticket = resources.tradeTickets.data.find((row) => row.ticket_id === ticketId);
    if (!ticket) {
      return;
    }
    setSelectedSymbol(ticket.symbol);
    if (ticket.signal_id) {
      setSelectedSignalId(ticket.signal_id);
    }
    if (ticket.risk_report_id) {
      setSelectedRiskReportId(ticket.risk_report_id);
    }
    if (ticket.trade_id) {
      setSelectedTradeId(ticket.trade_id);
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
            activeRows={resources.activePaperTrades.data}
            closedRows={resources.closedPaperTrades.data}
            detail={resources.paperTradeDetail.data}
            onChanged={async () => {
              await Promise.all([
                resources.proposedPaperTrades.refresh(),
                resources.activePaperTrades.refresh(),
                resources.closedPaperTrades.refresh(),
                resources.paperTradeAnalytics.refresh(),
                resources.paperTradeReviews.refresh(),
                resources.alerts.refresh(),
                resources.replay.refresh(),
                resources.scenarioStress.refresh(),
              ]);
              if (selectedTradeId) {
                await Promise.all([resources.paperTradeDetail.refresh(), resources.paperTradeTimeline.refresh(), resources.paperTradeScenarioStress.refresh()]);
              }
            }}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectTrade={focusTrade}
            onSelectSymbol={setSelectedSymbol}
            proposedRows={resources.proposedPaperTrades.data}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSignalReality={resources.signalDetail.data?.data_reality ?? resources.assetContext.data.latest_signal?.data_reality ?? null}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
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
            analytics={resources.paperTradeAnalytics.data}
            detail={resources.paperTradeDetail.data}
            onChanged={async () => {
              await Promise.all([
                resources.paperTradeReviews.refresh(),
                resources.paperTradeAnalytics.refresh(),
                resources.closedPaperTrades.refresh(),
                resources.alerts.refresh(),
                resources.scenarioStress.refresh(),
              ]);
              if (selectedTradeId) {
                await Promise.all([resources.paperTradeDetail.refresh(), resources.paperTradeTimeline.refresh(), resources.paperTradeScenarioStress.refresh()]);
              }
            }}
            onSelectTrade={focusTrade}
            reviews={resources.paperTradeReviews.data}
            rows={resources.journal.data}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            selectedTradeId={selectedTradeId}
            trades={paperTradeRows}
          />
        );
      case "session":
        return (
          <SessionDashboardTab
            backlog={resources.operationalBacklog.data}
            dailyBriefing={resources.dailyBriefing.data}
            onChanged={async () => {
              await Promise.all([
                resources.sessionOverview.refresh(),
                resources.reviewTasks.refresh(),
                resources.dailyBriefing.refresh(),
                resources.weeklyReview.refresh(),
                resources.operationalBacklog.refresh(),
                resources.alerts.refresh(),
              ]);
            }}
            overview={resources.sessionOverview.data}
            reviewTasks={resources.reviewTasks.data}
            weeklyReview={resources.weeklyReview.data}
          />
        );
      case "replay":
        return (
          <ReplayTab
            replay={resources.replay.data}
            scenarioStress={resources.scenarioStress.data}
            timeline={resources.paperTradeTimeline.data}
          />
        );
      case "trade_tickets":
        return (
          <TradeTicketsTab
            brokerSnapshot={resources.brokerSnapshot.data}
            detail={resources.tradeTicketDetail.data}
            onChanged={async () => {
              await Promise.all([
                resources.tradeTickets.refresh(),
                resources.tradeTicketDetail.refresh(),
                resources.shadowModeTickets.refresh(),
                resources.brokerSnapshot.refresh(),
                resources.alerts.refresh(),
              ]);
            }}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectTicket={focusTicket}
            onSelectTrade={focusTrade}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalId={selectedSignalId}
            selectedSymbol={selectedSymbol}
            selectedTicketId={selectedTicketId}
            shadowRows={resources.shadowModeTickets.data}
            tickets={resources.tradeTickets.data}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="terminal-shell">
      <TopRibbon
        backlog={resources.operationalBacklog.data}
        health={resources.health.data}
        ribbon={resources.overview.data}
      />

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
                {tab.key === "session"
                  ? `${tab.label} (${resources.operationalBacklog.data.overdue_count}/${resources.operationalBacklog.data.high_priority_count})`
                  : tab.label}
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
