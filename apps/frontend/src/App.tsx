import { useEffect, useMemo, useState } from "react";
import { apiClient } from "./api/client";
import { useDashboardData } from "./api/hooks";
import { CommandCenter } from "./components/CommandCenter";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
import { PolymarketHunterTab } from "./tabs/PolymarketHunterTab";
import { ResearchTab } from "./tabs/ResearchTab";
import { ReplayTab } from "./tabs/ReplayTab";
import { RiskExposureTab } from "./tabs/RiskExposureTab";
import { SessionDashboardTab } from "./tabs/SessionDashboardTab";
import { StrategyLabTab } from "./tabs/StrategyLabTab";
import { TradeTicketsTab } from "./tabs/TradeTicketsTab";
import { WalletBalanceTab } from "./tabs/WalletBalanceTab";
import { WatchlistTab } from "./tabs/WatchlistTab";
import type { WatchlistSummaryView } from "./types/api";

type TabKey =
  | "desk"
  | "signals"
  | "high_risk"
  | "research"
  | "news"
  | "polymarket"
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
  { key: "high_risk", label: "High Risk" },
  { key: "watchlist", label: "Watchlist" },
  { key: "trade_tickets", label: "Tickets" },
  { key: "active_trades", label: "Trades" },
  { key: "journal", label: "Journal" },
  { key: "session", label: "Review Queue" },
  { key: "strategy_lab", label: "Strategy" },
  { key: "backtests", label: "Backtests" },
  { key: "replay", label: "Replay" },
  { key: "pilot_ops", label: "Pilot Ops" },
  { key: "risk", label: "Risk" },
  { key: "research", label: "Research" },
  { key: "news", label: "News" },
  { key: "polymarket", label: "Polymarket" },
  { key: "wallet_balance", label: "Wallet" },
];

const focusSurfaceTabs: TabKey[] = ["desk", "signals", "high_risk", "watchlist", "risk", "trade_tickets", "active_trades"];

function activeTabLabel(tab: TabKey): string {
  return tabs.find((item) => item.key === tab)?.label ?? "Workspace";
}

function freshnessRank(state: string): number {
  switch (state) {
    case "fresh":
      return 4;
    case "aging":
      return 3;
    case "stale":
      return 2;
    case "degraded":
      return 1;
    default:
      return 0;
  }
}

function realismRank(grade: string): number {
  switch (grade) {
    case "A":
      return 5;
    case "B":
      return 4;
    case "C":
      return 3;
    case "D":
      return 2;
    case "E":
      return 1;
    default:
      return 0;
  }
}

function marketModeRank(mode: string): number {
  switch (mode) {
    case "broker_live":
      return 3;
    case "public_live":
      return 2;
    case "fixture":
      return 1;
    default:
      return 0;
  }
}

function compactId(value: string | null): string {
  if (!value) {
    return "n/a";
  }
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-4)}` : value;
}

function preferredWatchlistSymbol(rows: WatchlistSummaryView[]): string | null {
  if (rows.length === 0) {
    return null;
  }
  return [...rows]
    .sort((left, right) => {
      const rightScore =
        marketModeRank(right.market_data_mode) * 1000
        + freshnessRank(right.freshness_state) * 100
        + realismRank(right.realism_grade) * 10
        - right.freshness_minutes / 1000;
      const leftScore =
        marketModeRank(left.market_data_mode) * 1000
        + freshnessRank(left.freshness_state) * 100
        + realismRank(left.realism_grade) * 10
        - left.freshness_minutes / 1000;
      return rightScore - leftScore;
    })[0]?.symbol ?? null;
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
  const [hasAutoSelectedSymbol, setHasAutoSelectedSymbol] = useState(false);
  const resources = useDashboardData(activeTab, commandCenterOpen, selectedSymbol, selectedTimeframe, selectedSignalId, selectedRiskReportId, selectedTradeId, selectedTicketId);
  const paperTradeRows = useMemo(
    () => [...resources.proposedPaperTrades.data, ...resources.activePaperTrades.data, ...resources.closedPaperTrades.data],
    [resources.activePaperTrades.data, resources.closedPaperTrades.data, resources.proposedPaperTrades.data],
  );
  const paperCapitalSummary = useMemo(() => {
    const activeRows = resources.activePaperTrades.data.filter((row) => row.paper_account);
    const accountSize = activeRows[0]?.paper_account?.account_size ?? 10000;
    const equity = activeRows.reduce(
      (highest, row) => Math.max(highest, row.paper_account?.current_equity ?? accountSize),
      accountSize,
    );
    return {
      accountSize,
      equity,
      allocated: activeRows.reduce((sum, row) => sum + (row.paper_account?.allocated_capital ?? 0), 0),
      openRisk: activeRows.reduce((sum, row) => sum + (row.paper_account?.open_risk_amount ?? 0), 0),
      targetPnl: activeRows.reduce((sum, row) => sum + (row.paper_account?.projected_base_pnl ?? 0), 0),
      stretchPnl: activeRows.reduce((sum, row) => sum + (row.paper_account?.projected_stretch_pnl ?? 0), 0),
      stopLoss: activeRows.reduce((sum, row) => sum + (row.paper_account?.projected_stop_loss ?? 0), 0),
      riskPct: activeRows.reduce((sum, row) => sum + (row.paper_account?.risk_pct_of_account ?? 0), 0),
      openExposureCount: activeRows.length,
      overAllocated: activeRows.reduce((sum, row) => sum + (row.paper_account?.allocated_capital ?? 0), 0) > accountSize,
    };
  }, [resources.activePaperTrades.data]);
  const resolvedExecutionGate = useMemo(() => {
    const directGate = resources.executionGate.data;
    const deskGate = resources.deskSummary.data.execution_gate;
    const pilotGate = {
      status: resources.pilotSummary.data.gate_state,
      blockers: resources.pilotSummary.data.blockers,
      thresholds: directGate.thresholds,
      metrics: directGate.metrics,
      rationale: directGate.rationale,
    };
    if (!(directGate.status === "not_ready" && directGate.blockers.length === 0)) {
      return directGate;
    }
    if (deskGate.blockers.length > 0 || deskGate.status !== "not_ready") {
      return deskGate;
    }
    if (pilotGate.blockers.length > 0 || pilotGate.status !== "not_ready") {
      return pilotGate;
    }
    return directGate;
  }, [resources.deskSummary.data.execution_gate, resources.executionGate.data, resources.pilotSummary.data.blockers, resources.pilotSummary.data.gate_state]);
  const resolvedOperationalBacklog = useMemo(() => {
    const directBacklog = resources.operationalBacklog.data;
    const deskBacklog = resources.deskSummary.data.operational_backlog;
    const sessionBacklog = resources.sessionOverview.data.operational_backlog;
    if (directBacklog.overdue_count > 0 || directBacklog.high_priority_count > 0 || directBacklog.items.length > 0) {
      return directBacklog;
    }
    if (deskBacklog.overdue_count > 0 || deskBacklog.high_priority_count > 0 || deskBacklog.items.length > 0) {
      return deskBacklog;
    }
    if (sessionBacklog.overdue_count > 0 || sessionBacklog.high_priority_count > 0 || sessionBacklog.items.length > 0) {
      return sessionBacklog;
    }
    return directBacklog;
  }, [resources.deskSummary.data.operational_backlog, resources.operationalBacklog.data, resources.sessionOverview.data.operational_backlog]);
  const showFocusSurface = focusSurfaceTabs.includes(activeTab);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await apiClient.refreshSystem();
        if (cancelled) {
          return;
        }
        await Promise.all([
          resources.overview.refresh(),
          resources.watchlist.refresh(),
          resources.watchlistSummary.refresh(),
          resources.signals.refresh(),
          resources.signalsSummary.refresh(),
          resources.news.refresh(),
          resources.assetContext.refresh(),
          resources.marketChart.refresh(),
        ]);
      } catch {
        // Preserve local-first startup; the UI surfaces degraded states explicitly.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasAutoSelectedSymbol) {
      return;
    }
    const preferredSymbol =
      preferredWatchlistSymbol(resources.watchlistSummary.data)
      ?? resources.watchlist.data[0]?.symbol
      ?? resources.signalsSummary.data.top_ranked_signals[0]?.symbol
      ?? resources.signals.data[0]?.symbol;
    if (preferredSymbol) {
      setSelectedSymbol(preferredSymbol);
      setHasAutoSelectedSymbol(true);
    }
  }, [hasAutoSelectedSymbol, resources.signals.data, resources.signalsSummary.data.top_ranked_signals, resources.watchlist.data, resources.watchlistSummary.data]);

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
      resources.polymarketHunter.refresh(),
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

  async function refreshFocusSurface() {
    await Promise.all([
      resources.assetContext.refresh(),
      resources.marketChart.refresh(),
      resources.watchlistSummary.refresh(),
      resources.signals.refresh(),
      resources.news.refresh(),
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
        showFocusSurface ? resources.assetContext.error : null,
        showFocusSurface ? resources.marketChart.error : null,
      ]
        .filter(Boolean)
        .join(" | "),
    [resources.assetContext.error, resources.health.error, resources.marketChart.error, resources.overview.error, resources.watchlist.error, showFocusSurface],
  );

  const navItems: NavItem[] = useMemo(
    () =>
      tabs.map((tab, index) => ({
        key: tab.key,
        label: `${index < 9 ? `${index + 1}. ` : ""}${tab.label}`,
        badge:
          tab.key === "session"
            ? `${resolvedOperationalBacklog.overdue_count}/${resolvedOperationalBacklog.high_priority_count}`
            : tab.key === "pilot_ops"
              ? resolvedExecutionGate.status
              : tab.key === "trade_tickets"
                ? String(resources.tradeTickets.data.length)
                : tab.key === "active_trades"
                  ? String(resources.activePaperTrades.data.length)
                  : undefined,
        tone:
          tab.key === activeTab
            ? "active"
            : tab.key === "pilot_ops" && resolvedExecutionGate.status === "review_required"
              ? "warning"
              : tab.key === "session" && resolvedOperationalBacklog.overdue_count > 0
                ? "critical"
                : "default",
      })),
    [
      activeTab,
      resources.activePaperTrades.data.length,
      resolvedExecutionGate.status,
      resolvedOperationalBacklog.high_priority_count,
      resolvedOperationalBacklog.overdue_count,
      resources.tradeTickets.data.length,
    ],
  );

  function renderTabContent() {
    switch (activeTab) {
      case "desk":
        return (
          <DeskTab
            desk={resources.deskSummary.data}
            executionGate={resolvedExecutionGate}
            homeSummary={resources.homeSummary.data}
            onNavigate={(tab) => setActiveTab(tab as TabKey)}
            onOpenCommandCenter={() => setCommandCenterOpen(true)}
            onOpenRisk={setSelectedRiskReportId}
            onOpenSignal={setSelectedSignalId}
            onSelectSymbol={setSelectedSymbol}
            onSelectTicket={focusTicket}
            onSelectTrade={focusTrade}
            operationalBacklog={resolvedOperationalBacklog}
            paperCapitalSummary={paperCapitalSummary}
          />
        );
      case "signals":
        return (
          <SignalTable
            onSelectSignal={setSelectedSignalId}
            onSelectSymbol={setSelectedSymbol}
            rows={resources.signals.data.length > 0 ? resources.signals.data : resources.signalsSummary.data.top_ranked_signals}
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
      case "polymarket":
        return <PolymarketHunterTab hunter={resources.polymarketHunter.data} onSelectSymbol={setSelectedSymbol} />;
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
            backlog={resolvedOperationalBacklog}
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
            selectedRiskLabel={resources.riskDetail.data?.symbol ? `${resources.riskDetail.data.symbol} stop ${resources.riskDetail.data.stop_price.toFixed(2)}` : null}
            onSelectTicket={focusTicket}
            onSelectTrade={focusTrade}
            selectedRiskReportId={selectedRiskReportId}
            selectedSignalLabel={resources.signalDetail.data ? `${resources.signalDetail.data.symbol} ${resources.signalDetail.data.signal_type}` : null}
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
            executionGate={resolvedExecutionGate}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="terminal-shell operator-shell">
      <TopRibbon
        backlog={resolvedOperationalBacklog}
        executionGate={resolvedExecutionGate}
        health={resources.health.data}
        ribbon={resources.overview.data}
      />

      <div className="workspace operator-workspace">
        <LeftRail
          activeTab={activeTab}
          backlog={resolvedOperationalBacklog}
          executionGate={resolvedExecutionGate}
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
              <div className="workspace-badges">
                <span className="tag">asset {selectedSymbol}</span>
                <span className="tag" title={selectedSignalId ?? "n/a"}>
                  signal {compactId(selectedSignalId)}
                </span>
              </div>
              <div className="workspace-cta-group">
                <button className="action-button" onClick={() => void refreshFocusSurface()} type="button">
                  Refresh Data
                </button>
                <button className="text-button" onClick={() => setCommandCenterOpen((current) => !current)} type="button">
                  {commandCenterOpen ? "Hide Command Center" : "Open Command Center"} (/)
                </button>
              </div>
            </div>
          </header>

          <StateBlock
            error={shellError || null}
            loading={
              resources.watchlist.loading ||
              (showFocusSurface && resources.assetContext.loading) ||
              resources.overview.loading ||
              resources.health.loading
            }
          />

          {commandCenterOpen ? (
            <ErrorBoundary label="Command Center" resetKey={`${resources.controlCenter.data.generated_at}-${resources.opsSummary.data.generated_at}`}>
              <CommandCenter onRefreshAll={refreshDesk} status={resources.controlCenter.data} summary={resources.opsSummary.data} />
            </ErrorBoundary>
          ) : null}

          {showFocusSurface ? (
            <div className="focus-layout operator-focus" key={`focus-${activeTab}-${selectedSymbol}-${selectedSignalId ?? "none"}`}>
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
                <ErrorBoundary label="Chart Surface" resetKey={`${activeTab}-${selectedSymbol}-${selectedTimeframe}-${resources.marketChart.data.status}`}>
                  <PriceChart
                    chart={resources.marketChart.data}
                    error={resources.marketChart.error}
                    loading={resources.marketChart.loading}
                    onRefresh={() => void refreshFocusSurface()}
                    onRetry={() => void refreshFocusSurface()}
                    onTimeframeChange={setSelectedTimeframe}
                    selectedRisk={resources.riskDetail.data}
                    selectedSignal={resources.signalDetail.data}
                    selectedTicket={resources.tradeTicketDetail.data}
                    selectedTrade={resources.paperTradeDetail.data}
                    timeframe={selectedTimeframe}
                  />
                </ErrorBoundary>
              </Panel>
              <ErrorBoundary label="Signal Detail" resetKey={`${activeTab}-${selectedSymbol}-${selectedSignalId ?? "none"}`}>
                <SignalDetailsCard
                  context={resources.assetContext.data}
                  detail={resources.signalDetail.data}
                  error={resources.signalDetail.error}
                  loading={resources.signalDetail.loading}
                  onRetry={() => void refreshFocusSurface()}
                />
              </ErrorBoundary>
            </div>
          ) : null}

          <Panel key={activeTab} title={activeTabLabel(activeTab)} eyebrow="Operator Workspace">
            <ErrorBoundary label={`${activeTabLabel(activeTab)} Workspace`} resetKey={`${activeTab}-${selectedSymbol}-${selectedTradeId ?? "none"}-${selectedTicketId ?? "none"}`}>
              {renderTabContent()}
            </ErrorBoundary>
          </Panel>
        </main>

        <aside className="right-pane">
          <ErrorBoundary label="Context Sidebar" resetKey={`${selectedSymbol}-${selectedRiskReportId ?? "none"}`}>
            <ContextSidebar
              alerts={resources.alerts.data}
              context={resources.assetContext.data}
              onOpenRisk={setSelectedRiskReportId}
              onOpenSignal={setSelectedSignalId}
              onRefreshContext={() => void refreshFocusSurface()}
              onSelectSymbol={(symbol) => focusSymbol(symbol)}
              ribbon={resources.overview.data}
              riskDetail={resources.riskDetail.data}
              riskError={resources.riskDetail.error}
              riskLoading={resources.riskDetail.loading}
            />
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
}
