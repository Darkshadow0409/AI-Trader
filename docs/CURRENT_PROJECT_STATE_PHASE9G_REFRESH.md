# Current Project State - Phase 9G Refresh

## Verified Source

- `origin/main`: `bb38d9dca49f78c769c5e9ea79906b29ce665d53`
- Latest merged PR: `#17`, Phase 9F paper performance and review visibility
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase9g_loop_readiness_20260620-064719`
- Branch: `docs/autonomous-paper-loop-readiness`

## Inspection Summary

Graphify was read first for orientation. It is an older Phase 7n graph, so current source and Phase 9B-9F docs remain the source of truth.

## Current Source Findings

### Signal Records And Signal Flow

Signals are persisted in `SignalRecord` and exposed through the signals API and dashboard data service. Signal records include score, thesis, uncertainty, data quality, and feature payloads. Current code does not turn signal rows into simulated orders.

### Strategy Contracts And Baselines

Strategy contracts are exposed through the strategy lab service and include deterministic status, allowed symbols, research-only symbols, required assumptions, forbidden inputs, lookahead policy, compatible candle-fill rules, and stable contract hashes. Baseline strategy signal frames shift Entry/Exit one bar forward.

### Backtest Assumptions

Backtest views expose Phase 9B assumptions, validation metadata, validation windows, and metrics audit. Legacy rows degrade honestly rather than faking complete assumptions.

### Paper Wallet, Ledger, And Orders

`PaperWalletRecord`, `PaperLedgerTransactionRecord`, and `SimulatedOrderRecord` support default wallet creation, append-only ledger evidence, manual simulated order creation, deterministic fills, cancellation, and explicit rejection rows.

### Paper Risk Governor

`PaperRiskPolicyRecord` and `PaperRiskDecisionRecord` support policy visibility, pause/resume, and deterministic pre-trade checks. WTI and WTI context remain research-only and cannot be used as trader-facing order symbols.

### Paper Performance And Review

Phase 9F adds read-only paper performance summary, ledger-derived equity curve, rejected-order analysis, and generated paper review queue views. The queue is derived from risk decisions and policy state.

### Frontend Operator Controls

Wallet shows wallet, ledger, simulated orders, risk policy, risk decisions, performance, equity curve, rejections, and review queue. Strategy Lab shows contracts. Backtests show assumptions and validation. There are no loop controls today.

### Scheduler And Loop State

The app has an existing `enable_scheduler` setting and application scheduler for existing refresh work. There is no paper loop route, model, service, worker, or signal-to-order automation.

## Safest Future Insertion Points

- Data model: add loop control and loop evidence records near paper wallet/risk records.
- Service: add a new loop service that calls existing strategy, signal, assumption, risk, order, ledger, performance, and review helpers.
- API: add loop routes under the existing portfolio namespace only after controls are explicit.
- Frontend: add read-only status first, then enable/pause/kill controls, then proposal visibility.

## Risks To Block Before Implementation

- Hidden scheduler execution.
- Direct signal-to-order conversion.
- Missing assumptions.
- Missing or non-deterministic strategy contracts.
- Research-only symbols leaking into trader-facing order proposals.
- Ambiguous wallet/risk policy state.
- Retrying after failure without operator visibility.
- Creating simulated orders before proposal and risk-decision evidence exists.
- Copy that implies broker or funds routing readiness.
- UI controls that imply action before back-end kill/pause behavior is tested.

## Phase 9G Output

This phase is docs-only. No source, tests, package files, Docker/runtime config, or generated artifacts were changed.

## Validation

- `git diff --check`: passed.
- Changed-doc forbidden wording scan: `0` hits.
- Forbidden implementation-file scan: `0` hits.
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`.
- No runtime smoke was run because Phase 9G introduced no runtime behavior. Phase 9F post-merge proof remains the current runtime implementation proof.
