# Phase 9B Backtest Assumptions Hardening

## Summary

Phase 9B adds an explicit, API-visible assumptions and validation layer to strategy backtest results. The change is backend-first and research-only: it does not add autonomous trading, schedulers, paper wallet mutations, live broker routing, or real-money behavior.

## Baseline

- Source tag: `ai-trader-phase8p-ui-layout-stability-audit-clean-20260611`
- Baseline commit: `e0b44b46c73977f9d5a4d2a5f2758139935d0f08`
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase9b_backtest_assumptions_20260611-215709`
- Branch: `feat/backtest-assumptions-hardening`

## Current Source Findings

- `BacktestRun` stores `id`, `name`, `engine`, `started_at`, and flexible `metadata_json`.
- `BacktestResult` stores strategy identity, status, symbol/timeframe, timestamps, fees/slippage, warmup, search method, robustness, core metrics, validation/summary/equity/trade JSON, regime metadata, and free-form metadata.
- Backtest endpoints return list/detail views from `apps/backend/app/strategy_lab/service.py`.
- Existing no-lookahead evidence was present as a validation flag, but not exposed as typed validation metadata.
- Existing walk-forward payloads were persisted in `validation_json`/`summary_json`, but not normalized into typed API fields.
- Fees and slippage were persisted, but spread model, candle fill rule, benchmark label, source family, and assumption completeness were not explicit.
- The database uses SQLModel table creation plus compatibility-column logic, not Alembic migrations.

## Implementation

Backend API models now expose:

- `BacktestAssumptionsView`
- `BacktestValidationWindowView`
- `BacktestValidationMetadataView`
- `BacktestMetricsAuditView`

Every `BacktestListView`/`BacktestDetailView` now includes:

- `assumptions`
- `validation_metadata`
- `metrics_audit`

New runs persist Phase 9B assumptions in `metadata_json.assumptions`, validation metadata in `validation_json.validation_metadata`, and metric audit data in `summary_json.metrics_audit`.

Legacy rows are backward-compatible. When Phase 9B fields are absent, the API reconstructs explicit degraded metadata instead of failing:

- `assumption_schema_version = legacy.reconstructed`
- `assumptions_complete = false`
- warning that the row should be rerun to persist Phase 9B metadata

The Backtests UI now includes a compact `Assumptions & Validation` panel showing fees, spread, slippage, candle-fill rule, benchmark, no-lookahead status, train/test range, walk-forward status, and warnings.

## Safety

- Paper/research/backtest-only language is preserved.
- No autonomous loop was added.
- No scheduler changes were made.
- No paper wallet, ledger, simulated order, or live broker route was added.
- No fake-live, broker-ready, or execution-ready wording was introduced.
- Existing symbol discipline remains unchanged.

## Validation

- `npm audit --prefix apps/frontend`: passed, `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed, main chunk `457.80 kB`, no Vite chunk warning
- `npm test --prefix apps/frontend -- --run`: passed, `33 files / 211 tests`
- Focused Phase 8 gate: passed, `8 files / 102 tests`
- Backend tests: `python -m pytest apps/backend/tests/test_strategy_api.py apps/backend/tests/test_walk_forward.py apps/backend/tests/test_contract_snapshots.py`: passed, `3 passed`

The known intentional jsdom ErrorBoundary `chart blew up` stack appeared during full frontend tests, but Vitest exited `0`.

## Runtime Proof

Isolated runtime used:

- Frontend: `http://127.0.0.1:5196`
- Backend: `http://127.0.0.1:5459`

API checks confirmed `/api/health` and `/api/backtests` return the new assumptions, validation metadata, and metrics audit fields.

Browser smoke covered:

- Backtests
- Strategy Lab
- `1440x900`, `1280x720`, `390x844`

Result:

- console errors `0`
- page errors `0`
- failed requests `0`
- horizontal overflow `false`
- forbidden wording absent
- Backtests assumptions panel visible

Runtime screenshots and JSON were stored outside the repo under:

`C:\Users\sajal\AppData\Local\Temp\ai-trader-phase9b-runtime-smoke`

## Graphify

The required `python3` Graphify rebuild command could not run because the Windows `python3` launcher is unavailable. A fallback `python` run started but timed out after two minutes and did not change `graphify-out`. Graphify remains orientation-only; source, tests, API checks, and browser smoke are the validation truth.

## Rollback

After commit, rollback with:

`git revert <phase9b-commit>`
