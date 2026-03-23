# Run Local

Browser-first local usage guide for Windows / PowerShell.

## Fastest start

Command Prompt or double-click:

```cmd
start_local.cmd
```

PowerShell:

```powershell
.\start_local.ps1
```

Stop the running local stack:

```cmd
stop_local.cmd
```

or

```powershell
.\stop_local.ps1
```

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

The defaults are already local-first and browser-first:

- backend host: `127.0.0.1`
- backend port preference: `8000`, fallback `8001`, then `8010`
- frontend port preference: `5173`, then `5174`, then `5175`, then `5180`
- source mode: public-live for supported market data paths unless overridden

Optional OpenAI OAuth for the AI Desk:

- set `AI_TRADER_OPENAI_OAUTH_CLIENT_ID`
- set `AI_TRADER_OPENAI_OAUTH_CLIENT_SECRET`
- register local callback URLs that match your launcher/backend ports, for example:
  - `http://127.0.0.1:8000/api/ai/oauth/callback`
  - `http://127.0.0.1:8001/api/ai/oauth/callback`
  - `http://127.0.0.1:8010/api/ai/oauth/callback`

The AI Desk remains usable without OAuth, but it will run local advisory summaries only until OpenAI is connected.

Important honesty rules:

- `BTC` and `ETH` use the latest available public-live market data path when upstream connectors are available.
- `WTI`, `gold`, `silver`, and macro-sensitive research context can still fall back to fixture/proxy context if no live source is wired for that instrument.
- The UI will still label `fixture`, `public_live`, or `broker_live` explicitly. It should never pretend fixture data is live.

## Start the full stack

Preferred:

```powershell
python scripts/dev.py
```

Optional browser auto-open:

```powershell
python scripts/dev.py --open
```

Optional no-open mode:

```powershell
python scripts/dev.py --no-open
```

This starts:

- backend API on the first usable local backend port
- frontend UI on the first usable local frontend port

The script now:

- checks backend ports in this order: `8000`, `8001`, `8010`, then `8011-8015`
- checks frontend ports in this order: `5173`, `5174`, `5175`, `5180`, then `5181-5184`
- retries the next backend/frontend candidate if a spawned process exits early or a port becomes unavailable between probing and launch
- normalizes Windows subprocess working directories to plain paths without the `\\?\` prefix
- launches the frontend with `npm --prefix <frontend_path>` so `npm.cmd` never falls back to `C:\Windows`
- waits for backend health first, then waits for `/api/dashboard/overview` before declaring the backend usable
- waits for the frontend URL before opening the browser
- prints the final usable frontend URL, backend URL, health URL, and frontend API base
- prints source mode and market-data mode once backend is healthy
- injects the actual backend API URL into the frontend so the browser app stays aligned with the chosen backend port
- opens the actual frontend URL when `--open` is used
- writes launcher logs to:
  - `data/local_runtime/backend.log`
  - `data/local_runtime/frontend.log`
- stores running stack metadata in:
  - `data/local_runtime/local_stack.json`

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

## Refresh latest available data

Once the stack is up, the browser should use the latest available data for the current mode automatically.

You can also force a safe backend refresh from:

- `Command Center` -> `Refresh Data`

or directly:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/system/refresh
```

If the launcher chose another backend port, replace `8000` with the printed backend URL.

## What to open in the browser

Open:

- the exact `Frontend UI:` URL printed by `python scripts/dev.py`

Optional API checks:

- the exact `Health check:` URL printed by `python scripts/dev.py`
- `{backend_url}/api/dashboard/desk`
- `{backend_url}/api/system/control-center`

## What to click first

1. Open the app at the exact `Frontend UI:` URL printed by the launcher
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

The fastest demo-safe path is:

1. `Desk`
2. `Command Center`
3. `Signals`
4. `Trade Tickets`
5. `Active Trades`
6. `Journal`
7. `Pilot Ops`

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

If `python scripts/dev.py` is running in a terminal, `Ctrl+C` stops both processes.

If you started the app through the one-click launcher, use:

```cmd
stop_local.cmd
```

or

```powershell
.\stop_local.ps1
```

## Troubleshooting

- If startup fails before the browser opens, check:
  - `data/local_runtime/backend.log`
  - `data/local_runtime/frontend.log`
- If backend health never comes up, the launcher exits with a clear failure message and leaves the log paths printed.
- If your preferred ports are busy, the launcher prints the exact fallback ports it used.
