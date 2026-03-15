# Service Ownership Map

`pipeline`
- Owns fixture or live-capable ingestion orchestration
- Owns bar, news, event, signal, and risk persistence refresh
- Owns pipeline timing summaries

`data_reality`
- Owns provenance assignment
- Owns freshness policy states
- Owns realism penalties and trust summaries

`operator_console`
- Owns dashboard-facing detail assembly
- Owns alert refresh orchestration across signals, opportunities, and stale-state warnings
- Owns legacy active-trade and journal note surfaces

`alerting`
- Owns alert dedupe, cooldown, sink fan-out, and delivery persistence
- Owns in-app, Telegram, and Discord notification-only sinks

`paper_trading`
- Owns paper-trade ledger, lifecycle transitions, review linkage, and outcome analytics
- Owns lifecycle-triggered alerts

`strategy_lab`
- Owns strategy specs, registry, backtest runs, promotion state, forward validation, and calibration

`journal`
- Owns free-form operator notes and structured paper-trade review write surface
