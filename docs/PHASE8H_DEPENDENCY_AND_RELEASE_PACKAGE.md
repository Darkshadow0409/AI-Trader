# Phase 8h Dependency And Release Package

## Baseline

- Release baseline commit: `d9976bd0ad9b7bb9244a74f952e8d9eeff4552e7`
- Worktree used for dependency triage: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase8h_dependency_release_hygiene_20260529-020609`
- Branch: `chore/frontend-dependency-release-hygiene`
- Dirty main checkout remained evidence-only at `bffe2f5`.

## Prior Release Proof

Phase 8f is the current post-merge browser proof for the Operator Brief release line:

- isolated runtime: `http://127.0.0.1:5185`
- console errors: `0`
- page errors: `0`
- Operator Brief visible on Desk and AI Desk
- Desk charts rendered and were nonblank
- no visible `execution-ready`, `execution-grade`, `non-execution-grade`, or `broker-ready`
- no fake-live wording
- `USOUSD` remained trader-facing oil
- `WTI/WTI_CTX` remained research-only context
- `XAGUSD` remained trader-facing silver

Phase 8g produced the release handoff and branch/worktree hygiene recommendation. Phase 8h adds dependency audit triage and packaging notes on top of that handoff.

## Dependency Audit Before Fix

`npm ci --prefix apps/frontend` reported `8 vulnerabilities`:

- `6 moderate`
- `2 high`

The affected packages were in frontend development, build, and test tooling:

- root `vite`
- `picomatch`
- `postcss`
- `ws`
- `nanoid` via dependency refresh
- Vitest tooling chain: `vitest`, `@vitest/mocker`, `vite-node`, nested `vite`, nested `esbuild`

## Safe Remediation Applied

Command run:

```powershell
npm audit fix --prefix apps/frontend
```

`npm audit fix --force` was not run.

The non-force remediation changed only `apps/frontend/package-lock.json`:

- `vite 6.4.1 -> 6.4.2`
- `picomatch 4.0.3 -> 4.0.4`
- `postcss 8.5.8 -> 8.5.15`
- `ws 8.19.0 -> 8.21.0`
- `nanoid 3.3.11 -> 3.3.12`

`apps/frontend/package.json` did not change.

## Remaining Audit Warnings

After the non-force remediation, `npm audit --prefix apps/frontend` reports `5 moderate severity vulnerabilities`.

The remaining issue family is the Vitest 2.x tooling chain:

- `vitest`
- `@vitest/mocker`
- `vite-node`
- nested `vite`
- nested `esbuild`

npm reports the available automated fix as `vitest@4.1.7` through `npm audit fix --force`. That is a semver-major test-runner upgrade from the current `vitest 2.1.9`, so it is deferred for an owner-approved compatibility sprint.

The remaining warnings affect frontend development/test tooling, not the browser runtime bundle directly. They should be addressed, but not by a blind forced major upgrade in the release packaging pass.

## Validation

Phase 8h validation must include:

- `npm run build --prefix apps/frontend`
- focused Vitest command for App, AI Desk, Desk, chart, canonical chart context, and API hook tests
- isolated runtime smoke because dependency files changed

Acceptance remains:

- build exit code `0`
- focused test exit code `0`
- main chunk below `500 kB`
- no Vite chunk warning
- isolated smoke console/page errors `0`
- Operator Brief visible on Desk and AI Desk
- no fake-live or banned advisory wording

## Release Checklist

- `origin/main` baseline verified at `d9976bd0ad9b7bb9244a74f952e8d9eeff4552e7`.
- Phase 8f post-merge isolated smoke passed.
- Phase 8g release handoff exists.
- Phase 8h semver-safe audit remediation applied.
- Remaining Vitest forced-major advisory documented.
- Phase 8h build/tests and isolated smoke must pass before treating this dependency hygiene branch as ready.
- No release tag is created automatically.
- No push is performed automatically.

## Recommended Tag Name

Recommended owner-created tag:

`ai-trader-phase8-operator-brief-20260528`

Manual owner commands only:

```powershell
git tag -a ai-trader-phase8-operator-brief-20260528 d9976bd0ad9b7bb9244a74f952e8d9eeff4552e7 -m "AI Trader Phase 8 operator brief release"
git push origin ai-trader-phase8-operator-brief-20260528
```

## Branch Cleanup Reminder

Use the Phase 8g branch hygiene recommendation before deleting any branches or worktrees. Cleanup should remain owner-approved and manual. Do not delete the dirty main checkout until its unmatched local work is explicitly declared no longer needed.

## Rollback Note

If the Operator Brief line needs rollback, revert the Operator Brief PRs rather than weakening product truth:

- PR #3 for the original Operator Brief feature
- PR #4 for the advisory wording cleanup

Preserve the advisory-only discipline, freshness honesty, selected-asset truth, and no-fake-live wording even during rollback.
