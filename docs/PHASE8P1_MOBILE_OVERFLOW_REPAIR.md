# Phase 8p.1 Mobile Overflow Repair

## Summary

Phase 8p.1 repaired the remaining mobile release blocker from the Phase 8p post-merge release smoke. The blocked `390x844` viewport had horizontal document overflow on Desk USOUSD, Desk XAGUSD, and AI Desk after PR #7 was merged.

This sprint used a clean worktree from `origin/main` at `7dba43c0b2a0f0ebf04ef7689665ab92ab805b7b` on branch `fix/operator-ui-mobile-overflow-containment`. Dirty main was not used as source truth.

## Original Blocker

Fresh Phase 8p release smoke showed:

- Desk USOUSD: `docScrollWidth 403`, `clientWidth 390`
- Desk XAGUSD: `docScrollWidth 403`, `clientWidth 390`
- AI Desk: `docScrollWidth 403`, `clientWidth 390`

Phase 8p.1 reproduced the same blocker from the clean worktree.

## Exact Overflowing Elements

The primary offenders were Operator Brief grid children:

- `.operator-brief-section`
- `.operator-brief-section.operator-brief-section-wide`
- `.operator-brief-section.operator-brief-next-step`

Representative measurement at `390x844`:

- parent `.operator-brief-grid`: `width 342px`, `scrollWidth 379`
- child `.operator-brief-section`: `rectLeft 24`, `rectRight 403.390625`, `rectWidth 379.390625`
- computed `min-width`: `auto`
- computed `display`: `grid`
- computed `overflow-x`: `visible`

After the first containment patch, AI Desk still had internal text pressure from a long backend-derived token inside `.compact-copy`, so Phase 8p.1 also added text wrapping to compact copy surfaces.

## Root Cause

The Operator Brief grid collapsed to one column at narrow width, but its grid children retained default `min-width: auto`. Long advisory/truth tokens made the single track expand beyond the available panel width. This widened the document to `403px` on a `390px` viewport.

## Implementation

Changed only `apps/frontend/src/styles.css`.

The repair adds defensive containment and wrapping:

- include `.operator-brief-section` in the shared `min-width: 0` and `max-width: 100%` containment group
- set `.operator-brief-section` to `min-width: 0`, `max-width: 100%`, and `overflow-wrap: anywhere`
- wrap `.operator-brief-facts dd` and `.operator-brief-list`
- wrap `.compact-copy`, `.muted-copy`, `.compact-row`, and `.compact`

No backend source, package files, Docker/runtime config, route-settle behavior, chart semantics, advisory wording semantics, or instrument discipline changed.

## Validation

- `npm ci --prefix apps/frontend`: passed
- `npm audit --prefix apps/frontend`: passed, `0 vulnerabilities`
- `npm run build --prefix apps/frontend`: passed
- main chunk: `457.80 kB`
- Vite chunk warning: absent
- `npm test --prefix apps/frontend -- --run`: passed, `33` files / `210` tests
- focused Phase 8 gate: passed, `8` files / `102` tests

The known intentional jsdom ErrorBoundary stack from `chart blew up` appeared in the full test log, but Vitest exited `0` and all tests passed.

## Browser Evidence

Isolated browser smoke ran on `http://127.0.0.1:5194` with backend port `5457`.

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

- total checks: `18`
- passed checks: `18`
- console errors: `0`
- page errors: `0`
- failed requests: `0`
- horizontal overflow: `false`
- detected overlaps: `0`
- forbidden advisory wording: absent
- fake-live wording: absent
- Operator Brief visible on Desk and AI Desk
- `390x844` document widths: all checked routes reported `docScrollWidth == clientWidth == 390`

## Graphify

Graphify was used for orientation. The required rebuild command was attempted after the CSS edit:

```powershell
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

It could not run because `python3` is not available through the Windows launcher in this environment. Source, tests, and runtime proof remain the validation truth for this repair.

## Dirty Main Safety

Dirty main at `C:\Users\sajal\OneDrive\Desktop\code\AI Trader` remained untouched and was not used as release proof.

## Rollback

After commit, rollback with:

```powershell
git revert <phase8p1-commit>
```
