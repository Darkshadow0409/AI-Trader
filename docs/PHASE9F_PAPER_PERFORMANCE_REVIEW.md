# Phase 9F Paper Performance And Review Visibility

## Summary

Phase 9F adds paper-only performance and review visibility on top of the Phase 9D wallet/ledger/order primitives and Phase 9E risk governor. It does not add an autonomous loop, scheduler, signal-to-order automation, broker adapter, external routing, cash-account behavior, or real-money behavior.

## Source Baseline

- Source of truth: `origin/main`
- Baseline commit: `320dfe0bdff398b1618ebfd048b82970e0f7b235`
- Branch: `feat/paper-performance-review`

## Backend/API

New read-only portfolio endpoints:

- `GET /api/portfolio/paper-performance`
- `GET /api/portfolio/paper-equity-curve`
- `GET /api/portfolio/paper-rejection-analysis`
- `GET /api/portfolio/paper-review-queue`

The performance summary is derived from the default paper wallet, append-only ledger rows, simulated order rows, and paper risk decisions. The equity curve is ledger-derived by sequence number and does not invent mark-to-market values. Unrealized PnL and largest gain/loss remain explicitly unavailable until inventory and close accounting are implemented.

## Review Queue

The review queue is generated from paper risk decisions and paper risk policy state. It surfaces rejected simulated orders, repeated rejection reasons, missing assumptions, research-only symbol attempts, and paused risk policy state. Review items are paper-only views and do not create autonomous actions.

## Frontend

The Wallet tab now includes compact read-only sections for:

- Paper Performance
- Paper Equity Curve
- Paper Rejections
- Paper Review Queue

All copy remains paper-only and avoids live/broker/execution-ready claims.

## Known Limits

- Unrealized PnL is unavailable because inventory and mark-to-market accounting are not implemented.
- Largest single gain/loss are unavailable because simulated order lifecycle does not yet model closed inventory-linked positions.
- Review queue acknowledge/resolve persistence is not implemented in this slice; the queue is generated from current paper evidence.

## Safety

- Paper trading only.
- No real-money trading.
- No live broker execution.
- No autonomous paper loop.
- No scheduler changes.
- No signal-to-order automation.
- No external routing or cash-account behavior.

## Validation

- Backend paper wallet/risk/performance tests: `15 passed`.
- Backend strategy/DSL/walk-forward/contract tests: `7 passed`.
- `npm ci --prefix apps/frontend`: passed.
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`.
- `npm run build --prefix apps/frontend`: passed; main chunk `460.34 kB`; no Vite chunk warning.
- Full frontend tests: `34 files / 213 tests passed`.
- Focused Phase 8 frontend gate: `8 files / 102 tests passed`.
- Runtime/API smoke verified health, wallet, ledger, simulated orders, risk policy, risk decisions, paper performance, equity curve, rejection analysis, review queue, strategies, and backtests.
- Runtime order probes verified USOUSD/XAGUSD fills and WTI_CTX, insufficient cash, max notional, missing assumptions, and paused policy rejections.
- Browser smoke verified Wallet, Strategy Lab, and Backtests at `1440x900`, `1280x720`, and `390x844` with console errors `0`, page errors `0`, failed requests `0`, horizontal overflow `false`, and forbidden wording absent.
- Graphify rebuild was attempted but local tooling was unavailable: `ModuleNotFoundError: No module named 'graphify'`.

## Rollback

After commit, rollback with:

`git revert <phase9f_commit>`
