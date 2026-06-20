# Phase 9G Autonomous Paper Loop Readiness

## Summary

Phase 9G is a design and readiness checkpoint only. It does not implement a loop, scheduler, background trading path, signal-to-order automation, broker adapter, outside order route, cash account behavior, or real-funds behavior.

The future loop must be paper-only, disabled by default, operator-controlled, risk-governed, bounded per cycle, review-visible, and unable to create hidden activity.

## Current Implementation Baseline

- Source of truth: `origin/main`
- Baseline commit: `bb38d9dca49f78c769c5e9ea79906b29ce665d53`
- Latest merged phase: Phase 9F, paper performance and review visibility
- Branch: `docs/autonomous-paper-loop-readiness`

## Current Source Shape

### Signals

Signals are persisted as `SignalRecord` rows with symbol, type, timestamp, direction, score, thesis, uncertainty, data quality, and feature JSON. Signal APIs expose list, high-risk, summary, and detail views. Current signal flow is operator-facing and research/review oriented; it does not convert signals into orders.

### Strategies And Backtests

Phase 9B made backtest assumptions and validation metadata explicit. Phase 9C made strategy contracts explicit, deterministic, versioned, and hashable. Strategy contracts expose allowed symbols, research-only symbols, required assumptions, lookahead policy, candle-fill compatibility, warmup bars, parameter defaults, parameter bounds, and forbidden inputs.

Deterministic baseline strategies produce shifted Entry/Exit frames to avoid same-bar future data. Backtests expose assumptions, validation metadata, metrics audit, and degraded legacy reconstruction where needed.

### Paper Wallet, Ledger, And Orders

Phase 9D added `PaperWalletRecord`, append-only `PaperLedgerTransactionRecord`, and `SimulatedOrderRecord`. Manual simulated orders write wallet/ledger/order evidence. Rejections still write auditable order and ledger markers.

### Paper Risk Governor

Phase 9E added `PaperRiskPolicyRecord` and `PaperRiskDecisionRecord`. The risk governor checks wallet and policy status, trader-facing symbols, required assumption snapshots, strategy contract presence where supplied, quantity and price validity, max notional, open orders, cash buffer, loss/drawdown limits, and exposure caps.

### Paper Performance And Review

Phase 9F added read-only paper performance summary, ledger-derived equity curve, rejection analysis, and generated paper review queue views. The current queue is derived from risk decisions and risk policy state. It does not persist acknowledge/resolve actions.

### Frontend Controls

Wallet shows paper wallet, ledger, simulated orders, risk policy, risk decisions, paper performance, equity curve, rejection analysis, and generated review queue. Strategy Lab shows strategy contract details. Backtests show assumptions and validation. No loop controls exist today.

### Current Absences

- No `paper-loop` routes.
- No loop models.
- No loop service.
- No signal-to-order path.
- No loop scheduler job.
- No hidden worker for paper orders.
- Existing app scheduler is limited to existing app refresh behavior and is not wired to a paper loop.

## Loop Boundary

The future loop must satisfy all of these before implementation:

- Paper-only.
- Disabled by default.
- Operator enablement required.
- Operator pause, resume, and kill controls required.
- No broker adapter use.
- No outside order route.
- No cash account behavior.
- No real-funds behavior.
- No hidden cycle execution.
- No scheduler until a later explicit phase after controls and tests pass.
- No direct signal-to-order conversion without proposal, risk decision, and review evidence.

## Proposed Future Data Model

Design only; not implemented in Phase 9G.

### PaperLoopControlState

- `control_id`
- `schema_version`
- `status`: `disabled`, `enabled`, `paused`, `killed`
- `enabled_by`
- `enabled_at`
- `paused_by`
- `paused_at`
- `pause_reason`
- `killed_by`
- `killed_at`
- `kill_reason`
- `run_once_allowed`
- `scheduler_allowed`
- `paper_only`
- `updated_at`

### PaperLoopRun

- `run_id`
- `control_id`
- `mode`: `manual_run_once`, `bounded_scheduler`
- `status`: `created`, `running`, `completed`, `failed_closed`, `killed`
- `started_at`
- `completed_at`
- `cycle_limit`
- `created_by`
- `paper_only`
- `summary_json`

### PaperLoopCycle

- `cycle_id`
- `run_id`
- `sequence_number`
- `status`: `created`, `evaluating`, `completed`, `failed_closed`, `skipped`
- `started_at`
- `completed_at`
- `candidate_count`
- `proposal_count`
- `accepted_count`
- `rejected_count`
- `safety_event_count`
- `paper_only`
- `notes`

### PaperLoopCandidateSignal

- `candidate_id`
- `cycle_id`
- `signal_id`
- `symbol`
- `strategy_key`
- `score`
- `direction`
- `data_quality`
- `selected`
- `selection_reason`
- `rejection_reason`
- `paper_only`

### PaperLoopOrderProposal

- `proposal_id`
- `cycle_id`
- `candidate_id`
- `wallet_id`
- `strategy_key`
- `symbol`
- `side`
- `order_type`
- `quantity`
- `requested_price`
- `assumption_snapshot`
- `strategy_contract_snapshot`
- `risk_decision_id`
- `simulated_order_id`
- `status`: `proposed`, `risk_rejected`, `simulated_order_created`, `skipped`, `failed_closed`
- `paper_only`

### PaperLoopSafetyEvent

- `event_id`
- `cycle_id`
- `proposal_id`
- `severity`: `info`, `warning`, `critical`
- `event_type`
- `reason_code`
- `message`
- `snapshot_json`
- `created_at`
- `paper_only`

## Proposed Future API

Design only; not implemented in Phase 9G.

- `GET /api/portfolio/paper-loop/status`
- `POST /api/portfolio/paper-loop/enable`
- `POST /api/portfolio/paper-loop/disable`
- `POST /api/portfolio/paper-loop/pause`
- `POST /api/portfolio/paper-loop/resume`
- `POST /api/portfolio/paper-loop/kill`
- `POST /api/portfolio/paper-loop/run-once`
- `GET /api/portfolio/paper-loop/cycles`
- `GET /api/portfolio/paper-loop/proposals`

## Required Future Operator Controls

- Visible disabled state.
- Explicit enable confirmation.
- Pause control.
- Resume control.
- Kill switch.
- Manual run-once trigger.
- Recent cycle status.
- Risk rejection visibility.
- Review queue visibility.
- Paper-only simulation labels.
- Assumption snapshot display.
- Strategy contract snapshot display.
- Per-cycle bounded result counts.

## Future Loop Cycle Design

1. Confirm loop is enabled, not paused, and not killed.
2. Confirm wallet is active.
3. Confirm paper risk policy is active.
4. Load strategy contracts.
5. Load latest signal candidates.
6. Validate Phase 9B assumptions.
7. Validate Phase 9C strategy contracts.
8. Create an order proposal, not a direct order.
9. Check trader-facing symbol discipline.
10. Call the Phase 9E risk governor.
11. If rejected, store proposal rejection and safety/review evidence.
12. If accepted, create a Phase 9D simulated paper order.
13. Append ledger, risk, and performance evidence.
14. Surface review queue items through the Phase 9F evidence flow.
15. Stop after the bounded cycle.

## Required Hard Gates Before Implementation

- API health ok.
- Wallet active.
- Risk policy active.
- Operator enabled loop state.
- Kill switch not active.
- Strategy contract deterministic.
- Assumption snapshot complete.
- Symbol trader-facing and allowed.
- WTI and WTI context cannot become trader-facing orders.
- Max notional, cash, open-order, loss, drawdown, and exposure limits passed.
- Review queue working.
- Kill switch tested.
- No hidden scheduler.
- Browser scan free of forbidden readiness or funds-routing copy.

## Failure Behavior

- Fail closed.
- Create a safety event.
- Do not create a simulated order on ambiguous state.
- Do not retry inside a hidden loop.
- Show rejected proposals.
- Show missing assumptions.
- Show research-only symbol attempts.
- Show paused/killed state.
- A killed loop cannot resume without explicit operator action.

## Later Implementation Plan

### Phase 9H: Control State And UI Controls

Add control-state storage, status API, and visible controls. Keep order creation disabled. Tests should prove default disabled state, enable confirmation, pause/resume/kill behavior, and no simulated orders created by controls alone.

### Phase 9I: Run-Once Proposal Generator

Add a manual run-once proposal generator. It may create proposals and safety events, but not simulated orders. Tests should prove candidates, proposals, assumptions, contracts, and symbol discipline are visible.

### Phase 9J: Risk-Governed Run-Once Simulated Order Creation

Allow manual run-once to create simulated paper orders only after risk governor acceptance. Tests must prove accepted and rejected paths, audit events, ledger invariants, and review queue visibility.

### Phase 9K: Disabled-By-Default Bounded Scheduler

Only after 9H-9J pass, add a bounded scheduler that remains disabled by default and can run only with explicit operator state. Tests must prove kill, pause, failed health, and ambiguous state all stop the loop.

## Future Test Plan

Backend tests:

- Default control state is disabled.
- Enable requires explicit confirmation.
- Pause and kill block cycles.
- Run-once creates proposals before any order.
- Missing assumptions fail closed.
- Non-deterministic or missing strategy contract fails closed.
- WTI and WTI context are rejected as trader-facing order symbols.
- Risk governor rejection prevents simulated order creation.
- Accepted risk decision can create one bounded simulated order.
- Safety events are created for every failed gate.
- Killed loop cannot resume without explicit operator action.

Frontend tests:

- Wallet/loop panel shows disabled state.
- Enable confirmation copy is paper-only.
- Pause/resume/kill controls render safely.
- Proposal, rejection, and safety-event rows render.
- Review queue remains visible.
- No forbidden readiness or funds-routing copy appears.

Runtime and browser proof:

- API health ok.
- Status endpoint reports disabled by default.
- Run-once fails closed while disabled.
- Wallet, Strategy Lab, Backtests, and loop panel load at `1440x900`, `1280x720`, and `390x844`.
- Console errors `0`.
- Page errors `0`.
- Failed requests `0`.
- Horizontal overflow `false`.
- Forbidden wording absent.

Rollback:

- Revert only the loop-phase commit.
- Do not touch dirty main.
- Do not delete worktrees or branches unless explicitly requested.
