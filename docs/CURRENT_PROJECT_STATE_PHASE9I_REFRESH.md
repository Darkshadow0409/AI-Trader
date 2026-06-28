# Current Project State - Phase 9I Refresh

## Source Baseline

- Baseline: `origin/main = fdb1348c9cde598494c5670a8286c003dc8b44d1`
- Latest completed phase before this work: Phase 9H
- Phase 9I branch: `feat/ai-brain-audit-notes`

## Current Source Shape

AI Brain before Phase 9I:

- `POST /api/ai-brain/query` returned deterministic local evidence from existing AI Trader data.
- The query path was read-only for trading state and created no simulated orders, ledger rows, or risk decisions.
- Query responses were not persisted.
- AI Desk showed a live answer and evidence cards, but no audit history or operator notes.

Persistence pattern:

- Backend uses SQLModel `create_all` plus SQLite compatibility columns.
- New table models must be imported by `init_db()`.
- JSON snapshots are stored through SQLAlchemy `JSON` columns.

Runtime config before Phase 9I:

- `apps/frontend/public/runtime-config.js` was tracked and contained a stale backend URL.
- Docker production frontend overwrites runtime config at startup from environment values.
- Local Vite/browser smoke could be misdirected by the stale tracked fallback.

## Phase 9I State

Phase 9I adds:

- persisted AI Brain audit records
- persisted AI Brain operator note records
- history, detail, and notes APIs
- `audit_id` on AI Brain query responses
- AI Desk history/detail/note UI
- neutral tracked runtime-config fallback
- defensive UI guards for missing gate/review nested fields found during browser proof
- a data-URI favicon to prevent local smoke favicon 404 console noise
- tests and evidence docs

## Explicit Non-Implementation

Phase 9I does not add:

- autonomous loop
- scheduler or background trading
- signal-to-order automation
- proposal generation
- simulated order creation from AI Brain
- simulated order creation from notes
- broker adapter
- live broker execution
- external order routing
- real-money behavior
- cash-account behavior

## Runtime Config Hygiene

The tracked fallback now leaves runtime URLs blank:

- `apiBase: ""`
- `backendUrl: ""`
- `frontendUrl: ""`

The frontend client already ignores blank runtime-config API bases, so local Vite smoke uses the intended API base. Docker runtime config generation remains the production path.

## Known Limits

- AI Brain audit records are local paper/research evidence, not compliance-grade records.
- Operator notes are lightweight review metadata only.
- No archive endpoint was added in this slice.
- No old files were deleted.
- Docker restart proof was run for the newly added AI Brain audit/note tables and passed.

## Validation Refresh

- Backend compile: passed.
- Backend Phase 9I tests: `3 passed`.
- Backend Phase 9H + 9I combined tests: `6 passed`.
- Backend paper/risk/performance/availability/AI Brain suite: `21 passed`.
- Backend strategy/DSL/walk-forward/contract suite: `7 passed`.
- Frontend install/audit/build/tests: passed; audit `0 vulnerabilities`; build main chunk `464.48 kB`; full frontend `34 files / 215 tests`; focused gate `8 files / 103 tests`.
- Runtime/API/browser smoke: passed on isolated ports with AI Brain audit query, history/detail, notes, existing paper endpoints, Strategy, and Backtests OK.
- Browser UI proof: passed at `1440x900`, `1280x720`, and `390x844` with console/page/failed requests `0`, horizontal overflow `false`, and forbidden wording hits `0`.
- Backend-only Docker restart proof: passed; audit record and operator note persisted after restart.

## Next Recommendation

Before any future loop or proposal phase, use the AI Brain audit trail to verify operator questions, notes, degraded evidence, and zero-mutation proof across restarts.
