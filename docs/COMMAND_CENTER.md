# Command Center

The command center is the safe in-app operational surface for routine desk actions.

## Supported actions

- `Refresh System`
  - triggers the normal local pipeline refresh path
  - intended for safe operator refreshes only

- `Trigger Pilot Export`
  - runs the existing pilot export workflow
  - intended to reduce routine terminal usage during pilot operations

## Visible status

- runtime status
- source mode
- pipeline status
- last refresh
- latest export timestamp and path
- latest review bundle timestamp and path
- frontend build timestamp
- diagnostics timestamp

## Non-goals

- no raw shell execution
- no dangerous cleanup actions
- no broker order placement
- no real-money execution
- no hidden operator override path
