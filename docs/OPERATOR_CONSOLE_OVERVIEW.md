# Operator Console Overview

The web UI is now the primary daily operating surface for the platform.

## Shell layout

- Top ribbon: macro regime, freshness, risk budget, pipeline health, review queue, and pilot gate.
- Left rail: persistent navigation, gate state, backlog counts, focus watchlist, and scout queue.
- Center workspace: the active operator view plus a fixed asset focus strip for chart and signal detail.
- Right context rail: macro context, risk context, data reality, related news, and alert center.

## Design intent

- Dense, dark, terminal-like presentation.
- Warnings are visually stronger than neutral information.
- Current work, stale data, degraded sources, and overdue review items are intentionally promoted.
- The browser should cover normal operator tasks without dropping into terminal commands.

## Main workflow

1. Start on `Desk` for what-matters-now.
2. Drill into `Signals` or `Hunter`.
3. Open linked risk and create or review `Tickets`.
4. Manage `Trades`, then complete `Journal` review.
5. Use `Replay`, `Pilot Ops`, and `Reviews` for validation and operational follow-up.

## Safe in-app controls

The command center exposes only bounded operator actions:

- refresh system
- trigger pilot export
- inspect source mode
- inspect pipeline and runtime status
- inspect latest export, bundle, and build timestamps

It does not expose raw shell execution, broker routing, or destructive actions.
