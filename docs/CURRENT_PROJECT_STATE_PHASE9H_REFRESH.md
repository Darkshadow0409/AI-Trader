# Current Project State Phase 9H Refresh

## Source Baseline

- `origin/main`: `cdeb18fb66d8f23c6e463dfb2cf1545546a94cdd`
- Branch: `feat/availability-ai-brain-cockpit`
- Worktree: `C:\Users\sajal\OneDrive\Desktop\Codex Projects\AI Trader\phase9h_availability_ai_brain_20260625-010924`

## What Changed

- Added availability status and read-only paper-state export APIs.
- Added deterministic local AI Brain query API.
- Added AI Brain Cockpit to the AI Desk.
- Added frontend API contracts, mock fallback data, and tests.
- Added backend tests for availability and no-mutation AI Brain behavior.
- Added external feature map documentation.
- Hardened backend Docker startup by normalizing the copied entrypoint line endings inside the image.
- Aligned tracked `apps/frontend/vite.config.js` with the existing TypeScript Vite config target settings.

## Availability / Persistence

- Docker production backend already persists `/app/data` through `./data:/app/data`.
- SQLite default path remains `data/sqlite/ai_trader.db`.
- Phase 9H added runtime status visibility and a narrow Dockerfile startup fix after Docker proof exposed a CRLF shebang failure.
- Health/status responses do not expose secrets.
- Backend-only Docker restart proof passed: health and availability stayed OK, and paper wallet/ledger state persisted across restart.

## AI Brain

AI Brain is read-only. It summarizes local records and returns degraded notes when data is absent.

It does not:

- create simulated orders
- create ledger rows
- create risk decisions
- create signal-to-order automation
- add a scheduler
- add a background trading worker

## UI

AI Desk now includes a Paper Research Command Center with:

- local question input
- availability status
- persistence status
- table readiness
- answer/evidence cards
- paper/research-only label

## Known Limits

- Unrealized PnL remains unavailable until inventory accounting exists.
- AI Brain uses deterministic local fallback; no provider call is required.
- Instagram references were inaccessible to reliable inspection; screenshots/text are required before extracting any strategy ideas.
- Headless Chrome/CDP browser smoke was attempted, but local Chrome did not expose its debug endpoint reliably. No new browser-layout proof is claimed beyond frontend build/tests and API/runtime smoke.
- No old files were deleted.

## Next Recommended Phase

Phase 9I should harden AI Brain audit history and operator notes before adding loop controls or run-once proposal generation.
