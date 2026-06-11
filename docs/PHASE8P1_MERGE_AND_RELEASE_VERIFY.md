# Phase 8p.1 Merge And Release Verification

## Scope

This document records the combined Phase 8p and Phase 8p.1 release verification lane after both layout fixes were merged.

Phase 8p stabilized the operator UI layout containment. Phase 8p.1 repaired the remaining narrow mobile overflow that blocked the first Phase 8p release tag attempt.

## Source State

- Current `origin/main` before this docs commit: `76df9d1bca94fb259d785f5dd816b4fbed0e8359`
- PR #7: `fix: stabilize operator UI layout containment`
- PR #7 merge commit: `7dba43c0b2a0f0ebf04ef7689665ab92ab805b7b`
- PR #8: `fix: contain mobile operator layout overflow`
- PR #8 merge commit: `76df9d1bca94fb259d785f5dd816b4fbed0e8359`
- Verification worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase8p2_release_docs_20260611-170701`
- Branch: `docs/phase8p1-release-verification`

## Release Blocker History

The initial Phase 8p release tag attempt was correctly blocked by fresh browser evidence at `390x844`.

- Desk USOUSD: `docScrollWidth 403`, `clientWidth 390`
- Desk XAGUSD: `docScrollWidth 403`, `clientWidth 390`
- AI Desk: `docScrollWidth 403`, `clientWidth 390`

Phase 8p.1 fixed the issue with a CSS-only mobile containment change in `apps/frontend/src/styles.css`.

## Phase 8p.1 Fix Summary

The mobile overflow came from the one-column Operator Brief grid allowing child sections to retain default `min-width: auto`. Long truth/advisory tokens expanded the grid beyond the `390px` viewport.

The fix:

- adds `min-width: 0`, `max-width: 100%`, and `overflow-wrap` containment to Operator Brief sections
- wraps Operator Brief fact/list content
- wraps compact copy surfaces that can contain backend-provided tokens
- does not alter advisory wording, chart truth, route-settle behavior, selected-asset truth, symbol discipline, or runtime contracts

## Release Gates

All release gates were run from the fresh Phase 8p.2 docs worktree.

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed
- main chunk: `457.80 kB`
- Vite chunk warning: absent
- full frontend tests: `33` files / `210` tests passed
- focused Phase 8 gate: `8` files / `102` tests passed
- known jsdom ErrorBoundary stack for `chart blew up`: observed and acceptable because Vitest exited `0`

## Fresh Browser Smoke

Fresh release browser smoke was run against the isolated clean-worktree runtime:

- frontend: `http://127.0.0.1:5195`
- backend: `http://127.0.0.1:5458`
- routes: Desk USOUSD, Desk XAGUSD, Watchlist, Tickets, AI Desk, Journal
- viewports: `1440x900`, `1280x720`, `390x844`
- checks: `18`
- passed: `18`
- failed: `0`
- console errors: `0`
- page errors: `0`
- failed requests: `0`
- horizontal overflow: `false`
- detected overlaps: `0`
- forbidden wording: absent
- fake-live wording: absent
- Desk/Watchlist charts: nonblank where expected
- Operator Brief: visible on Desk and AI Desk
- `390x844`: `docScrollWidth == clientWidth == 390` on every checked route

Smoke note: the local launcher wrote an absolute backend API URL for this isolated stack. The browser smoke harness used Playwright route fulfillment to proxy backend API responses with CORS headers. Product source and runtime configuration were not changed.

Raw temporary evidence was written outside the repo:

- `C:\Users\sajal\AppData\Local\Temp\ai-trader-phase8p2-release-smoke-proxy\release_browser_smoke_results.json`
- `C:\Users\sajal\AppData\Local\Temp\ai-trader-phase8p2-release-smoke-proxy\release_browser_smoke_summary.txt`
- `C:\Users\sajal\AppData\Local\Temp\ai-trader-phase8p2-release-smoke-proxy\screenshots`

## Future Tag Recommendation

Recommended tag name:

`ai-trader-phase8p-ui-layout-stability-audit-clean-20260611`

Important: the future tag target should be the merged docs/evidence commit produced after this Phase 8p.2 branch lands, not `76df9d1bca94fb259d785f5dd816b4fbed0e8359`.

## Dirty Main Safety

Dirty main remains outside the proof lane. It was not reset, cleaned, stashed, copied from, modified, or used as release proof.

## Rollback

If the Phase 8p.1 product merge must be reverted:

`git revert 76df9d1bca94fb259d785f5dd816b4fbed0e8359`

If the Phase 8p.2 docs/evidence commit must be reverted after it lands:

`git revert <phase8p2-docs-commit>`
