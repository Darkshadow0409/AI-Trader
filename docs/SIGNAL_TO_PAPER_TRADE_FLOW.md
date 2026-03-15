# Signal To Paper Trade Flow

1. Bars and macro context are refreshed by `pipeline`.
2. `feature_pipeline` produces the feature frame.
3. `signal_pipeline` emits ranked signals with uncertainty and realism metadata.
4. `risk_pipeline` attaches stop logic, size bands, and scenario shocks.
5. `alerting` publishes notification-only signal and risk context alerts.
6. The operator proposes a paper trade from signal and risk context in the web UI.
7. `paper_trading` tracks lifecycle changes, outcome attribution, and structured review.
8. Paper-trade analytics feed empirical summaries back into operator review and strategy promotion decisions.
