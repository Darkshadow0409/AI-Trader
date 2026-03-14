import { useEffect, useState } from "react";
import { apiClient } from "./client";
import type {
  ActiveTradeView,
  AssetContextView,
  BacktestListView,
  BarView,
  HealthView,
  JournalReviewView,
  NewsView,
  ResearchView,
  RibbonView,
  RiskExposureView,
  RiskView,
  SignalView,
  WalletBalanceView,
  WatchlistView,
} from "../types/api";

export interface ResourceState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function usePollingResource<T>(loader: () => Promise<T>, initialData: T, deps: unknown[] = [], intervalMs = 30000): ResourceState<T> {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runLoad() {
      try {
        const nextData = await loader();
        if (!cancelled) {
          setData(nextData);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Request failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void runLoad();
    const timer = window.setInterval(() => {
      void runLoad();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    loading,
    error,
    refresh: async () => {
      const nextData = await loader();
      setData(nextData);
      setError(null);
    },
  };
}

export function useDashboardData(selectedSymbol: string) {
  const health = usePollingResource<HealthView>(() => apiClient.health(), {
    status: "loading",
    sqlite_path: "",
    duckdb_path: "",
    parquet_dir: "",
  });
  const overview = usePollingResource<RibbonView>(() => apiClient.overview(), {
    macro_regime: "loading",
    data_freshness_minutes: 0,
    freshness_status: "loading",
    risk_budget_used_pct: 0,
    risk_budget_total_pct: 0,
    pipeline_status: "loading",
    source_mode: "loading",
    last_refresh: null,
    next_event: null,
  });
  const signals = usePollingResource<SignalView[]>(() => apiClient.signals(), []);
  const highRiskSignals = usePollingResource<SignalView[]>(() => apiClient.highRiskSignals(), []);
  const news = usePollingResource<NewsView[]>(() => apiClient.news(), []);
  const watchlist = usePollingResource<WatchlistView[]>(() => apiClient.watchlist(), []);
  const research = usePollingResource<ResearchView[]>(() => apiClient.research(), []);
  const risk = usePollingResource<RiskView[]>(() => apiClient.risk(), []);
  const riskExposure = usePollingResource<RiskExposureView[]>(() => apiClient.riskExposure(), []);
  const activeTrades = usePollingResource<ActiveTradeView[]>(() => apiClient.activeTrades(), []);
  const walletBalance = usePollingResource<WalletBalanceView[]>(() => apiClient.walletBalance(), []);
  const journal = usePollingResource<JournalReviewView[]>(() => apiClient.journal(), []);
  const backtests = usePollingResource<BacktestListView[]>(() => apiClient.backtests(), []);
  const bars = usePollingResource<BarView[]>(() => apiClient.bars(selectedSymbol), [], [selectedSymbol]);
  const assetContext = usePollingResource<AssetContextView>(
    () => apiClient.assetContext(selectedSymbol),
    {
      symbol: selectedSymbol,
      latest_signal: null,
      latest_risk: null,
      research: null,
      related_news: [],
      latest_backtest: null,
    },
    [selectedSymbol],
  );

  return {
    health,
    overview,
    signals,
    highRiskSignals,
    news,
    watchlist,
    research,
    risk,
    riskExposure,
    activeTrades,
    walletBalance,
    journal,
    backtests,
    bars,
    assetContext,
  };
}
