# Phase 9E Paper Risk Governor

## Baseline

- Source baseline: `origin/main` at `3412a95c708f04060d4eaea01843b3b9a4575cd1`.
- Scope: paper-only simulated execution hardening before any autonomous paper loop exists.
- Boundary: no scheduler, no background trading, no broker adapter, no cash-account trading behavior, and no hidden autonomous actions.

## Implementation Summary

Phase 9E adds a deterministic paper risk governor around the Phase 9D paper wallet, append-only ledger, and simulated order primitives.

The risk governor now exposes:

- Paper risk policy metadata with policy version, wallet binding, limits, allowed symbols, research-only symbols, cash buffer, status, and pause reason.
- Paper risk decision records for accepted and rejected simulated orders.
- Portfolio API endpoints for current policy, recent decisions, pause, and resume.
- Centralized pre-trade checks before a simulated order can fill.
- Read-only Wallet tab visibility for policy limits and recent risk decisions.

## Policy And API

New portfolio endpoints:

- `GET /api/portfolio/paper-risk-policy`
- `GET /api/portfolio/paper-risk-decisions`
- `POST /api/portfolio/paper-risk-policy/pause`
- `POST /api/portfolio/paper-risk-policy/resume`

Policy defaults:

- `max_order_notional`: `15000`
- `max_position_notional_per_symbol`: `25000`
- `max_open_orders`: `5`
- `max_daily_loss`: `500`
- `max_drawdown_pct`: `20`
- `min_cash_buffer`: `100`
- `require_assumption_snapshot`: `true`
- `require_strategy_contract`: `true` when a strategy key is supplied
- allowed symbols include `USOUSD` and `XAGUSD`
- `WTI` and `WTI_CTX` remain research context only

## Simulated Execution Hardening

The simulated order service now checks:

- wallet and policy status
- trader-facing symbol discipline
- explicit assumption snapshots
- valid side/order type/quantity/price
- strategy contract presence when a strategy key is provided
- max order notional
- max open orders
- sufficient cash after the required cash buffer
- daily loss and drawdown guardrails
- symbol and strategy exposure caps where current accounting supports them

Every accepted or rejected simulated order records a paper risk decision. Rejected orders still create an auditable simulated order and append a ledger marker.

## Accounting Invariants

Phase 9E preserves the Phase 9D accounting model:

- wallet cash remains derived from starting balance plus ledger deltas
- reserved cash remains derived from ledger reserve/release rows
- ledger entries remain append-only
- filled orders write ledger entries
- rejected orders write an order record and audit marker
- paper-only flags remain visible in wallet, order, ledger, policy, and decision responses

## Frontend

The Wallet tab now includes a read-only Paper Risk panel showing:

- policy status
- max order notional
- max open orders
- max daily loss
- minimum cash buffer
- allowed and research-only symbols
- max drawdown
- recent accepted/rejected risk decisions

No autonomous controls were added.

## Validation

- Backend paper wallet/risk tests: `11 passed`
- Backend strategy/DSL/walk-forward/contract tests: `7 passed`
- Frontend audit: `0 vulnerabilities`
- Frontend build: passed, main chunk `463.56 kB`, no Vite chunk warning
- Frontend full tests: `34 files / 213 tests passed`
- Focused Phase 8 gate: `8 files / 102 tests passed`

The known jsdom ErrorBoundary stack for `chart blew up` appeared during focused tests and remained acceptable because Vitest exited `0`.

## Runtime Proof

Final isolated runtime:

- Frontend: `http://127.0.0.1:5196`
- Backend API: `http://127.0.0.1:5459/api`

API proof confirmed:

- `/api/health` ok
- paper wallet, ledger, simulated orders, risk policy, and risk decisions returned successfully
- valid `USOUSD` and `XAGUSD` paper orders filled
- `WTI_CTX` was rejected as research context only
- insufficient cash rejected clearly
- max order notional rejected clearly
- missing assumptions rejected clearly
- paused policy blocked a new simulated order
- strategies retained Phase 9C contract metadata
- backtests retained Phase 9B assumptions metadata

Browser proof checked Wallet, Strategy Lab, and Backtests at `1440x900`, `1280x720`, and `390x844`:

- `9/9` route checks passed
- console errors `0`
- page errors `0`
- failed requests `0`
- horizontal overflow `false`
- detected overlaps `0`
- forbidden wording absent

The browser smoke fulfilled runtime config and API CORS inside Playwright for isolated proof only. No repo runtime config file was edited.

## Next Phase

Recommended Phase 9F: paper performance dashboard and review queue hardening. Keep the loop disabled until paper risk policy, ledger invariants, and operator review controls are merged and verified.
