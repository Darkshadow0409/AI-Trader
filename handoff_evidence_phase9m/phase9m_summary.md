# Phase 9M Handoff Summary

## Summary

Phase 9M adds manual, proposal-only paper loop run-once evidence. The operator can explicitly allow proposal-only run-once, generate a bounded local proposal scan, and inspect runs, proposals, and safety events.

## API

- `POST /api/portfolio/paper-loop/allow-run-once-proposals`
- `POST /api/portfolio/paper-loop/run-once`
- `GET /api/portfolio/paper-loop/runs`
- `GET /api/portfolio/paper-loop/runs/{run_id}`
- `GET /api/portfolio/paper-loop/proposals`
- `GET /api/portfolio/paper-loop/safety-events`

## Zero-Mutation Contract

Run-once creates:

- 0 simulated orders
- 0 ledger rows
- 0 risk decisions

Allowed persisted evidence:

- paper loop run records
- paper loop proposal records
- paper loop safety-event records

## UI

Wallet Paper Loop Control now shows proposal-only run-once permission, generation controls, proposal table, safety-event table, scheduler-disabled label, and zero-mutation proof.

## Safety

No autonomous loop, scheduler, background worker, signal-to-order automation, simulated order creation, ledger mutation, risk-decision mutation, broker adapter, live broker execution, external routing, real-money behavior, cash-account behavior, OpenBB dependency, external network call, API key, or vendored external code was added.

## Dirty Worktree Safety

Dirty main was not used as source truth. The old dirty Phase 9H loop-control worktree was not inspected, copied from, reset, cleaned, stashed, deleted, or used as proof.
