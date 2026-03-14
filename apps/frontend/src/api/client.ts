import {
  mockActiveTrades,
  mockAssetContexts,
  mockBacktestDetail,
  mockBacktests,
  mockBars,
  mockHealth,
  mockHighRiskSignals,
  mockJournal,
  mockNews,
  mockResearch,
  mockRibbon,
  mockRisk,
  mockRiskExposure,
  mockSignals,
  mockStrategyDetail,
  mockStrategies,
  mockWalletBalances,
  mockWatchlist,
} from "./mockData";
import type {
  ActiveTradeView,
  AssetContextView,
  BacktestDetailView,
  BacktestListView,
  BacktestRunRequest,
  BarView,
  HealthView,
  JournalReviewView,
  NewsView,
  ResearchView,
  RibbonView,
  RiskExposureView,
  RiskView,
  SignalView,
  StrategyDetailView,
  StrategyListView,
  WalletBalanceView,
  WatchlistView,
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

async function requestJson<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    });
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export const apiClient = {
  health: () => requestJson<HealthView>("/health", mockHealth),
  overview: () => requestJson<RibbonView>("/dashboard/overview", mockRibbon),
  signals: () => requestJson<SignalView[]>("/signals", mockSignals),
  highRiskSignals: () => requestJson<SignalView[]>("/signals/high-risk", mockHighRiskSignals),
  news: () => requestJson<NewsView[]>("/news", mockNews),
  watchlist: () => requestJson<WatchlistView[]>("/watchlist", mockWatchlist),
  research: () => requestJson<ResearchView[]>("/research", mockResearch),
  risk: () => requestJson<RiskView[]>("/risk/latest", mockRisk),
  riskExposure: () => requestJson<RiskExposureView[]>("/risk/exposure", mockRiskExposure),
  bars: (symbol: string) => requestJson<BarView[]>(`/market/bars/${symbol}`, mockBars[symbol] ?? mockBars.BTC),
  assetContext: (symbol: string) =>
    requestJson<AssetContextView>(`/dashboard/assets/${symbol}`, mockAssetContexts[symbol] ?? mockAssetContexts.BTC),
  activeTrades: () => requestJson<ActiveTradeView[]>("/portfolio/active-trades", mockActiveTrades),
  walletBalance: () => requestJson<WalletBalanceView[]>("/portfolio/wallet-balance", mockWalletBalances),
  journal: () => requestJson<JournalReviewView[]>("/journal", mockJournal),
  strategies: () => requestJson<StrategyListView[]>("/strategies", mockStrategies),
  strategyDetail: (strategyName: string) =>
    requestJson<StrategyDetailView>(`/strategies/${strategyName}`, mockStrategyDetail),
  backtests: () => requestJson<BacktestListView[]>("/backtests", mockBacktests),
  backtestDetail: (runId: number) => requestJson<BacktestDetailView>(`/backtests/${runId}`, mockBacktestDetail),
  runBacktest: (payload: BacktestRunRequest) =>
    requestJson<BacktestDetailView>("/backtests/run", mockBacktestDetail, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
