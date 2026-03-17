# Run Local

Browser-first local usage guide for Windows / PowerShell.

## One-time setup

```powershell
pip install -r apps/backend/requirements.txt
Set-Location apps/frontend
npm install
Set-Location ../..
```

Optional:

```powershell
Copy-Item .env.example .env
```

The defaults are already local-first and fixture-safe:

- backend host: `127.0.0.1`
- backend port preference: `8000`, fallback `8001`, then `8010`
- frontend port preference: `5173`, then `5174`, then `5175`, then `5180`
- source mode: sample / fixture-first unless overridden

## Start the full stack

Preferred:

```powershell
python scripts/dev.py
```

Optional browser auto-open:

```powershell
python scripts/dev.py --open
```

This starts:

- backend API on the first usable local backend port
- frontend UI on the first usable local frontend port

The script now:

- checks backend ports in this order: `8000`, `8001`, `8010`
- checks frontend ports in this order: `5173`, `5174`, `5175`, `5180`
- prints the final usable frontend URL, backend URL, health URL, and frontend API base
- injects the actual backend API URL into the frontend so the browser app stays aligned with the chosen backend port
- opens the actual frontend URL when `--open` is used

## Start backend only

```powershell
python -m uvicorn app.main:app --app-dir apps/backend --host 127.0.0.1 --port 8000 --reload
```

If `8000` is blocked on your machine, use `8001` or `8010`.

## Start frontend only

```powershell
Set-Location apps/frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

If you start frontend separately, point it at the backend you actually chose:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8001/api"
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

## Reset fixture data

Clean fixture-backed reseed:

```powershell
python scripts/seed_data.py
```

Fixture backfill:

```powershell
python scripts/backfill.py
```

Normal daily use should prefer the in-app Command Center for refreshes after the stack is already running.

## What to open in the browser

Open:

- the exact `Frontend UI:` URL printed by `python scripts/dev.py`

Optional API checks:

- the exact `Health check:` URL printed by `python scripts/dev.py`
- `{backend_url}/api/dashboard/desk`
- `{backend_url}/api/system/control-center`

## What to click first

1. Open the app at the exact `Frontend UI:` URL printed by `python scripts/dev.py`
2. Start on `Desk`
3. Check the top ribbon:
   - source mode
   - freshness
   - pipeline status
   - review backlog
   - execution gate
4. Open `Command Center` from the workspace header
5. Confirm:
   - backend health
   - frontend runtime
   - last refresh
   - latest verify/export/bundle status
6. Return to `Desk` and use `Next Actions`

The `Desk` view also shows a compact onboarding card on first load. It points you to the main tabs and makes it explicit that the platform is paper-trading / pilot mode only.

## Browser-first day-to-day flow

1. `Desk`
   - triage backlog
   - inspect high-priority signals
   - review degraded sources
   - check open tickets and active trades
2. `Signals`
   - filter and inspect current candidates
   - open signal detail and linked risk
3. `Trade Tickets`
   - create or review tickets
   - complete checklist
   - approve only if gates are clear
   - use shadow mode and manual fill reconciliation here
4. `Active Trades`
   - update lifecycle state
   - inspect execution realism, timeline, and scenario stress
5. `Journal`
   - complete review fields
   - log adherence and failure attribution
6. `Session / Reviews`
   - clear overdue items
   - review daily briefing and weekly review summaries
7. `Pilot Ops`
   - check execution gate
   - inspect divergence hotspots, adapter health, and audit events
8. `Command Center`
   - use safe actions when needed:
     - refresh system
     - reset fixture data
     - pilot export
     - save contract snapshots
     - build review bundle
     - run fast verify

`Reset Fixture Data` is intentionally confirmation-gated because it reseeds the deterministic local fixture state.

## Daily commands that should still exist

These are still useful, but not required for normal app operation once the stack is running:

```powershell
python scripts/verify_fast.py
python scripts/verify.py
python scripts/pilot_export.py
python scripts/build_review_bundle.py
```

## Port overrides

If you want different ports, set them in `.env`:

```powershell
AI_TRADER_HOST=127.0.0.1
AI_TRADER_PORT=8000
AI_TRADER_FRONTEND_PORT=5173
```

Then restart `python scripts/dev.py`.

If you set explicit ports in `.env`, `dev.py` will try those exact ports rather than the default fallback sequence.

## Stopping the stack

Press `Ctrl+C` in the terminal running `python scripts/dev.py`.
