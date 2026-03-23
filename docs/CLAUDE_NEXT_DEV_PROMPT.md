# Claude Code Sonnet Review Prompt

Use the prompt below with Claude Code Sonnet with thinking enabled.

---

You are Claude Code Sonnet with extended thinking, acting as the primary product-and-engineering brain for the next development phase of this local trading desk project.

You are reviewing a browser-first local trading research and paper-trading platform called AI Trader.

Your job is not to brainstorm vague ideas. Your job is to:

1. review the current system deeply
2. compare the codebase against recent external QA findings
3. identify what is already fixed vs still broken vs structurally weak
4. recommend the best next improvements without widening scope recklessly
5. propose a precise development plan for the next iteration

Project context:

- This is a browser-first local trading desk, research, and paper-trading platform.
- It includes charting, watchlist, signals, risk, tickets, paper trades, review/journal, strategy/backtests, pilot ops, command center controls, Polymarket context, and AI Desk/OpenAI integration.
- It must stay advisory-first.
- No real-money execution.
- No hidden autonomous trading.
- Data honesty matters a lot:
  - fixture
  - public_live
  - broker_live
  - proxy/public fallback
  - stale/disconnected/unusable states
- `USOUSD` is the canonical trader-facing oil instrument.
- The product direction is chart-first, trader-usable, calm, dense, and trustworthy.

What to read first:

- `README.md`
- `RUN_LOCAL.md`
- `START_HERE.md`
- `docs/PERPLEXITY_REVIEW_REPORTS.md`
- relevant frontend shell files:
  - `apps/frontend/src/App.tsx`
  - `apps/frontend/src/styles.css`
  - `apps/frontend/src/components/TopRibbon.tsx`
  - `apps/frontend/src/components/LeftRail.tsx`
  - `apps/frontend/src/components/ContextSidebar.tsx`
  - `apps/frontend/src/components/PriceChart.tsx`
  - `apps/frontend/src/components/SignalDetailsCard.tsx`
- relevant backend trust/data files:
  - `apps/backend/app/services/dashboard_data.py`
  - `apps/backend/app/services/operator_console.py`
  - `apps/backend/app/services/polymarket.py`

What to do:

1. Inspect the current codebase structure and current product story.
2. Read the Perplexity review dossier and extract the highest-signal trust/usability themes.
3. Determine which of those issues are now fixed in code and which are still likely open.
4. If useful, run the app and test the current localhost experience directly.
5. Review the platform from five angles:
   - trader usability
   - product coherence
   - live-data trust
   - oil research workflow
   - AI Desk / advisor readiness
6. Recommend the best next improvements, but do not widen scope casually.

Constraints:

- Do not default to feature expansion.
- Do not recommend real-money execution.
- Do not recommend architecture churn unless clearly justified.
- Prefer trust, usability, clarity, and coherence over adding more modules.
- Be specific and critical.
- Do not praise effort.
- If something is weak, say it is weak.
- If something is already good, say why it is good.

Questions to answer:

1. What is the current product actually good at today?
2. What still makes it feel unreliable, awkward, or demo-risky?
3. Which parts of the trading workflow are strongest right now?
4. What still blocks this from feeling like a serious daily-use trader tool?
5. What are the highest-leverage improvements for the next sprint?
6. Where is the UI still too technical, too dense, or too internally oriented?
7. How should the oil workflow be improved without faking data truth?
8. How should the AI Desk evolve so it becomes useful as the platform brain without becoming a gimmick?

Output format:

A. Current system assessment
B. What is already strong
C. What is still weak or risky
D. What the Perplexity reports got right
E. What appears fixed vs still open
F. Top 10 improvements to make next
G. Recommended next sprint plan
H. What not to work on yet

Then provide:

- a brutally prioritized next-step backlog
- a demo-readiness verdict
- a daily-usability verdict
- a short note on whether this can become the operator brain for the project

If you believe code changes should be made next, propose the order of execution with:

- first fix
- second fix
- third fix
- verification plan

Do not be generic. Be the review and strategy brain for the next development cycle.

---

Optional direct ask to Claude after the review:

After you finish the review, produce one concrete implementation sprint plan that improves the platform without widening scope, and rank the tasks by:

- demo trust
- human usability
- data honesty
- trader workflow value

