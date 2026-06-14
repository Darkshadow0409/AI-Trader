# Current Project State: Phase 9E Audit Triage

## Baseline

- Source branch: `fix/frontend-audit-vite-esbuild`
- Baseline `origin/main`: `8d29c8ef47a48889900a4cd428ff6d8454a9339f`
- Baseline subject: `feat: add paper risk governor for simulated orders`
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase9e_audit_triage_20260613-105858`

## Audit State

The post-merge Phase 9E audit blocker was reproduced from a fresh worktree:

- `npm audit --prefix apps/frontend --json`: failed with `3` high advisories
- Chain: `esbuild` -> `vite` -> `@vitejs/plugin-react`
- Installed before triage:
  - `vite`: `6.4.2`
  - `@vitejs/plugin-react`: `4.7.0`
  - `esbuild`: `0.25.12`
- Advisory range: `esbuild >=0.17.0 <0.28.1`
- npm force fix recommendation: Vite major line (`vite@8.0.16`) and plugin major (`@vitejs/plugin-react@6.0.2`)

No `npm audit fix --force` command was run.

## Fix State

The safe path used a package override instead of a Vite major upgrade:

- `npm update --prefix apps/frontend vite @vitejs/plugin-react esbuild --save-dev`
- `overrides.esbuild = 0.28.1`
- Final package versions:
  - `vite`: `6.4.3`
  - `@vitejs/plugin-react`: `4.7.0`
  - `esbuild`: `0.28.1`

Vite config now sets `build.target` and `optimizeDeps.esbuildOptions.target` to `esnext`.
This is a dependency compatibility setting for the patched esbuild version; no product behavior or trading semantics were changed.

## Verification State

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed, main chunk `457.33 kB`, no Vite chunk warning
- Full frontend tests: `34` files / `213` tests passed
- Focused Phase 8 gate: `8` files / `102` tests passed
- Backend paper wallet/risk tests: `11` passed
- Backend strategy/DSL/walk-forward/contract tests: `7` passed
- Fresh isolated runtime/API/browser smoke: passed on `http://127.0.0.1:5198` and `http://127.0.0.1:5461/api`

Known expected test behavior: the jsdom ErrorBoundary stack for `chart blew up` appeared during full frontend tests, with Vitest exit `0`.

## Safety

- No Phase 9F work was started.
- No autonomous loop, scheduler, background trading, broker execution, real-money behavior, or cash-account behavior was added.
- Dirty main at `C:\Users\sajal\OneDrive\Desktop\code\AI Trader` was not used as source truth.
- No dirty-main reset, clean, stash, copy, or runtime management was performed.
