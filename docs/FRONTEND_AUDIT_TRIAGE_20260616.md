# Frontend Audit Triage - 2026-06-16

## Summary

This triage resolves the frontend npm audit blocker found after PR #15 merged into `origin/main`.

Baseline:

- `origin/main`: `ef5323c81efb1ddc862279827d0045047d144c9e`
- Branch: `fix/frontend-audit-babel-form-data`
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\frontend_audit_fix_20260616-042604`

## Audit Reproduction

Fresh install:

```powershell
npm ci --prefix apps/frontend
npm audit --prefix apps/frontend
```

Result:

- `2 vulnerabilities`
- `@babel/core <=7.29.0`, low severity
- `form-data 4.0.0 - 4.0.5`, high severity

Dependency paths:

- `@vitejs/plugin-react@4.7.0 -> @babel/core@7.29.0`
- `jsdom@25.0.1 -> form-data@4.0.5`

Both issues were transitive. `npm audit` reported a non-force fix was available.

## Fix

Used the narrow lockfile-only command:

```powershell
npm audit fix --prefix apps/frontend --package-lock-only
```

No `npm audit fix --force` was used.
No Vite major upgrade was performed.
No `package.json` change was needed.

Resolved versions:

- `@babel/core@7.29.7`
- `form-data@4.0.6`
- `vite@6.4.3` unchanged
- `@vitejs/plugin-react@4.7.0` unchanged
- `esbuild@0.28.1` override unchanged

## Validation

Backend:

- Paper wallet/risk tests: `11 passed`
- Strategy/DSL/walk-forward/contract tests: `7 passed`
- Combined backend suite: `18 passed`

Frontend:

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed
- Main chunk: `457.33 kB`
- Vite chunk warning: absent
- Full frontend tests: `34 files / 213 tests passed`
- Focused Phase 8 gate: `8 files / 102 tests passed`

## Runtime/API/Browser Proof

Isolated runtime:

- API: `http://127.0.0.1:5463/api`
- Frontend: `http://127.0.0.1:5200`

API smoke:

- `/api/health`: ok
- `/api/portfolio/paper-wallet`: ok
- `/api/portfolio/paper-ledger`: ok
- `/api/portfolio/simulated-orders`: ok
- `/api/portfolio/paper-risk-policy`: ok
- `/api/portfolio/paper-risk-decisions`: ok
- `/api/strategies`: ok
- `/api/backtests`: ok
- USOUSD and XAGUSD paper buys filled
- WTI_CTX, insufficient cash, max notional, missing assumptions, and paused policy rejected clearly

Browser smoke:

- Wallet, Strategy Lab, and Backtests checked at `1440x900`, `1280x720`, and `390x844`
- Route checks: `9/9` passed
- Console errors: `0`
- Page errors: `0`
- Failed requests: `0`
- Horizontal overflow: `false`
- Forbidden wording: absent

## Safety

- Dependency/lockfile-only fix.
- No product behavior changed.
- No backend production code changed.
- No frontend product code changed.
- No Docker/runtime config changed.
- No autonomous loop, scheduler, background trading, signal-to-order automation, broker/live execution, external routing, cash-account behavior, or real-money behavior added.
- Dirty main was not used as source truth.

## Rollback

After commit:

```powershell
git revert <frontend-audit-fix-commit>
```
