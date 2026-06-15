# Phase 9E Backend Validation Triage Summary

## Baseline

- `origin/main`: `07bd8a1679c7c625c243a6a3160103a97d442907`
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase9e_backend_validation_triage_20260615-011314`
- Branch: `fix/phase9e-paper-risk-validation`

## Blocker

The merged Phase 9E post-merge validation was blocked by the backend paper wallet/risk tests. The first reproduced combined run returned `5 failed, 6 passed`, while each paper test file passed individually.

## Root Cause

The paper wallet/risk tests used the process-scoped test SQLite database without resetting the durable paper wallet tables per test. Wallet, ledger, simulated order, risk policy, and risk decision state could leak across tests and modules.

## Fix Type

Test-only.

Changed:

- `apps/backend/tests/test_paper_wallet_ledger.py`
- `apps/backend/tests/test_paper_risk_governor.py`

The fixtures delete paper risk decision, simulated order, ledger, risk policy, and wallet rows before each test. No production service or product behavior changed.

## Validation

- `python -m pytest apps/backend/tests/test_paper_wallet_ledger.py apps/backend/tests/test_paper_risk_governor.py -q`: `11 passed`
- `python -m pytest apps/backend/tests/test_strategy_api.py apps/backend/tests/test_strategy_dsl.py apps/backend/tests/test_walk_forward.py apps/backend/tests/test_contract_snapshots.py -q`: `7 passed`
- Combined backend suite: `18 passed`
- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed, main chunk `457.33 kB`, no Vite chunk warning
- Full frontend tests: `34 files / 213 tests passed`
- Focused Phase 8 frontend gate: `8 files / 102 tests passed`

## Runtime/API/Browser Smoke

Isolated runtime:

- API: `http://127.0.0.1:5462/api`
- Frontend: `http://127.0.0.1:5199`

API smoke:

- `/api/health`: ok
- `/api/portfolio/paper-wallet`: ok
- `/api/portfolio/paper-ledger`: ok
- `/api/portfolio/simulated-orders`: ok
- `/api/portfolio/paper-risk-policy`: ok
- `/api/portfolio/paper-risk-decisions`: ok
- `/api/strategies`: ok
- `/api/backtests`: ok
- USOUSD paper buy: filled
- XAGUSD paper buy: filled
- WTI_CTX paper buy: rejected as research context only
- Insufficient cash, max notional, missing assumptions, and paused policy orders rejected clearly

Browser smoke:

- Wallet, Strategy Lab, and Backtests checked at `1440x900`, `1280x720`, and `390x844`
- Route checks: `9/9` passed
- Console errors: `0`
- Page errors: `0`
- Failed requests: `0`
- Horizontal overflow: `false`
- Detected overlaps: `0`
- Forbidden wording: absent

## Safety

- No dirty-main checkout was used as source truth.
- No autonomous loop, scheduler, background trading, signal-to-order automation, broker/live execution, real-money behavior, or cash-account behavior was added.
- No frontend dependency/package files were changed.
- No Docker/runtime config, Graphify output, generated Vite files, raw screenshots, node_modules, dist, env/secrets, DB/log/runtime files, or dirty-main files are intended for commit.
- Graphify rebuild was attempted and blocked by `ModuleNotFoundError: No module named 'graphify'`.

## Rollback

```powershell
git revert <phase9e-validation-fix-commit>
```
