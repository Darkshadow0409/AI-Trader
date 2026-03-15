# Entity Relationships

Primary entity chain:

- `SignalRecord`
- `RiskReport`
- `AlertRecord`
- `PaperTradeRecord`
- `PaperTradeReviewRecord`
- `ForwardValidationRecord`
- `StrategyRegistryEntry`

Important links:

- one signal can have one or more alerts
- one signal can map to one current risk report
- one paper trade can link to one signal and one risk report
- one paper-trade review links to exactly one paper trade
- forward validation records can reference strategy, signal, risk report, and trade identifiers
- strategy promotion state is summarized from backtests, calibration, forward validation, and realism penalties
