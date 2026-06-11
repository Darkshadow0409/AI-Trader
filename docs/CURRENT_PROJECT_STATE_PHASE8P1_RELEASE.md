# Current Project State - Phase 8p.1 Release Preparation

## Current Source Truth

- `origin/main`: `76df9d1bca94fb259d785f5dd816b4fbed0e8359`
- Latest product merge: PR #8, `fix: contain mobile operator layout overflow`
- Previous UI layout merge: PR #7, `fix: stabilize operator UI layout containment`
- Previous audit-clean tag: `ai-trader-phase8-operator-brief-audit-clean-20260530`

Dirty main remains at `bffe2f5` and is not source truth.

## Product Identity

AI Trader remains a browser-first, advisory-only commodities operator terminal for research, paper trading, AI-assisted market analysis, and review/accountability.

AI Trader is not a broker, execution platform, fake-live dashboard, or generic chatbot with charts.

## Phase 8p And 8p.1 Status

- Operator UI layout containment is merged.
- The narrow `390x844` mobile overflow blocker is repaired.
- Operator Brief remains visible on Desk and AI Desk.
- Truth/freshness and advisory-only wording remain intact.
- Forbidden advisory wording remains absent.
- Desk and Watchlist charts render nonblank where expected.
- `USOUSD` remains trader-facing oil.
- `WTI` / `WTI_CTX` remain research context.
- `XAGUSD` remains trader-facing silver.

## Verification Summary

Fresh Phase 8p.2 release verification from a clean worktree passed:

- `npm ci --prefix apps/frontend`
- `npm audit --prefix apps/frontend`
- `npm run build --prefix apps/frontend`
- `npm test --prefix apps/frontend -- --run`
- focused Phase 8 test gate
- fresh isolated browser smoke across six routes and three viewports

Build remained under the 500 kB main chunk gate:

- main chunk: `457.80 kB`

Audit status:

- `0 vulnerabilities`

Browser smoke:

- routes: Desk USOUSD, Desk XAGUSD, Watchlist, Tickets, AI Desk, Journal
- viewports: `1440x900`, `1280x720`, `390x844`
- result: `18/18` passed
- console errors: `0`
- page errors: `0`
- failed requests: `0`
- horizontal overflow: `false`
- detected overlaps: `0`

## Release Tag Guidance

Recommended future tag:

`ai-trader-phase8p-ui-layout-stability-audit-clean-20260611`

The tag should target the merged docs/evidence commit from the Phase 8p.2 branch after review/merge, not the pre-docs product commit `76df9d1bca94fb259d785f5dd816b4fbed0e8359`.

## Remaining Limits

- No release tag was created in this Phase 8p.2 docs pass.
- Branch/worktree cleanup remains an owner action.
- Graphify was not rebuilt in this clean worktree because `graphify-out/GRAPH_REPORT.md` was not present there.
- The browser smoke used Playwright route fulfillment for backend API CORS headers; product source and runtime config were unchanged.
