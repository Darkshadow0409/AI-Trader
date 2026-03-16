# Pilot Runbook

This platform is in pilot mode. The objective is to measure decision quality, operator discipline, and execution-readiness signals without placing live orders.

## Daily Workflow

1. Run `python scripts/seed_data.py` if you want a clean fixture-backed reset, or `python scripts/dev.py` if the local stack is not already running.
2. Open the web console and start from `Session / Review Queue`.
3. Review the top ribbon, degraded-source warnings, and the `Pilot Ops / Gate` tab before acting on any setup.
4. Check the `Watchlist / Opportunity Hunter` focus queue and confirm freshness, realism grade, and proxy warnings for any candidate asset.
5. Open signal detail and risk detail before creating or updating a trade ticket.
6. Use `Trade Tickets / Shadow` for checklist completion, approval, shadow monitoring, and manual fill capture.
7. Use `Active Trades` and `Journal / Trade Review` during the session to keep trade state, reviews, and adherence fields current.
8. End the day in `Session / Review Queue` and clear overdue review items where possible.

## Weekly Review Workflow

1. Open `Session / Review Queue` and inspect the weekly review summary first.
2. Review `Pilot Ops / Gate` for gate blockers, divergence hotspots, adapter health, and audit activity.
3. Review `Journal / Trade Review` for adherence trends, failure attribution, realism-warning violations, and review backlog.
4. Review `Strategy Lab` for promoted-strategy drift, promotion rationale changes, and forward-validation degradation.
5. Export a timestamped local report with `python scripts/pilot_export.py`.
6. Log a weekly conclusion: what improved, what regressed, and whether pilot status remains acceptable.

## What To Log Manually

- Why a ticket was approved, rejected, or overridden.
- Any manual fill details that differ from the modeled entry or exit assumptions.
- Whether realism or freshness warnings were consciously accepted.
- Why a trade was closed early, timed out, invalidated, or partially exited.
- Operator notes for repeated errors: timing, sizing, checklist bypass, or thesis drift.
- Any local environment issue affecting trust in the read-only adapter, alerts, or data freshness.

## What Metrics To Watch

- Ticket funnel: created, approved, shadow-active, manually executed.
- Shadow divergence rate and recurring divergence reasons.
- Manual-fill slippage variance versus modeled slippage.
- Review backlog and overdue review count.
- Adherence rate, invalidation discipline, and realism-warning violation rate.
- Promoted-strategy degradation rate and pilot execution-gate blockers.
- Adapter health status and any audit-log burst around checklist overrides or manual fill edits.

## Pilot Success Criteria

- Ticket approvals remain disciplined rather than bypass-driven.
- Shadow divergence stays low enough that the execution gate is not persistently blocked.
- Manual reconciliation drift is explainable and decreases over time.
- Review backlog stays manageable and reviews are completed close to when they are due.
- Realism warnings are usually respected rather than ignored.
- Promoted strategies remain stable in forward validation and paper outcomes.
- The execution gate can reach `pilot_running` or `execution_candidate` without relying on opinion-only exceptions.

## Pilot Failure Conditions

- Checklist overrides become routine rather than exceptional.
- Divergence hotspots or reconciliation drift repeatedly overwhelm the review queue.
- Operator adherence degrades and failure attribution clusters around timing, sizing, or realism neglect.
- Promoted strategies drift materially and stay degraded without timely demotion or review.
- Adapter health is unstable enough to reduce trust in monitoring.
- The execution gate remains blocked for long periods with the same unresolved causes.
