# Phase 9K - AI Brain Evidence Review And Provider Readiness

## Baseline

- Source truth: `origin/main` at `a685bf6434ef61864a22ebccfc3f87370feabaf7`.
- Latest prior merge: Phase 9J, AI Brain market evidence adapters.
- Branch: `feat/evidence-review-provider-readiness`.
- Scope: paper/research evidence review only.

## Current Source Findings

- Market evidence providers were already represented by `MarketEvidenceProviderDescriptor`.
- Market evidence snapshots were already represented by `MarketEvidenceSnapshot`.
- AI Brain query audits were persisted in `AiBrainQueryRecord`.
- Operator notes were persisted in `AiBrainOperatorNoteRecord`.
- Phase 9J persisted market evidence snapshots on AI Brain audit details.
- Evidence-review metadata did not exist before Phase 9K.
- Provider readiness scoring/status did not exist before Phase 9K.
- The OpenBB provider was a disabled placeholder only.
- AI Desk displayed market evidence quality but did not expose an evidence-review workflow.
- Runtime config remained neutral after Phase 9I/9J; no runtime-config changes were required in Phase 9K.

## Implementation

Phase 9K adds `AiBrainEvidenceReviewRecord` for local paper/research review metadata attached to AI Brain audit records.

Fields include:

- `review_id`
- `ai_brain_query_id`
- `created_at`
- `updated_at`
- `review_status`
- `reviewer_label`
- `confidence_label`
- `evidence_quality_label`
- `provider_id`
- `symbol`
- `timeframe`
- `review_note`
- `follow_up_action`
- `paper_only`
- `archived`

The review API is intentionally small:

- `GET /api/ai-brain/history/{audit_id}/evidence-review`
- `POST /api/ai-brain/history/{audit_id}/evidence-review`

The POST endpoint is an upsert. This keeps review metadata easy to use from AI Desk without adding extra workflow complexity.

## Provider Readiness

Phase 9K adds:

- `MarketEvidenceProviderReadinessView`
- `GET /api/market-evidence/provider-readiness`

Readiness fields include:

- `provider_id`
- `display_name`
- `enabled`
- `configured`
- `readiness_status`
- `paper_research_only`
- `supported_symbols`
- `supported_timeframes`
- `latest_snapshot_status`
- `missing_requirements`
- `limitations`
- `next_setup_step`
- `external_dependency_required`
- `network_calls_enabled`
- `secrets_required`
- `execution_capable`

The local provider remains paper/research-only and `execution_capable=false`.

The OpenBB placeholder remains disabled, unconfigured, and descriptive only:

- no OpenBB dependency
- no API key
- no network call
- no vendored external code
- no execution capability

## AI Brain Integration

AI Brain query responses now include:

- `provider_readiness`
- `evidence_review`

AI Brain audit detail now includes:

- `provider_readiness_snapshot`
- `evidence_review`

Successful AI Brain queries still create exactly one audit record and zero simulated orders, zero ledger rows, and zero risk decisions.

## AI Desk UI

AI Desk now includes:

- provider readiness panel
- OpenBB disabled/not-configured placeholder display
- selected-audit evidence review status
- confidence and evidence-quality labels
- review note and follow-up action fields
- save evidence review action
- zero-mutation copy for evidence-review actions

No trade, proposal, run-once, broker, or loop controls were added.

## Validation

- Backend compile: passed.
- Phase 9K backend tests: 4 passed.
- Phase 9J backend tests: 5 passed.
- Phase 9I backend tests: 3 passed.
- Phase 9H + 9I backend tests: 6 passed.
- Paper/risk/performance/availability/AI Brain backend suite: 21 passed.
- Strategy/DSL/walk-forward/contract backend suite: 7 passed.
- `npm ci --prefix apps/frontend`: passed, 0 vulnerabilities.
- `npm audit --prefix apps/frontend`: 0 vulnerabilities.
- `npm run build --prefix apps/frontend`: passed, main chunk 469.36 kB, no Vite chunk warning.
- Full frontend tests: 34 files / 217 tests passed.
- Focused frontend gate: 8 files / 103 tests passed.
- Known jsdom ErrorBoundary `chart blew up` stack appeared, but the final full Vitest rerun exited 0.

## Runtime Proof

Isolated runtime:

- Backend: `127.0.0.1:19781`
- Frontend: `127.0.0.1:19782`
- SQLite path: `data/phase9k_runtime_smoke/ai_trader.db`

API proof:

- `/api/health` ok
- `/api/availability/status` ok
- `/api/market-evidence/providers` ok
- `/api/market-evidence/provider-readiness` ok
- provider readiness included `local_ai_trader_snapshot`
- provider readiness included `openbb_future_adapter`
- provider readiness reported `execution_capable=false`
- provider readiness created 0 simulated orders, 0 ledger rows, and 0 risk decisions
- `USOUSD` and `XAGUSD` snapshots returned degraded local evidence honestly
- `NOTREAL` returned unavailable evidence honestly
- AI Brain query returned an `audit_id`
- AI Brain query created exactly 1 audit record
- AI Brain query created 0 simulated orders, 0 ledger rows, and 0 risk decisions
- AI Brain audit detail contained market evidence and provider readiness data
- evidence review GET/POST worked for the selected audit
- evidence review created 0 simulated orders, 0 ledger rows, and 0 risk decisions
- paper wallet/ledger/orders/risk/performance/review endpoints remained ok
- strategies and backtests endpoints remained ok

Browser proof:

- System Chrome through Playwright.
- No runtime-config interception.
- Viewports: `1440x900`, `1280x720`, `390x844`.
- AI Desk / AI Brain Cockpit loaded.
- AI Brain query worked.
- query appeared in history.
- provider readiness panel rendered.
- OpenBB placeholder rendered disabled/not configured.
- selected-audit market evidence snapshot rendered.
- evidence review status rendered.
- evidence review form saved.
- selected-audit notes still worked.
- Wallet, Strategy Lab, and Backtests loaded.
- Console errors: 0.
- Page errors: 0.
- Failed requests: 0.
- HTTP errors: 0.
- Horizontal overflow: false.
- Forbidden wording hits: 0.

## Docker Restart Proof

Phase 9K adds a new persisted evidence-review table, so backend-only Docker restart proof was run.

- Isolated image: `ai-trader-phase9k-backend-smoke:local`.
- Isolated container: `ai-trader-phase9k-backend-smoke`.
- Isolated host data path: `data/phase9k_docker_smoke`.
- Health before restart: ok.
- Created one AI Brain audit record.
- Created one evidence review record.
- Restarted backend container.
- Health after restart: ok.
- Audit record persisted.
- Evidence review record persisted with status `accepted_for_research`.
- Isolated container and image were removed after proof.

## Safety Boundaries

Phase 9K does not add:

- autonomous loop
- loop controls
- scheduler
- background worker
- signal-to-order automation
- proposal generation
- simulated order creation from AI Brain
- simulated order creation from market evidence
- simulated order creation from review actions
- broker adapter
- live broker execution
- external order routing
- real-money behavior
- cash-account behavior
- OpenBB dependency
- external API keys
- external network calls
- vendored external code
- old-file deletion

## Cleanup Inventory

No old files were deleted. Potential future cleanup remains inventory-only:

- tracked Vite JS/DTS config mirrors can be reviewed in a separate hygiene pass if the team wants a clearer generated-file policy.
- older phase handoff folders are intentionally retained as audit evidence.

## Rollback

Before squash merge:

```bash
git revert <phase9k_local_commit>
```

After squash merge:

```bash
git revert <phase9k_squash_commit>
```

## Next Phase Recommendation

Keep the next phase focused on operator review quality or data-readiness hardening. Do not add loop controls, proposal generation, scheduler behavior, or simulated order creation until the review and provider-readiness lane remains stable after merge.
