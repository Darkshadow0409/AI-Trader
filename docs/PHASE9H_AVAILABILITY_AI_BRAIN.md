# Phase 9H Availability And AI Brain Cockpit

## Baseline

- Source of truth: `origin/main` at `cdeb18fb66d8f23c6e463dfb2cf1545546a94cdd`.
- Fresh worktree: `phase9h_availability_ai_brain_20260625-010924`.
- Branch: `feat/availability-ai-brain-cockpit`.
- Phase 9G was docs-only readiness. This pass supersedes the earlier loop-control prompt.

## Current Source Findings

- Docker production compose uses `docker-compose.prod.yml`; no root `docker-compose.yml` was present.
- Backend persistent data is already volume-mounted with `./data:/app/data`.
- Backend Dockerfile and entrypoint create `/app/data/sqlite`, `/app/data/parquet`, `/app/data/diagnostics`, `/app/data/exports`, and `/app/data/local_runtime`.
- Default SQLite path is `data/sqlite/ai_trader.db`; DuckDB and parquet paths also live under `data`.
- Backend Docker restart proof exposed a CRLF entrypoint failure. Phase 9H normalizes the copied entrypoint inside the image so Windows checkout line endings do not break Linux container startup.
- `/api/health` existed but only returned basic path values.
- Paper wallet, ledger, simulated orders, risk policy, risk decisions, performance, equity curve, rejection analysis, and review queue APIs already existed under `/api/portfolio`.
- The existing AI Desk had an advisory flow and deterministic local fallback. It did not have a unified command-center answer that summarized wallet/risk/performance/review evidence.
- An app data-refresh scheduler already existed. Phase 9H did not add a scheduler or connect trading behavior to any scheduler.

## Implementation Summary

### Availability

Added `GET /api/availability/status`.

The endpoint reports:

- app status
- database reachability
- configured persistence path
- persistence mode
- paper wallet table readiness
- paper ledger table readiness
- simulated orders table readiness
- paper risk policy table readiness
- paper performance readiness inferred from table reachability

The endpoint does not return secrets. It creates no wallet, orders, ledger rows, risk decisions, or performance rows.

Added `GET /api/availability/paper-state-export`.

The export is read-only JSON for paper/research state. It does not import, restore, or create orders.

Startup logging now records the configured SQLite path, parquet path, and scheduler setting without exposing secrets.

### Docker Restart Safety

The backend Dockerfile now strips CRLF line endings from `/usr/local/bin/docker-backend-entrypoint.sh` before marking it executable. This is a narrow availability fix: it does not change compose networking, volumes, dependencies, or runtime behavior.

### AI Brain

Added `POST /api/ai-brain/query`.

The AI Brain response is deterministic local fallback text assembled from existing AI Trader records:

- local signal context when present
- strategy contract summary
- latest backtest assumptions summary
- paper wallet state
- risk policy and recent risk decision summary
- paper performance/review summary
- suggested next inspection
- uncertainty/degraded-data notes

The endpoint reads existing records directly and does not call paper-wallet helpers that create default wallet state. Tests prove it creates no simulated orders, ledger rows, or risk decisions.

### Frontend

Added an AI Brain Cockpit panel to AI Desk:

- question input
- availability cards
- persistence/table readiness card
- answer card
- evidence cards
- strategy/backtest/risk/next-inspection cards
- uncertainty notes
- paper/research-only label

The panel is responsive through existing grid/container styles and keeps the existing advisory flow intact.

### Frontend Runtime Config

The tracked `apps/frontend/vite.config.js` mirror is now aligned with `vite.config.ts` for the patched esbuild target settings. Without this, dev/runtime startup and build can read stale target settings from the tracked JS file.

## Non-Goals

- No autonomous paper loop.
- No scheduler implementation.
- No background trading worker.
- No signal-to-order automation.
- No proposal generation.
- No order creation from AI Brain.
- No broker adapter.
- No external order path.
- No real funds behavior.
- No cash account behavior.
- No deletion of old files.

## Old / Unused File Inventory

No files were deleted. Candidate cleanup inventory only:

- Historical Phase 8 and Phase 9 docs remain in `docs/`.
- Historical handoff evidence folders remain in `handoff_evidence_phase8p*`, `handoff_evidence_phase9b`, `handoff_evidence_phase9c`, `handoff_evidence_phase9d`, `handoff_evidence_phase9e*`, `handoff_evidence_phase9f`, and `handoff_evidence_phase9g`.
- The superseded local loop-control worktree is outside this repo worktree and was not touched.

## Validation

- Backend paper/risk/performance/Phase 9H suite: 18 passed.
- Backend strategy/DSL/walk-forward/contract suite: 7 passed.
- `npm ci --prefix apps/frontend`: passed and reported 0 vulnerabilities.
- `npm audit --prefix apps/frontend`: 0 vulnerabilities.
- `npm run build --prefix apps/frontend`: passed, main chunk 463.36 kB, no Vite chunk warning.
- Full frontend tests: 34 files / 214 tests passed.
- Focused frontend gate: 8 files / 103 tests passed.
- Known jsdom `chart blew up` stack appeared only while Vitest exited 0.

## Runtime / Restart Proof

- Isolated API/runtime smoke passed on backend `8030` and frontend `5190`.
- `/api/health`, `/api/availability/status`, `/api/ai-brain/query`, paper wallet, paper ledger, simulated orders, paper risk decisions, paper performance, strategies, and backtests returned successfully.
- AI Brain query created 0 orders, 0 ledger rows, and 0 risk decisions.
- Backend-only Docker restart proof passed with compose project `ai-trader-phase9h-smoke`: health and availability stayed OK, and the default paper wallet plus ledger row persisted after container restart.
- Headless Chrome/CDP browser automation was attempted but blocked by local Chrome debug-port startup. No new browser-layout proof is claimed beyond frontend build/tests and API/runtime smoke.

## Rollback

Revert the local commit:

```powershell
git revert <phase9h_commit>
```

No data deletion is required. If a local runtime was started for smoke testing, stop only that isolated runtime.
