# Pilot Checklist

## Daily Open

- Confirm the app is running in the intended local mode.
- Check the top ribbon for source mode, pipeline status, and stale-data warnings.
- Review `Pilot Ops / Gate` for current gate status and blockers.
- Review degraded-source warnings on focus assets.
- Review open review tasks and stale open trades.
- Confirm no unresolved adapter health failure is affecting monitoring.

## Pre-Ticket Review

- Open signal detail and confirm the thesis still holds.
- Check the linked risk report and stop or size assumptions.
- Confirm freshness is acceptable for the intended horizon.
- Confirm realism grade and tradable-alignment warnings are acceptable.
- Check cluster exposure and overall risk budget.
- Complete the ticket checklist fields before approval.
- Record any override reason in notes if a gate is bypassed.

## Post-Session Review

- Update all active paper trades that changed state.
- Capture any manual fills and reconcile them against the modeled plan.
- Complete or advance post-trade reviews that became due.
- Note realism-warning violations, invalidation breaches, or time-stop misses.
- Review alerts that were useful, ignored, or noisy.
- Clear obvious backlog items or explicitly defer them with notes.

## Weekly Review

- Review weekly outcome summaries by family, asset, realism, and freshness.
- Review adherence trend and failure-attribution drift.
- Review divergence hotspots and manual reconciliation backlog.
- Review promoted-strategy degradation and promotion rationale changes.
- Export the current pilot report with `python scripts/pilot_export.py`.
- Write one short weekly conclusion covering:
  - what is improving
  - what is degrading
  - whether pilot conditions still justify continuing
