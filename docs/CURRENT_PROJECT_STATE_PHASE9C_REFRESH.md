# Current Project State Phase 9C Refresh

## Source Of Truth

- Source commit: `a9dd7ccdc3d9d970afe43204267b96751adc3543`
- Source branch: `origin/main`
- Phase 9C worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase9c_strategy_contracts_20260612-030206`
- Branch: `feat/strategy-contract-hardening`

The dirty main checkout remains outside the proof lane and is not a source of truth.

## Product Position

AI Trader remains a browser-first, advisory-only commodities operator terminal. Phase 9C is a research/backtest contract-hardening slice. It does not add an autonomous loop, scheduler, paper wallet, ledger, simulated order lifecycle, live order route, or real-money behavior.

## Current Strategy/Backtest Shape

- Strategy definitions are YAML specs loaded from `apps/backend/fixtures/strategy_specs`.
- `StrategyRegistryEntry` persists normalized strategy metadata, validation/search-space JSON, and full `spec_json`.
- Strategy APIs are served through `apps/backend/app/api/routes/strategies.py` and `apps/backend/app/strategy_lab/service.py`.
- Backtest runs use the strategy spec, market bars, deterministic search candidates, shifted signal frames, walk-forward windows, and Phase 9B assumptions metadata.
- Frontend Strategy Lab displays strategy list/detail, search-space, validation gates, promotion discipline, calibration, forward records, and backtest detail.

## Phase 9C Additions

- Strategy API responses now expose a typed `contract` object.
- Contract fields include schema version, key/name/version/family, deterministic status, symbol discipline, supported timeframes, required/optional inputs, entry/exit/risk summaries, compatible candle-fill rules, required Phase 9B assumption fields, forbidden inputs, lookahead policy, output signal type, bar requirements, parameter schema/defaults/bounds, and a stable contract hash.
- Added deterministic sample strategy specs:
  - `trend_following_baseline`
  - `mean_reversion_baseline`
- Strategy Lab now renders a compact `Strategy Contract` panel.

## Safety Boundaries

- Paper/research/backtest only.
- No real-money behavior.
- No live order route.
- No hidden autonomous actions.
- No scheduler or paper wallet/ledger.
- `USOUSD` remains trader-facing oil.
- `WTI` / `WTI_CTX` remain research-only context.
- `XAGUSD` remains trader-facing silver.

## Known Limits

- Contract metadata is derived from YAML specs and existing registry rows; it is not a new migration-backed table.
- Deterministic sample strategies are baseline fixtures for auditability, not profit claims.
- Phase 9C does not start paper trading automation.

## Next Step

Phase 9D should add paper wallet, ledger, and simulated order lifecycle only after the Phase 9C contract metadata is reviewed and merged.
