# AI Trader Phase 1

Local-first multi-asset trading research and signal platform for BTC and ETH with macro context from FRED and EIA. The current scaffold includes research, signals, risk reporting, seeded Strategy Lab and backtesting workflows, and a minimal dashboard. It does not execute live orders.

## Included in milestone 1

- FastAPI backend with SQLModel, SQLite, DuckDB, Parquet, Polars, and APScheduler
- Sample-data-first ingestion for BTC, ETH, FRED macro events, and EIA news
- Feature engine v1: returns, EMA/SMA state, breakout levels, ATR volatility, relative volume, market structure, cross-asset correlation, and event proximity
- Signal engine: trend breakout and event-driven signals with uncertainty and data-quality fields
- Risk engine: stop logic, size bands, scenario shocks, cluster exposure, and persisted risk reports
- Strategy Lab and Backtesting layer with typed DSL specs, template registry, vectorbt research runs, backtesting.py validation runs, walk-forward windows, bounded search, robustness scoring, and DuckDB/SQLite persistence
- Minimal React dashboard tabs: Signals, News, Watchlist, Risk, Strategy Lab
- Tests for API startup, seeding, signal scoring, risk sizing, strategy DSL parsing, walk-forward windows, robustness scoring, API serialization, and frontend adapters/components

## Repository layout

```text
apps/
  backend/
  frontend/
scripts/
data/
```

## Setup

1. Create and activate a Python 3.12 virtual environment.
2. Install backend dependencies:

```bash
pip install -r apps/backend/requirements.txt
```

3. Install frontend dependencies:

```bash
cd apps/frontend
npm install
cd ../..
```

4. Copy `.env.example` to `.env` if you want to override defaults.

## Run

Primary local run command:

```bash
make dev
```

Fallback if `make` is unavailable:

```bash
python scripts/dev.py
```

## Useful commands

```bash
python scripts/seed_data.py
python scripts/backfill.py
python scripts/local_jobs.py
python scripts/run_backtest.py --strategy trend_breakout_v1 --search-method grid --max-trials 8
pytest apps/backend/tests
cd apps/frontend && npm test -- --run
```

## First endpoints

- `GET /api/health`
- `GET /api/signals`
- `GET /api/news`
- `GET /api/watchlist`
- `GET /api/risk/latest`
- `GET /api/market/bars/{symbol}`
- `GET /api/strategies`
- `GET /api/strategies/{strategy_name}`
- `GET /api/backtests`
- `GET /api/backtests/{run_id}`
- `POST /api/backtests/run`
- `POST /api/system/refresh`
- `WS /ws/updates`

## Notes

- The platform prefers live connector data when available, but always falls back to deterministic local fixtures.
- Every signal and risk report includes `uncertainty` and `data_quality`.
- Every strategy spec parse is typed and tested, and Strategy Lab promotes only through walk-forward plus robustness gates.
- No real-money execution and no autonomous trading are included.
