import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "./api/hooks";
import { CommandCenter } from "./components/CommandCenter";
import { ContextSidebar } from "./components/ContextSidebar";
import { LeftRail, type NavItem } from "./components/LeftRail";
import { Panel } from "./components/Panel";
import { PriceChart } from "./components/PriceChart";
import { SignalDetailsCard } from "./components/SignalDetailsCard";
import { SignalTable } from "./components/SignalTable";
import { StateBlock } from "./components/StateBlock";
import { TopRibbon } from "./components/TopRibbon";
import { ActiveTradesTab } from "./tabs/ActiveTradesTab";
import { BacktestsTab } from "./tabs/BacktestsTab";
import { DeskTab } from "./tabs/DeskTab";
import { JournalTab } from "./tabs/JournalTab";
import { NewsTab } from "./tabs/NewsTab";
import { PilotDashboardTab } from "./tabs/PilotDashboardTab";
import { ResearchTab } from "./tabs/ResearchTab";
import { ReplayTab } from "./tabs/ReplayTab";
import { RiskExposureTab } from "./tabs/RiskExposureTab";
import { SessionDashboardTab } from "./tabs/SessionDashboardTab";
import { StrategyLabTab } from "./tabs/StrategyLabTab";
import { TradeTicketsTab } from "./tabs/TradeTicketsTab";
import { WalletBalanceTab } from "./tabs/WalletBalanceTab";
import { WatchlistTab } from "./tabs/WatchlistTab";

type TabKey =
  | "desk"
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
  | "trade_tickets"
  | "pilot_ops";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "desk", label: "Desk" },
  { key: "signals", label: "Signals" },
  { key: "high_risk", label: "High-Risk" },
  { key: "watchlist", label: "Hunter" },
  { key: "trade_tickets", label: "Tickets" },
  { key: "active_trades", label: "Trades" },
  { key: "journal", label: "Journal" },
  { key: "session", label: "Reviews" },
  { key: "strategy_lab", label: "Strategy" },
  { key: "backtests", label: "Backtests" },
  { key: "replay", label: "Replay" },
  { key: "pilot_ops", label: "Pilot Ops" },
  { key: "risk", label: "Risk" },
  { key: "research", label: "Research" },
  { key: "news", label: "News" },
  { key: "wallet_balance", label: "Wallet" },
];

function activeTabLabel(tab: TabKey): string {
  return tabs.find((item) => item.key === tab)?.label ?? "Workspace";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("desk");
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1d");
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [selectedRiskReportId, setSelectedRiskReportId] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const resources = useDashboardData(selectedSymbol, selectedTimeframe, selectedSignalId, selectedRiskReportId, selectedTradeId, selectedTicketId);
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "/") {
        event.preventDefault();
        setCommandCenterOpen((current) => !current);
        return;
      }
      if (event.altKey) {
        const index = Number(event.key) - 1;
        if (Number.isInteger(index) && tabs[index]) {
          event.preventDefault();
          setActiveTab(tabs[index].key);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function refreshDesk() {
    await Promise.all([
      resources.health.refresh(),
      resources.overview.refresh(),
      resources.controlCenter.refresh(),
      resources.opsSummary.refresh(),
      resources.deskSummary.refresh(),
      resources.homeSummary.refresh(),
      resources.sessionOverview.refresh(),
      resources.reviewTasks.refresh(),
      resources.dailyBriefing.refresh(),
      resources.weeklyReview.refresh(),
      resources.operationalBacklog.refresh(),
      resources.reviewSummary.refresh(),
      resources.pilotMetrics.refresh(),
      resources.pilotSummary.refresh(),
      resources.executionGate.refresh(),
      resources.pilotDashboard.refresh(),
      resources.adapterHealth.refresh(),
      resources.auditLogs.refresh(),
      resources.signals.refresh(),
      resources.signalsSummary.refresh(),
      resources.highRiskSignals.refresh(),
      resources.news.refresh(),
      resources.watchlist.refresh(),
      resources.opportunities.refresh(),
      resources.research.refresh(),
      resources.risk.refresh(),
      resources.riskExposure.refresh(),
      resources.proposedPaperTrades.refresh(),
      resources.activePaperTrades.refresh(),
      resources.closedPaperTrades.refresh(),
      resources.paperTradeAnalytics.refresh(),
      resources.paperTradeReviews.refresh(),
      resources.tradeTickets.refresh(),
      resources.tradeTicketSummary.refresh(),
      resources.shadowModeTickets.refresh(),
      resources.brokerSnapshot.refresh(),
      resources.alerts.refresh(),
      resources.assetContext.refresh(),
      resources.bars.refresh(),
      resources.marketChart.refresh(),
    ]);
    if (selectedSignalId) {
      await resources.signalDetail.refresh();
    }
    if (selectedRiskReportId) {
      await resources.riskDetail.refresh();
    }
    if (selectedTradeId) {
      await Promise.all([
        resources.paperTradeDetail.refresh(),
        resources.paperTradeTimeline.refresh(),
        resources.paperTradeScenarioStress.refresh(),
      ]);
    }
    if (selectedTicketId) {
      await resources.tradeTicketDetail.refresh();
    }
  }

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
        resources.marketChart.error,
      ]
        .filter(Boolean)
        .join(" | "),
    [resources.assetContext.error, resources.health.error, resources.marketChart.error, resources.overview.error, resources.watchlist.error],
  );

  const navItems: NavItem[] = useMemo(
    () =>
      tabs.map((tab, index) => ({
        key: tab.key,
        label: `${index < 9 ? `${index + 1}. ` : ""}${tab.label}`,
        badge:
          tab.key === "session"
            ? `${resources.operationalBacklog.data.overdue_count}/${resources.operationalBacklog.data.high_priority_count}`
            : tab.key === "pilot_ops"
              ? resources.executionGate.data.status
              : tab.key === "trade_tickets"
                ? String(resources.tradeTickets.data.length)
                : tab.key === "active_trades"
                  ? String(resources.activePaperTrades.data.length)
                  : undefined,
        tone:
          tab.key === activeTab
            ? "active"
            : tab.key === "pilot_ops" && resources.executionGate.data.status === "review_required"
              ? "warning"
              : tab.key === "session" && resources.operationalBacklog.data.overdue_count > 0
                ? "critical"
                : "default",
      })),
    [
      activeTab,
      resources.activePaperTrades.data.length,
      resources.executionGate.data.status,
      resources.operationalBacklog.data.high_priority_count,
      resources.operationalBacklog.data.overdue_count,
      resources.tradeTickets.data.length,
    ],
  );

  function renderTabContent() {
    switch (activeTab) {
      case "desk":
        return (
          <DeskTab
            desk={resources.deskSummary.data}
            homeSummary={resources.homeSummary.data}
            onOpenCommandCenter={() => setCommandCenterOpen(true)}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={setSelectedSymbol}
            onSelectTicket={focusTicket}
            onSelectTrade={focusTrade}
          />
        );
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
            onChanged={refreshDesk}
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
            onChanged={refreshDesk}
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
            onChanged={refreshDesk}
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
            onChanged={refreshDesk}
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
      case "pilot_ops":
        return (
          <PilotDashboardTab
            adapterHealth={resources.adapterHealth.data}
            auditLogs={resources.auditLogs.data}
            dashboard={resources.pilotDashboard.data}
            executionGate={resources.executionGate.data}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="terminal-shell operator-shell">
      <TopRibbon
        backlog={resources.operationalBacklog.data}
        executionGate={resources.executionGate.data}
        health={resources.health.data}
        ribbon={resources.overview.data}
      />

      <div className="workspace operator-workspace">
        <LeftRail
          activeTab={activeTab}
          backlog={resources.operationalBacklog.data}
          executionGate={resources.executionGate.data}
          navItems={navItems}
          onSelectSymbol={setSelectedSymbol}
          onSelectTab={(key) => setActiveTab(key as TabKey)}
          research={resources.research.data}
          selectedSymbol={selectedSymbol}
          watchlist={resources.watchlistSummary.data}
        />

        <main className="main-pane operator-main">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>{activeTabLabel(activeTab)}</h1>
            </div>
            <div className="workspace-actions">
              <span className="tag">asset {selectedSymbol}</span>
              <span className="tag">signal {selectedSignalId ?? "n/a"}</span>
              <button className="text-button" onClick={() => setCommandCenterOpen((current) => !current)} type="button">
                {commandCenterOpen ? "Hide Command Center" : "Open Command Center"} (/)
              </button>
            </div>
          </header>

          <StateBlock
            error={shellError || null}
            loading={
              resources.watchlist.loading ||
              resources.assetContext.loading ||
              resources.overview.loading ||
              resources.health.loading
            }
          />

          {commandCenterOpen ? <CommandCenter onRefreshAll={refreshDesk} status={resources.controlCenter.data} summary={resources.opsSummary.data} /> : null}

          <div className="focus-layout operator-focus">
            <Panel
              title={`${selectedSymbol} Focus`}
              eyebrow="Current Asset"
              extra={
                <div className="inline-tags">
                  <span className="tag">{resources.assetContext.data.research?.trend_state ?? "n/a"}</span>
                  <span className="tag">{resources.marketChart.data.freshness_state ?? resources.assetContext.data.data_reality?.freshness_state ?? "loading"}</span>
                  <span className="tag">{resources.assetContext.data.data_reality?.provenance.realism_grade ?? "n/a"}</span>
                </div>
              }
            >
              <PriceChart
                chart={resources.marketChart.data}
                error={resources.marketChart.error}
                loading={resources.marketChart.loading}
                onTimeframeChange={setSelectedTimeframe}
                selectedRisk={resources.riskDetail.data}
                selectedSignal={resources.signalDetail.data}
                selectedTicket={resources.tradeTicketDetail.data}
                selectedTrade={resources.paperTradeDetail.data}
                timeframe={selectedTimeframe}
              />
            </Panel>
            <SignalDetailsCard
              context={resources.assetContext.data}
              detail={resources.signalDetail.data}
              error={resources.signalDetail.error}
              loading={resources.signalDetail.loading}
            />
          </div>

          <Panel title={activeTabLabel(activeTab)} eyebrow="Operator Workspace">
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
