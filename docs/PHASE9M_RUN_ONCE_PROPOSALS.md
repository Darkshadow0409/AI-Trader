# Phase 9M - Manual Run-Once Proposal Evidence

## Baseline

Phase 9M starts from `origin/main` at `499aeb2d5c971f22cf2bd674a8402f2da6ebfda7`, after Phase 9L added disabled-by-default paper loop control state and events.

## Scope

Phase 9M adds a manual, operator-triggered, proposal-only run-once layer. It persists run, proposal, and safety-event evidence so an operator can inspect what a future loop candidate would have seen.

It does not create simulated orders, ledger entries, risk decisions, broker actions, or recurring work.

## Data Model

New persisted records:

- `PaperLoopRunRecord`: bounded manual run metadata, control-state snapshot, proposal count, safety-event count, and summary JSON.
- `PaperLoopProposalRecord`: proposal evidence for a symbol/timeframe, local evidence snapshots, gate result, and `simulated_order_id=null`.
- `PaperLoopSafetyEventRecord`: fail-closed and proposal-gate evidence for blocked, degraded, or skipped states.

## API

New endpoints:

- `POST /api/portfolio/paper-loop/allow-run-once-proposals`
- `POST /api/portfolio/paper-loop/run-once`
- `GET /api/portfolio/paper-loop/runs`
- `GET /api/portfolio/paper-loop/runs/{run_id}`
- `GET /api/portfolio/paper-loop/proposals`
- `GET /api/portfolio/paper-loop/safety-events`

Still absent:

- `/api/portfolio/paper-loop/cycles`
- proposal accept endpoints
- proposal execute endpoints
- scheduler endpoints

## Gates

Manual run-once requires:

- loop control state is `enabled`
- explicit run-once confirmation
- explicit operator permission via `allow-run-once-proposals`
- `run_once_allowed=true`
- `scheduler_allowed=false`
- supported trader-facing symbol

Blocked states create fail-closed run/safety-event evidence. Research-only symbols such as `WTI` and `WTI_CTX` create rejected proposal evidence and safety events.

## Evidence Sources

Phase 9M uses local, read-only evidence only:

- market evidence snapshots
- strategy contract metadata when available
- backtest assumption metadata when available
- latest local signal metadata when available

Missing or degraded evidence creates skipped/unavailable proposals instead of creating an order.

## UI

The Wallet Paper Loop Control panel now includes a manual proposal-only section:

- explicit permission control
- symbol/timeframe/max candidate inputs
- explicit generation confirmation
- proposal table
- safety-event table
- zero-mutation proof line
- scheduler-disabled and paper/research-only labels

No accept, execute, order, broker, cycle, or recurring controls are shown.

## Safety

Phase 9M is paper/research only. It adds no autonomous loop, scheduler, background worker, signal-to-order automation, simulated order creation, ledger mutation, risk-decision mutation, broker adapter, live broker execution, external routing, real-money behavior, cash-account behavior, OpenBB dependency, external network calls, API keys, or vendored external code.

## Cleanup Inventory

No old files were deleted. The old dirty Phase 9H loop-control worktree was not inspected or used.

## Next Recommendation

Phase 9N should review proposal evidence quality and operator approval requirements before any simulated-order conversion is considered.
