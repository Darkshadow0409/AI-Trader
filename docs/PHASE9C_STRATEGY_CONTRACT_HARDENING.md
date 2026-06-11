# Phase 9C Strategy Contract Hardening

## Summary

Phase 9C makes strategy definitions explicit, deterministic, auditable, versioned, and compatible with Phase 9B backtest assumptions. The change is backend/API-first with a small Strategy Lab display panel.

## Baseline

- Baseline `origin/main`: `a9dd7ccdc3d9d970afe43204267b96751adc3543`
- Previous release tag: `ai-trader-phase8p-ui-layout-stability-audit-clean-20260611`
- Previous release target: `e0b44b46c73977f9d5a4d2a5f2758139935d0f08`
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase9c_strategy_contracts_20260612-030206`
- Branch: `feat/strategy-contract-hardening`

## Current Source Findings

- Strategy specs already use a strict Pydantic/YAML DSL.
- Strategy registry rows persist `spec_json`, validation JSON, search-space JSON, lifecycle state, and symbol mappings.
- Backtest services already consume strategy specs and Phase 9B assumptions metadata.
- Signal frames are deterministic and shift entry/exit signals one bar forward before evaluation.
- Frontend Strategy Lab shows strategy details but did not expose a compact contract panel.

## Contract Fields

Each strategy API payload now includes:

- `contract_schema_version`
- `strategy_key`
- `strategy_name`
- `strategy_version`
- `strategy_family`
- `deterministic`
- `allowed_symbols`
- `research_only_symbols`
- `default_symbol`
- `supported_timeframes`
- `required_inputs`
- `optional_inputs`
- `entry_rule_summary`
- `exit_rule_summary`
- `risk_rule_summary`
- `compatible_candle_fill_rules`
- `required_assumption_fields`
- `forbidden_inputs`
- `lookahead_policy`
- `output_signal_type`
- `min_bars_required`
- `warmup_bars`
- `parameter_schema`
- `parameter_defaults`
- `parameter_bounds`
- `contract_hash`
- `warnings`

## Deterministic Baseline Strategies

Added:

- `trend_following_baseline`: oil-led trend-following baseline using delayed breakout confirmation. It maps WTI research context to trader-facing `USOUSD`.
- `mean_reversion_baseline`: silver mean-reversion baseline using close-based ATR band evidence. It maps silver research context to trader-facing `XAGUSD`.

These are baseline research fixtures. They are not profit claims.

## Frontend

Strategy Lab now includes a compact `Strategy Contract` panel showing version/family, deterministic status, allowed and research-only symbols, supported timeframes, lookahead policy, bar requirements, candle-fill compatibility, contract hash, and rule summaries.

## Safety

- No autonomous paper loop.
- No scheduler changes.
- No paper wallet or ledger.
- No simulated order/fill/rejection lifecycle.
- No live order route.
- No real-money behavior.
- No fake-live or readiness claims.

## Validation

Validation is recorded in `handoff_evidence_phase9c/phase9c_summary.md`.

## Rollback

After commit, rollback with:

`git revert <phase9c-commit>`
