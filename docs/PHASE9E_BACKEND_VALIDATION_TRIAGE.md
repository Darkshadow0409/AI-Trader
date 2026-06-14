# Phase 9E Backend Validation Triage

## Summary

Phase 9E and the frontend audit fix were already merged, but the post-merge proof lane was blocked by backend paper wallet/risk tests failing in a fresh verification worktree. This triage reproduces the failure, isolates the cause, and applies a narrow test-state fix without changing production paper trading behavior.

## Reproduction

Baseline:

- `origin/main`: `07bd8a1679c7c625c243a6a3160103a97d442907`
- Branch: `fix/phase9e-paper-risk-validation`

Initial combined run:

```powershell
python -m pytest apps/backend/tests/test_paper_wallet_ledger.py apps/backend/tests/test_paper_risk_governor.py -q -vv
```

Result: `5 failed, 6 passed`.

Failing expectations:

- A USOUSD buy expected `filled` but returned `rejected`.
- An unfunded buy expected `rejected` but returned `filled`.
- Trader-facing symbol acceptance checks expected filled USOUSD/XAGUSD orders but saw rejection.
- Risk-decision acceptance expected a filled accepted order but saw rejection.
- Open-order limit setup expected `accepted` limit orders but saw rejection.

The same files passed when run individually. A fresh runtime probe also filled the same valid USOUSD request. This pointed to cross-test state leakage rather than a new service accounting defect.

## Root Cause

The backend test runtime uses a process-level SQLite database. Paper wallet/risk tests create default wallet, risk policy, ledger, simulated order, and risk decision rows. Without per-test reset, earlier tests can affect later tests in a combined run:

- Filled orders consume cash and can make later valid orders reject.
- Pause/resume and policy state can leak.
- Open orders can affect max-open-order checks.
- Ledger and decision rows accumulate across the paper test modules.

## Fix

The fix is test-only:

- Added an autouse isolation fixture to `apps/backend/tests/test_paper_wallet_ledger.py`.
- Added an autouse isolation fixture to `apps/backend/tests/test_paper_risk_governor.py`.
- Each fixture ensures paper wallet tables exist, then deletes paper risk decisions, simulated orders, ledger rows, risk policies, and wallets before each test.

No production service, API, model, frontend, dependency, or runtime configuration code changed.

## Validation

Backend:

- Paper wallet/risk suite: `11 passed`
- Strategy/DSL/walk-forward/contract suite: `7 passed`
- Combined backend suite: `18 passed`

Frontend:

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed, main chunk `457.33 kB`, no Vite chunk warning
- Full frontend tests: `34 files / 213 tests passed`
- Focused Phase 8 gate: `8 files / 102 tests passed`

## Runtime/API/Browser Proof

Fresh isolated runtime:

- API: `http://127.0.0.1:5462/api`
- Frontend: `http://127.0.0.1:5199`

API checks:

- `/api/health`: ok
- `/api/portfolio/paper-wallet`: ok
- `/api/portfolio/paper-ledger`: ok
- `/api/portfolio/simulated-orders`: ok
- `/api/portfolio/paper-risk-policy`: ok
- `/api/portfolio/paper-risk-decisions`: ok
- `/api/strategies`: ok
- `/api/backtests`: ok

Order checks:

- USOUSD paper buy: filled
- XAGUSD paper buy: filled
- WTI_CTX paper buy: rejected as research context only
- Insufficient cash order: rejected clearly
- Max notional order: rejected clearly
- Missing assumptions order: rejected clearly
- Paused policy order: rejected clearly

Browser checks:

- Wallet, Strategy Lab, and Backtests at `1440x900`, `1280x720`, and `390x844`
- Checks passed: `9/9`
- Console errors: `0`
- Page errors: `0`
- Failed requests: `0`
- Horizontal overflow: `false`
- Detected overlaps: `0`
- Forbidden wording: absent

## Safety Boundaries

This triage did not add or change:

- autonomous paper loop
- scheduler/background trading
- signal-to-order automation
- broker/live execution
- real-money behavior
- cash-account behavior
- frontend dependencies
- Docker/runtime configuration

Dirty main remained untouched and was not used as proof.

Graphify rebuild was attempted with the project command, but the local environment does not expose the `graphify` Python module, so no graph refresh was produced.

## Rollback

After commit:

```powershell
git revert <phase9e-validation-fix-commit>
```
