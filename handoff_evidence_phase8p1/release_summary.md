# Phase 8p.1 Release Summary

## Worktree

`C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase8p2_release_docs_20260611-170701`

## Branch

`docs/phase8p1-release-verification`

## Baseline

`76df9d1bca94fb259d785f5dd816b4fbed0e8359`

## PR Merge Verification

- PR #7 state: `MERGED`
- PR #7 merge commit: `7dba43c0b2a0f0ebf04ef7689665ab92ab805b7b`
- PR #8 state: `MERGED`
- PR #8 merge commit: `76df9d1bca94fb259d785f5dd816b4fbed0e8359`

## Release Gates

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed
- main chunk: `457.80 kB`
- Vite chunk warning: absent
- full frontend tests: `33` files / `210` tests passed
- focused Phase 8 gate: `8` files / `102` tests passed

## Fresh Browser Smoke

- runtime frontend: `http://127.0.0.1:5195`
- runtime backend: `http://127.0.0.1:5458`
- total route/viewport checks: `18`
- passed: `18`
- failed: `0`
- console errors: `0`
- page errors: `0`
- failed requests: `0`
- horizontal overflow: `false`
- detected overlaps: `0`
- forbidden wording: absent
- fake-live wording: absent
- `390x844`: `docScrollWidth == clientWidth == 390` on all checked routes

Raw temp evidence:

- `C:\Users\sajal\AppData\Local\Temp\ai-trader-phase8p2-release-smoke-proxy\release_browser_smoke_results.json`
- `C:\Users\sajal\AppData\Local\Temp\ai-trader-phase8p2-release-smoke-proxy\release_browser_smoke_summary.txt`
- `C:\Users\sajal\AppData\Local\Temp\ai-trader-phase8p2-release-smoke-proxy\screenshots`

## Future Tag

Recommended tag:

`ai-trader-phase8p-ui-layout-stability-audit-clean-20260611`

Future target should be the merged docs/evidence commit after this branch lands, not `76df9d1bca94fb259d785f5dd816b4fbed0e8359`.

## Dirty Main Safety

Dirty main stayed outside this proof lane and was not modified.
