# AI Trader User Manual

## What this system is

AI Trader is a local-first trading desk OS for research, signal review, paper trading, shadow workflow, strategy validation, and pilot-ops monitoring.

It is browser-first for normal daily usage.

It does **not** place real-money broker orders.

## Data-mode honesty

The UI can run in three visible market-data modes:

- `fixture`
- `public_live`
- `broker_live`

Current practical behavior in this repo:

- `BTC` and `ETH` can use the latest available public-live market data path.
- `WTI`, `gold`, `silver`, and some macro/news context can still degrade to proxy or fixture-backed context when no direct live source is wired.
- The UI should always label the current mode explicitly. Fixture data should never be treated as live market truth.

## One-click startup

Windows Command Prompt or double-click:

```cmd
start_local.cmd
```

Windows PowerShell:

```powershell
.\start_local.ps1
```

This starts:

- backend API
- frontend UI
- browser-first local stack

It also:

- picks safe local ports
- aligns frontend API base to the actual backend port
- opens the browser automatically unless `--no-open` is used

## Stop the stack

```cmd
stop_local.cmd
```

or

```powershell
.\stop_local.ps1
```

## URLs

The launcher prints the exact URLs to use.

Typical examples:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8015`
- health: `http://127.0.0.1:8015/api/health`

## What to do first in the browser

1. Open the printed frontend URL.
2. Start from `Signals` or `Desk`, depending on what you want to review first.
3. Check the top ribbon:
   - source mode
   - market-data mode
   - freshness
   - pipeline state
   - next event
4. Use the chart as the main working surface.
5. Open `Command Center` for safe operational actions.

## Main workflow

### 1. Signals

Use `Signals` to:

- inspect ranked setups
- see risk and freshness context
- move from signal to risk and ticket flow

### 2. Watchlist

Use `Watchlist` to:

- inspect focus assets
- compare price, freshness, realism, and setup tags
- load chart context quickly

### 3. Chart surface

The main chart supports:

- candlesticks
- volume
- crosshair
- OHLC hover context
- timeframe switching where data exists
- EMA 20 / 50 / 200
- RSI
- ATR
- signal, ticket, and trade overlays

Read the chart honesty cues:

- `fixture`
- `stale`
- `disconnected`
- `no data`
- `unusable`

These states mean the chart is for research/review context only, not live execution claims.

### 4. Trade Tickets

Use `Tickets` to:

- create or inspect draft tickets
- review checklist blockers
- inspect stop, target, and risk framing
- move toward shadow/manual paper workflow

### 5. Active Trades

Use `Trades` to:

- inspect open paper trades
- review projected stop loss and target profit
- track paper-account exposure

### 6. Journal and Review Queue

Use `Journal` and `Review Queue` to:

- complete structured reviews
- inspect adherence
- inspect invalidation discipline
- clear overdue review work

### 7. Strategy and Backtests

Use `Strategy` and `Backtests` to:

- inspect strategy lifecycle
- view promotion/validation posture
- inspect backtest outcome summaries
- review drawdown and trade-list context

### 8. Pilot Ops

Use `Pilot Ops` to:

- inspect execution gate state
- review blockers
- inspect divergence and adapter-health context

### 9. Command Center

Use `Command Center` for safe browser-first operations:

- refresh data
- run fast verify
- build review bundle
- pilot export
- contract snapshot save

No shell console is exposed in the browser.

## Paper-account framing

Default paper account size is:

- `10,000`

Key values shown in the UI:

- paper equity
- allocated capital
- open risk
- projected stop loss
- projected base/stretch target profit
- percent of account at risk

## Safe operating rules

- no real-money execution
- no broker order placement
- no autonomous trading
- no wallet/private-key trading actions

## Refresh and recovery

If data looks stale or disconnected:

1. Use `Refresh Data` in the workspace header or chart panel.
2. Use `Command Center` for a safe refresh.
3. If the stack itself is unhealthy, stop and restart it with:

```cmd
stop_local.cmd
start_local.cmd
```

## Verification commands

```powershell
python scripts/verify_fast.py
python scripts/verify.py
python scripts/build_review_bundle.py
```

## Troubleshooting

Check these logs:

- `data/local_runtime/backend.log`
- `data/local_runtime/frontend.log`

Useful direct checks:

- `GET /api/health`
- `GET /api/dashboard/overview`
- `GET /api/market/chart/BTC?timeframe=1d`
- `GET /api/watchlist/summary`

## Current limitations

- Public-live coverage is strongest for `BTC` and `ETH`.
- Commodity and macro context can still degrade to proxy or fixture-backed context.
- Browser-first usage is the intended daily path, but deep maintenance and milestone verification can still require terminal commands.
