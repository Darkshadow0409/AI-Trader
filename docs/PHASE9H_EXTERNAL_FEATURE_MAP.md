# Phase 9H External Feature Map

This document maps external repository patterns into AI Trader ideas. No external code was copied or vendored.

## Sources Reviewed

- AutoHedge: `https://github.com/The-Swarm-Corporation/AutoHedge`
- TradingAgents: `https://github.com/TauricResearch/TradingAgents`
- Paperclip: `https://github.com/Darkshadow0409/paperclip`
- OpenBB: `https://github.com/OpenBB-finance/OpenBB`
- Kalshi AI Trading Bot: `https://github.com/ryanfrigo/kalshi-ai-trading-bot`
- OpenAlice: `https://github.com/TraderAlice/OpenAlice`

Instagram links were not accessible enough for reliable strategy extraction in this environment. Screenshots or text are needed before any claim can be made about those posts.

## Mapping

### AutoHedge

Observed pattern: role-based agent pipeline with director/quant/risk/output stages, structured outputs, and logging.

AI Trader mapping:

- Use role summaries inside AI Brain evidence cards.
- Keep risk-first ordering.
- Do not adopt execution-agent behavior.
- Do not add wallet keys, venue adapters, or unattended order paths.

### TradingAgents

Observed pattern: analyst/researcher/risk debate model with structured roles and a portfolio-manager decision layer.

AI Trader mapping:

- Future AI Brain can show analyst, risk, strategy, and review perspectives as separate cards.
- Keep the debate as operator-visible evidence, not automatic order action.
- Preserve Phase 9B assumptions and Phase 9C contracts as hard evidence inputs.

### Paperclip

Observed pattern: agent/task dashboard, governance, budget controls, durable activity, and restart-safe context.

AI Trader mapping:

- Treat AI Brain as an operator cockpit with status, goals, evidence, and review queue visibility.
- Future loop work should use visible tasks/events instead of hidden background action.
- Add durable audit events before any later autonomous paper loop.

### OpenBB

Observed pattern: connect-once data layer consumed by Python, REST APIs, dashboards, and AI agents.

AI Trader mapping:

- Future market adapters should use a small interface and source labels rather than direct product dependency import in Phase 9H.
- Keep data truth and freshness labels visible in UI.
- Do not add OpenBB as a dependency in this pass.

### Kalshi AI Trading Bot

Observed pattern: health/status commands, SQLite telemetry, paper mode, risk knobs, and dashboards.

AI Trader mapping:

- Phase 9H availability status mirrors health/telemetry needs.
- Paper-only simulated state remains local and auditable.
- Future risk knobs should stay visible and bounded.
- Do not add Kalshi connectivity or real-market order behavior.

### OpenAlice

Observed pattern: approval-first trading workflow, guard pipeline, account snapshots, and separation between agent-facing tools and broker/account carrier.

AI Trader mapping:

- Preserve approval-first controls and guard gates.
- Keep AI Brain separated from any future order-creation path.
- Future paper loop should stage proposals before simulated orders.
- Do not add broker adapters or account carrier services in Phase 9H.

## Near-Term Product Direction

The quickest useful path is:

1. Keep Docker persistence and health visible.
2. Expand AI Brain cockpit evidence quality.
3. Add durable audit events for AI Brain questions and operator reviews.
4. Only later add disabled-by-default paper-loop controls, then run-once proposals, then risk-governed paper simulation.
