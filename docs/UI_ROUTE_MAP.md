# UI Route Map

This frontend is a single-shell operator console. The main navigation is logical, not URL-heavy.

## Primary views

- `Desk`: aggregate operational summary from `/api/dashboard/desk` and `/api/system/control-center`
- `Signals`: ranked and high-risk signal browsing from `/api/signals` and `/api/signals/high-risk`
- `Hunter`: watchlist and opportunity queues from `/api/watchlist` and `/api/watchlist/opportunity-hunter`
- `Tickets`: ticket lifecycle, shadow mode, broker snapshot, and reconciliation from `/api/tickets`, `/api/tickets/shadow-mode`, and `/api/tickets/broker-snapshot`
- `Trades`: paper-trade detail, timeline, and stress from `/api/portfolio/paper-trades/*`
- `Journal`: reviews and decision-quality analytics from `/api/journal`, `/api/journal/paper-trade-reviews`, and `/api/portfolio/paper-trades/analytics`
- `Reviews`: session state, briefing, weekly review, and backlog from `/api/session/*`
- `Strategy` and `Backtests`: strategy registry and backtest runs from `/api/strategies` and `/api/backtests`
- `Replay`: replay frames and scenario stress from `/api/replay` and `/api/replay/scenario-stress`
- `Pilot Ops`: gate, adapter health, audit, and pilot metrics from `/api/session/pilot-dashboard`

## Cross-cutting detail panels

- Asset focus panel: `/api/dashboard/assets/{symbol}` and `/api/market/bars/{symbol}`
- Signal detail: `/api/signals/{signal_id}`
- Risk detail: `/api/risk/{risk_report_id}`
- Alert center: `/api/alerts`

## Keyboard affordances

- `/`: toggle command center
- `Alt+1` through `Alt+9`: jump to the first nine main navigation items
