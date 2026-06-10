# Current Project State - Phase 8p.1 Refresh

## Source Of Truth

- Clean baseline: `origin/main`
- Baseline commit: `7dba43c0b2a0f0ebf04ef7689665ab92ab805b7b`
- Phase 8p.1 branch: `fix/operator-ui-mobile-overflow-containment`
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase8p1_mobile_overflow_20260610-235649`

Dirty main at `C:\Users\sajal\OneDrive\Desktop\code\AI Trader` remains a separate local checkout and is not source truth.

## Product Identity

AI Trader remains a browser-first, advisory-only commodities operator terminal for research, paper trading, AI-assisted market analysis, and review/accountability.

Preserved guardrails:

- advisory-only discipline
- no fake-live wording
- no visible `execution-ready`, `execution-grade`, `non-execution-grade`, or `broker-ready`
- backend-led chart truth
- REST plus `/ws/updates`
- selected-asset truth
- route-settle behavior
- chart continuity
- Operator Brief evidence discipline
- `USOUSD` as trader-facing oil
- `WTI` / `WTI_CTX` as research-only context
- `XAGUSD` as trader-facing silver

## Phase 8p.1 Status

The remaining Phase 8p release blocker was a `390x844` horizontal overflow caused by Operator Brief grid children retaining `min-width: auto` under the one-column mobile layout.

Phase 8p.1 repaired the issue with a narrow CSS-only containment change in `apps/frontend/src/styles.css`.

## Validation Status

- audit: clean, `0 vulnerabilities`
- build: passed
- main chunk: `457.80 kB`
- full frontend tests: passed, `33` files / `210` tests
- focused Phase 8 tests: passed, `8` files / `102` tests
- isolated browser smoke: passed, `18` route/viewport checks

## Runtime Evidence

Phase 8p.1 isolated runtime:

- frontend/proxy: `http://127.0.0.1:5194`
- backend port: `5457`
- compose project: `ai-trader-phase8p1-mobile-smoke`

The runtime was used only for isolated proof and was not the dirty-main runtime.

## Known Notes

- Graphify rebuild could not run because `python3` is unavailable through the Windows launcher.
- Build-generated `apps/frontend/vite.config.d.ts` and `apps/frontend/vite.config.js` appeared during validation and were restored before staging.
- Raw screenshots and temp runtime artifacts remain outside the repo under `%TEMP%`.

## Next Step

Phase 8p.1 is ready for PR readiness after the local commit. The next sprint should push the branch, create a PR, verify the PR diff, and then perform merge/post-merge release-tag verification.
