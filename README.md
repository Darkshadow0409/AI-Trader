# AI Trader Phase 1

Local-first multi-asset trading research and signal platform for BTC and ETH with macro context from FRED and EIA. The current scaffold includes research, signals, risk reporting, seeded Strategy Lab and backtesting workflows, and a minimal dashboard. It does not execute live orders.

## Included in milestone 1

- FastAPI backend with SQLModel, SQLite, DuckDB, Parquet, Polars, and APScheduler
- Sample-data-first ingestion for BTC, ETH, FRED macro events, and EIA news
- Feature engine v1: returns, EMA/SMA state, breakout levels, ATR volatility, relative volume, market structure, cross-asset correlation, and event proximity
- Signal engine: trend breakout and event-driven signals with uncertainty and data-quality fields
- Risk engine: stop logic, size bands, scenario shocks, cluster exposure, and persisted risk reports
- Strategy Lab and Backtesting layer with typed DSL specs, template registry, vectorbt research runs, backtesting.py validation runs, walk-forward windows, bounded search, robustness scoring, and DuckDB/SQLite persistence
- Dense React operator console tabs for signals, news, watchlist, risk, trades, journal, strategy lab, backtests, and alert visibility
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

Browser-first local usage guide:

- `RUN_LOCAL.md`

Single-VM staging deployment guide:

- `DEPLOY_STAGING_GCP.md`

## Useful commands

```bash
python scripts/verify_fast.py
python scripts/seed_data.py
python scripts/backfill.py
python scripts/local_jobs.py
python scripts/pilot_export.py
python scripts/run_backtest.py --strategy trend_breakout_v1 --search-method grid --max-trials 8
python -m pytest apps/backend/tests
cd apps/frontend && npm run test -- --run
cd apps/frontend && npm run build
python scripts/verify.py
```

## Testing

The default test mode is fixture-first and local-only:

- no live API keys are required
- pytest forces sample mode and disables the scheduler
- frontend API calls fall back to deterministic mock payloads when the backend is unavailable
- Telegram and Discord sinks are disabled by default and never required for tests

Windows PowerShell commands:

```powershell
python scripts/verify_fast.py
python scripts/seed_data.py
python scripts/backfill.py
python -m pytest apps/backend/tests
Set-Location apps/frontend
npm run test -- --run
npm run build
Set-Location ../..
python scripts/verify.py
python scripts/build_review_bundle.py
```

Verification tiers:

1. Fast developer verification

```powershell
python scripts/verify_fast.py
```

This runs:

1. `python -m pytest apps/backend/tests -m unit`
2. `cd apps/frontend && npm run test:fast`

2. Full local verification

```powershell
python scripts/verify.py
```

The full local verification wrapper runs this exact sequence:

1. `python scripts/seed_data.py`
2. `python scripts/backfill.py`
3. `python -m pytest apps/backend/tests`
4. `cd apps/frontend && npm run test -- --run`
5. `cd apps/frontend && npm run build`

3. Release-grade review bundle

```powershell
python scripts/build_review_bundle.py
```

That reruns the full verification chain in fixture mode and regenerates `review_bundle/` plus `review_bundle.zip`.

## Pilot Run Mode

Operator docs:

- `PILOT_RUNBOOK.md`
- `PILOT_CHECKLIST.md`

Lightweight pilot export:

```powershell
python scripts/pilot_export.py
```

This writes a timestamped folder under `data/exports/` with the current:

- pilot metrics
- ticket funnel
- divergence summaries
- adherence summaries
- realism-warning violations
- strategy degradation summaries
- execution gate snapshot
- pilot dashboard snapshot

## Alert delivery

External alert delivery is thin and opt-in:

- `in_app` is the default source of truth
- Telegram and Discord are isolated sink implementations behind backend config
- no command bot UX, no execution hooks, no broker routing

Relevant env vars:

```powershell
AI_TRADER_ALERT_ENABLE_TELEGRAM=false
AI_TRADER_ALERT_ENABLE_DISCORD=false
AI_TRADER_TELEGRAM_BOT_TOKEN=
AI_TRADER_TELEGRAM_CHAT_ID=
AI_TRADER_DISCORD_WEBHOOK_URL=
AI_TRADER_ALERT_TELEGRAM_MIN_SEVERITY=warning
AI_TRADER_ALERT_DISCORD_MIN_SEVERITY=info
AI_TRADER_ALERT_DEDUPE_WINDOW_MINUTES=240
AI_TRADER_ALERT_COOLDOWN_MINUTES=60
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
