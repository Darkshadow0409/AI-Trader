# Current Project State - Phase 8p Refresh

## Truth Source
Clean source of truth remains `origin/main` / release tag commit:

`e23363884a62b7d0c602d8dc42a921cbc3c6d699`

The dirty local main checkout at `bffe2f5` is not source of truth and was not used for product work.

## Product Posture
AI Trader remains a browser-first, advisory-only commodities operator terminal for research, paper workflow, AI-assisted market analysis, review, and accountability. It is not a broker, not an execution platform, and not a fake-live dashboard.

Preserved guardrails:
- Advisory-only and review-first wording
- Truth/freshness honesty
- Backend-led chart truth
- REST plus `/ws/updates`
- Selected-asset truth
- Route-settle behavior
- Chart continuity
- Operator Brief evidence discipline
- `USOUSD` as trader-facing oil
- `WTI` / `WTI_CTX` as research-only context
- `XAGUSD` as trader-facing silver

## Phase 8p State
The UI layout stability repair is implemented in a clean worktree with a narrow frontend diff. It adds containment and wrapping for crowded shell/workspace surfaces and sanitizes backend-provided advisory notes before display so strict-gate wording cannot leak into visible runtime copy.

Validation passed:
- Audit clean
- Build passed
- Full tests passed
- Focused tests passed
- Existing browser smoke evidence passed across desktop, laptop, and narrow responsive viewports

## Pending Next Step
Prepare PR readiness for `fix/operator-ui-layout-stability` after the local Phase 8p commit, then perform PR diff verification before pushing or merging.
