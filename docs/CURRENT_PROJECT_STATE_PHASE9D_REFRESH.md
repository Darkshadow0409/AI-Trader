# Current Project State - Phase 9D Refresh

Source baseline: `origin/main` at `80fa5f68ca665b830cda582002288a52cb650143`.

Phase 9D adds paper-only wallet accounting primitives on top of the Phase 9B/9C research and backtest foundation. The implementation is manual simulation only: no scheduler, autonomous loop, live routing, or real-money behavior was added.

## Current Shape

- Existing paper trade/ticket flows remain separate and unchanged.
- Existing wallet balance route remains fixture-backed at `/api/portfolio/wallet-balance`.
- New paper wallet state is persisted in SQLModel tables and exposed under `/api/portfolio`.
- The frontend Wallet tab now shows paper wallet summary, recent immutable ledger rows, and simulated order records as read-only evidence.

## Safety Boundaries

- Paper-only simulation labels are visible in the Wallet UI.
- WTI/WTI_CTX are rejected as trader-facing paper order symbols.
- USOUSD remains the trader-facing oil paper symbol.
- XAGUSD remains the trader-facing silver paper symbol.
- No autonomous actions or scheduled trading were introduced.

## Validation Targets

- Backend paper wallet/ledger tests.
- Existing strategy/walk-forward/contract tests.
- Frontend audit, build, full tests, and focused Phase 8 gate.
- Isolated runtime smoke for wallet, strategy, and backtest routes.
