# Architecture Overview

The platform is a local-first monorepo with a Python backend and a React frontend.

- Backend: FastAPI, SQLModel, SQLite, DuckDB, Parquet, Polars, APScheduler
- Frontend: React, TypeScript, Vite, lightweight-charts
- Default mode: deterministic fixture-first sample mode

Core runtime shape:

1. connectors ingest fixture or live-capable market and macro data
2. `pipeline` persists bars, events, and news
3. `feature_pipeline` computes derived features
4. `signal_pipeline` emits ranked signals
5. `risk_pipeline` builds risk reports
6. `operator_console` assembles browser-facing views and alert refreshes
7. `paper_trading` manages proposed and active paper trades plus outcome analytics
8. `strategy_lab` handles validation, calibration, and promotion state

Guardrails remain explicit:

- no real-money execution
- no broker routing
- no autonomous trading
- no messaging-first workflow
