# Phase 9E Frontend Audit Triage

## Summary

Phase 9E was squash-merged successfully, but post-merge verification stopped when `npm audit --prefix apps/frontend` surfaced a new high-severity frontend tooling advisory chain:

`esbuild` -> `vite` -> `@vitejs/plugin-react`

This sprint resolves that audit blocker without `npm audit fix --force` and without a Vite major upgrade.

## Reproduction

Fresh worktree baseline:

- `origin/main`: `8d29c8ef47a48889900a4cd428ff6d8454a9339f`
- `vite`: `6.4.2`
- `@vitejs/plugin-react`: `4.7.0`
- `esbuild`: `0.25.12`

Audit result:

- `3` high vulnerabilities
- Vulnerable package: `esbuild`
- Vulnerable range: `>=0.17.0 <0.28.1`
- npm force recommendation: `vite@8.0.16`, with a semver-major Vite line change

## Fix Approach

The first non-force update was attempted:

`npm update --prefix apps/frontend vite @vitejs/plugin-react esbuild --save-dev`

That moved Vite to `6.4.3`, but audit still failed because esbuild remained vulnerable.

The final fix uses a narrow override:

```json
"overrides": {
  "esbuild": "0.28.1"
}
```

Final versions:

- `vite`: `6.4.3`
- `@vitejs/plugin-react`: `4.7.0`
- `esbuild`: `0.28.1`

The patched esbuild version also required Vite target configuration:

- `build.target = "esnext"`
- `optimizeDeps.esbuildOptions.target = "esnext"`

This avoids a patched-esbuild transpilation failure while keeping the change limited to frontend tooling configuration. Generated `vite.config.js` and `vite.config.d.ts` were not committed.

## Validation

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed
- Main chunk: `457.33 kB`
- Vite chunk warning: absent
- Full frontend tests: `34` files / `213` tests passed
- Focused Phase 8 gate: `8` files / `102` tests passed
- Backend paper wallet/risk tests: `11` passed
- Backend strategy/DSL/walk-forward/contract tests: `7` passed

## Runtime Smoke

Fresh isolated runtime:

- Frontend: `http://127.0.0.1:5198`
- Backend/API: `http://127.0.0.1:5461/api`

API proof:

- `/api/health`: ok
- `/api/portfolio/paper-wallet`: ok
- `/api/portfolio/paper-ledger`: ok
- `/api/portfolio/simulated-orders`: ok
- `/api/portfolio/paper-risk-policy`: ok
- `/api/portfolio/paper-risk-decisions`: ok
- USOUSD paper buy: filled
- XAGUSD paper buy: filled
- WTI_CTX paper buy: rejected as research context only
- insufficient cash: rejected
- max order notional: rejected
- missing assumptions: rejected
- paused policy: blocked a new simulated order
- `/api/strategies`: retained Phase 9C contract metadata
- `/api/backtests`: retained Phase 9B assumptions metadata

Browser proof:

- Wallet, Strategy Lab, and Backtests checked at `1440x900`, `1280x720`, and `390x844`
- Route checks: `9/9`
- Console errors: `0`
- Page errors: `0`
- Failed requests: `0`
- Horizontal overflow: `false`
- Forbidden wording: absent

Browser smoke used Playwright route fulfillment for runtime config and CORS in the isolated proof lane only. No runtime config source file was edited.

## Safety

- No `npm audit fix --force`
- No Vite major upgrade
- No product feature work
- No Phase 9F work
- No autonomous loop, scheduler, background trading, broker execution, real-money behavior, or cash-account behavior
- No dirty-main use as source truth
- No release tag

## Rollback

```powershell
git revert <phase9e-audit-fix-commit>
```
