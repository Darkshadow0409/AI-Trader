# Phase 9D - Paper Wallet, Ledger, And Simulated Orders

## Summary

Phase 9D introduces deterministic paper-money accounting primitives before any autonomous paper loop exists. The slice is backend-first and exposes a paper wallet, append-only ledger transactions, and manual simulated orders through the existing portfolio API lane.

## Data Model

- `PaperWalletRecord`: default paper wallet with starting balance, cash, reserved cash, realized PnL, degraded unrealized PnL, equity, and status.
- `PaperLedgerTransactionRecord`: immutable transaction rows with sequence numbers, deltas, resulting balances, reason, audit reference, and assumption snapshot.
- `SimulatedOrderRecord`: manual paper simulation orders with side, type, status, fill details, fee/spread/slippage assumptions, source, and `paper_only=true`.

## API

- `GET /api/portfolio/paper-wallet`
- `GET /api/portfolio/paper-ledger`
- `GET /api/portfolio/simulated-orders`
- `POST /api/portfolio/simulated-orders`
- `POST /api/portfolio/simulated-orders/{id}/cancel`

## Accounting Invariants

- Cash equals starting balance plus ledger cash deltas.
- Reserved cash equals ledger reserved deltas.
- Filled buys write reserve, buy, and fee rows.
- Filled sells write sell and fee rows; inventory accounting remains a future phase.
- Rejections write a simulated order and an `order_rejected` ledger marker.
- Ledger rows are append-only by service behavior and marked immutable.

## Safety Boundaries

- Paper-only simulation only.
- No autonomous loop, scheduler, hidden actions, wallet automation, external order routing, or real-money behavior.
- WTI and WTI_CTX are research context only and rejected as trader-facing paper order symbols.
- USOUSD and XAGUSD remain valid trader-facing paper symbols.

## Frontend

The Wallet tab now renders:

- Paper wallet summary.
- Recent ledger rows.
- Simulated orders.
- Existing fixture wallet balances.

The UI is read-only and does not add order creation controls.

## Next Phase

Phase 9E should add risk-governed paper execution integration only after owner approval, likely by connecting strategy signals to manual/review-first simulated order proposals behind a visible pause/kill switch.
