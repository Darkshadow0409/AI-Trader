# Phase 8p.1 Summary

## Objective

Repair the remaining `390x844` horizontal overflow that blocked the Phase 8p audit-clean release tag after PR #7 merged.

## Worktree

`C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase8p1_mobile_overflow_20260610-235649`

## Branch

`fix/operator-ui-mobile-overflow-containment`

## Baseline

`7dba43c0b2a0f0ebf04ef7689665ab92ab805b7b`

## Root Cause

The one-column mobile Operator Brief grid still let `.operator-brief-section` children use default `min-width: auto`. Long truth/advisory tokens widened the grid track from its `342px` parent to `379.390625px`, pushing the page to `403px` on a `390px` viewport.

## Fix

CSS-only containment in `apps/frontend/src/styles.css`:

- `.operator-brief-section` participates in `min-width: 0` / `max-width: 100%`
- `.operator-brief-section` wraps long content
- `.operator-brief-facts dd`, `.operator-brief-list`, and compact copy surfaces wrap long backend-provided tokens

## Validation

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed
- main chunk: `457.80 kB`
- full tests: `33` files / `210` tests passed
- focused gate: `8` files / `102` tests passed
- known jsdom ErrorBoundary stack appeared and was acceptable because Vitest exited `0`

## Browser Smoke

Fresh isolated browser smoke passed all `18` route/viewport checks on `http://127.0.0.1:5194`.

Routes:

- Desk USOUSD
- Desk XAGUSD
- Watchlist
- Tickets
- AI Desk
- Journal

Viewports:

- `1440x900`
- `1280x720`
- `390x844`

Result:

- console errors `0`
- page errors `0`
- failed requests `0`
- horizontal overflow `false`
- detected overlaps `0`
- forbidden wording absent
- fake-live wording absent
- Operator Brief visible on Desk and AI Desk

## Graphify

Graphify report was read for orientation. The required rebuild command was attempted after CSS edits, but `python3` was unavailable through the Windows launcher.

## Dirty Main

Dirty main stayed untouched and remains outside the proof lane.

## Rollback

`git revert <phase8p1-commit>`
