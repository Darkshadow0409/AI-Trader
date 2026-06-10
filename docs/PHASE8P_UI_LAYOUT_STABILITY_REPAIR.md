# Phase 8p UI Layout Stability Repair

## Source
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase8p_ui_review_inspection_20260610-044019`
- Baseline: `e23363884a62b7d0c602d8dc42a921cbc3c6d699`
- Rollback tag: `ai-trader-phase8-operator-brief-audit-clean-20260530`

## Scope
Phase 8p is a frontend-only layout containment repair for the operator terminal. It preserves advisory-only behavior, chart truth, route-settle semantics, selected-asset discipline, and backend/runtime contracts.

Changed surfaces:
- Shell and workspace containment CSS in `apps/frontend/src/styles.css`
- Display-only advisory wording sanitization in reality-strip notes
- Operator Brief, chart overlay, and ticket detail visible-note paths that consume backend-provided truth notes
- A focused `resolveRealityStrip` test proving strict-gate wording is not rendered from backend advisory notes

No backend source, dependency files, runtime config, Graphify output, raw screenshots, generated Vite files, or environment files are part of the intended commit.

## Validation
- `npm audit --prefix apps/frontend`: passed, `0` vulnerabilities.
- `npm run build --prefix apps/frontend`: passed.
- Main chunk: `457.80 kB`, below the `500 kB` gate.
- Vite chunk warning: absent.
- `npm test --prefix apps/frontend -- --run`: passed, `33` files / `210` tests.
- Focused Phase 8 gate: passed, `8` files / `102` tests.
- Graphify exact `python3` command: blocked by Windows Store alias.
- Graphify wrapper `.\scripts\graphify_rebuild.ps1`: passed, rebuilt `1641` nodes / `2808` edges / `104` communities.

The full test run prints the existing intentional jsdom ErrorBoundary stack from `ErrorBoundary.test.tsx` (`chart blew up`) while still exiting `0`.

## Browser Evidence
Existing final Phase 8p repair evidence was used from:
- `phase8p_ui_repair_evidence/browser_smoke_summary.txt`
- `phase8p_ui_repair_evidence/layout_overflow_overlap_checks.json`
- `phase8p_ui_repair_evidence/*.png`

Routes and viewports checked:
- Desk `USOUSD`
- Desk `XAGUSD`
- Watchlist
- Tickets
- AI Desk
- Journal
- `1440x900`, `1280x720`, and `390x844`

Browser evidence result:
- Console errors: `0`
- Page errors: `0`
- Failed requests: `0`
- Horizontal overflow: `false`
- Detected overlaps: `0`
- Forbidden advisory wording: `[]`
- Fake-live wording: `[]`
- Desk and Watchlist chart canvases: nonblank where expected
- Operator Brief: visible on Desk and AI Desk

## Release Verdict
Phase 8p is locally release-ready for PR preparation after the local commit. The dirty main checkout remains a status-only lane and is not product proof.
