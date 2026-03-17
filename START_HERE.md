# Start Here

## One-click local launch

Windows Command Prompt / double-click:

```cmd
start_local.cmd
```

Windows PowerShell:

```powershell
.\start_local.ps1
```

This will:

- choose usable backend and frontend ports automatically
- wait for backend health
- start the frontend with the correct backend API URL
- open the browser automatically
- print the exact URLs to use

## Stop the local stack

```cmd
stop_local.cmd
```

or

```powershell
.\stop_local.ps1
```

## What to open first in the app

1. `Desk`
2. Check the top ribbon for source mode, freshness, and gate state
3. Open `Command Center`
4. Use the chart as the main surface, then move through `Signals`, `Tickets`, `Trades`, `Journal`, and `Pilot Ops`

## Logs

Launcher logs are written to:

- `data/local_runtime/backend.log`
- `data/local_runtime/frontend.log`
