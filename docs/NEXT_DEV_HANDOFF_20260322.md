# AI Trader Next-Development Handoff

Date: 22 Mar 2026  
Repo: `C:\Users\sajal\OneDrive\Desktop\code\AI Trader`

## 1. Which model to use next

If you will use only one model for the next development cycle, use **GPT-5.4 thinking**.

Why:

- it is the better choice for continuing a long in-repo implementation thread
- it is stronger for incremental bug-fix execution, regression-safe edits, and test-driven continuation
- this project already has a deep implementation history oriented around repeated code/test/verify loops

Use **Claude Sonnet 4.6 thinking** as a second reviewer, planner, and product critic when you want:

- a strong UX/product critique
- a second opinion on scope control
- a review of what still feels awkward or demo-risky

Best workflow:

1. use `GPT-5.4 thinking` as the primary build/fix agent
2. use `Claude Sonnet 4.6 thinking` after each sprint for review, prioritization, and next-step planning

If you insist on using only Claude next, it can still work, but the best split is:

- `GPT-5.4 thinking` = implementation brain
- `Claude Sonnet 4.6 thinking` = review brain

## 2. Product summary

AI Trader is a browser-first local trading desk / research / paper-trading platform.

Current product story:

- chart-first trading and research shell
- advisory-only
- no real-money execution
- no broker order placement
- strong data-honesty emphasis:
  - `fixture`
  - `public_live`
  - `broker_live`
  - `proxy/public fallback`
  - `stale`
  - `disconnected`
  - `unusable`
- includes:
  - Desk
  - watchlist
  - chart
  - signals
  - risk context
  - tickets
  - trades
  - journal/review
  - strategy/backtests
  - pilot ops
  - command center
  - Polymarket context
  - AI Desk

Oil direction:

- `USOUSD` is the canonical trader-facing oil instrument
- `WTI` remains research/underlying context
- the UI should never fake tradable oil truth if only proxy-grade context exists

## 3. Current live stack

Current launcher state from `data/local_runtime/local_stack.json`:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8000`
- health: `http://127.0.0.1:8000/api/health`
- frontend API base: `http://127.0.0.1:8000/api`
- source mode: `live`
- market data mode: `public_live`

Current sanity check at handoff time:

- frontend root returned `200`
- backend health returned `200`

## 4. Important artifacts already added for review

Read these first:

- `README.md`
- `RUN_LOCAL.md`
- `START_HERE.md`
- `docs/PERPLEXITY_REVIEW_REPORTS.md`
- `docs/CLAUDE_NEXT_DEV_PROMPT.md`

Useful generated artifact:

- `ai_trader_compact_source_20260322.zip`

## 5. Main work completed so far

The repo has already gone through several trust-repair and usability passes. The important completed work includes:

### Launcher and local reliability

- detached/silent local startup on Windows
- cleaner stale-process handling
- backend readiness and startup reliability improvements
- live local stack metadata in `data/local_runtime/local_stack.json`

### Demo trust and shell coherence

- duplicate alert suppression improvements
- gate/blocker consistency work
- next-event future-only logic
- disabled timeframe controls with honesty states
- chart stale / fixture / disconnected overlays
- signal detail rendering cleanup
- asset-specific Polymarket relevance improvements
- fixture differentiation improvements
- browser-side refresh action

### Human-usability repair

- AI Desk no longer leads with raw fetch dumps
- `Data Mode` and `Feed Source` were separated in the ribbon
- gate labels were translated in many places
- Polymarket context filtering was tightened
- `USOUSD` is the visible oil symbol
- oil proxy/no-live-price honesty states were added
- more explicit stale/degraded chart warnings

### AI Desk / advisory work

- AI Desk UI exists
- backend AI routes exist
- advisory service exists
- OpenAI OAuth backend plumbing was added
- OAuth is implemented in code, but live auth depends on real user credentials/configuration

## 6. Latest external review themes

The Perplexity-style reviews repeatedly found these issues:

- first screen too metadata-heavy
- nav switches not scrolling the user to the real workspace
- stale/live/freshness contradictions
- alert center showing internal or noisy content
- Polymarket relevance/noise problems
- raw/internal IDs leaking into operator UI
- oil usability gaps
- AI Desk raw-error leakage

Many of those were fixed partially or fully. Some remained partially live in the last external verification pass.

## 7. Latest known open or partially-open issues

This is the most important section for the next development thread.

Based on the last QA loops and the repo state, the likely remaining issues to verify or continue fixing are:

### P0 / P1 likely still worth checking first

1. **Above-the-fold entry experience**
   - verify the app really lands on a usable Desk/operator surface
   - earlier reports still saw too much metadata before the real workspace

2. **Nav scroll-to-workspace behavior**
   - verify every tab change visibly lands on the active operator workspace
   - this was one of the most repeatedly reported human-usability failures

3. **Freshness truth consistency**
   - make sure the same app is not simultaneously saying:
     - market stale
     - signal fresh
     - system refresh fresh
   - the wording needs to remain semantically distinct and trader-readable

4. **Polymarket standalone tab usefulness**
   - context-rail relevance improved
   - standalone Polymarket view still may be empty or visually weak in some states

5. **Remaining internal language leakage**
   - check for any remaining raw refs, raw tags, or internal system tokens in user-facing panels

6. **Oil workflow**
   - verify `USOUSD` watchlist click path, chart load state, proxy labeling, and related research context all remain coherent

### Secondary but still important

7. **AI Desk usability after auth is configured**
   - once OAuth credentials exist, test the real connect flow
   - keep the advisory-only framing clear

8. **Right rail clarity**
   - ensure alert grouping, context grouping, and stale states remain understandable over time

9. **Watchlist scanability**
   - confirm cards are truly easy to scan, not just technically improved

10. **Demo narrative coherence**
   - verify the first 2-3 minutes of use feel calm, guided, and trustworthy

## 8. Important code areas

These are the highest-signal files for the next agent to inspect:

### Frontend shell

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/styles.css`
- `apps/frontend/src/components/TopRibbon.tsx`
- `apps/frontend/src/components/LeftRail.tsx`
- `apps/frontend/src/components/ContextSidebar.tsx`
- `apps/frontend/src/components/PriceChart.tsx`
- `apps/frontend/src/components/SignalDetailsCard.tsx`

### Frontend tabs

- `apps/frontend/src/tabs/DeskTab.tsx`
- `apps/frontend/src/tabs/PilotDashboardTab.tsx`
- `apps/frontend/src/tabs/PolymarketHunterTab.tsx`
- `apps/frontend/src/tabs/AIDeskTab.tsx`
- `apps/frontend/src/tabs/TradeTicketsTab.tsx`
- `apps/frontend/src/tabs/JournalTab.tsx`
- `apps/frontend/src/tabs/StrategyLabTab.tsx`

### Frontend data layer

- `apps/frontend/src/api/client.ts`
- `apps/frontend/src/api/hooks.ts`
- `apps/frontend/src/types/api.ts`
- `apps/frontend/src/lib/time.ts`
- `apps/frontend/src/lib/uiLabels.ts`

### Backend trust/data logic

- `apps/backend/app/services/dashboard_data.py`
- `apps/backend/app/services/operator_console.py`
- `apps/backend/app/services/polymarket.py`
- `apps/backend/app/services/market_identity.py`
- `apps/backend/app/services/market_views.py`
- `apps/backend/app/services/ai_advisor.py`
- `apps/backend/app/services/openai_oauth.py`

### Backend routes/contracts

- `apps/backend/app/api/routes/ai.py`
- `apps/backend/app/models/schemas.py`
- `apps/backend/app/main.py`
- `apps/backend/app/core/settings.py`

### Launcher

- `scripts/dev.py`
- `start_local.cmd`
- `start_local.ps1`
- `stop_local.cmd`
- `stop_local.ps1`

## 9. Current working-tree context

This repo is not clean. There are many modified files in:

- frontend shell/components/tabs
- backend services/tests
- launcher/runtime scripts
- docs and runtime artifacts

Important rule for the next agent:

- do **not** reset or discard the worktree
- assume current uncommitted changes are intentional and part of the active development state
- work forward from the existing state

## 10. Latest known verification state

Latest known successful checks from the recent development passes:

- backend suite: `python -m pytest apps/backend/tests -q` -> passed in the latest full run
- frontend tests: `cd apps/frontend && npm run test -- --run` -> passed in the latest full run
- frontend build: `cd apps/frontend && npm run build` -> passed
- `python scripts/verify_fast.py` -> passed

Be careful:

- `python scripts/verify.py` has historically been more fragile because it is a longer wrapper run
- do not assume a wrapper timeout means the product code failed

## 11. Exact commands for the next agent

### Start local

```powershell
start_local.cmd
```

### Stop local

```powershell
stop_local.cmd
```

### Backend tests

```powershell
python -m pytest apps/backend/tests -q
```

### Frontend tests

```powershell
Set-Location apps/frontend
npm run test -- --run
npm run build
Set-Location ../..
```

### Fast verification

```powershell
python scripts/verify_fast.py
```

## 12. Recommended next-sprint order

If the next model is going to continue development immediately, it should do work in this order:

1. run the app locally and verify the live browser behavior before changing code
2. test the first 30 seconds of usability:
   - above-the-fold layout
   - nav scroll behavior
   - Desk entry path
3. test oil path:
   - click `USOUSD`
   - verify watchlist routing, chart state, proxy honesty, context behavior
4. test freshness truth:
   - ribbon
   - chart
   - right rail
   - signal detail
5. test Polymarket:
   - context rail
   - standalone tab
6. fix only the highest-trust failures that are visibly still live
7. rerun targeted tests
8. rerun broad verification

## 13. Paste-ready prompt for a new GPT-5.4 thinking chat

Use this if you want GPT-5.4 thinking to continue development directly:

---

You are GPT-5.4 thinking acting as the primary implementation brain for this repo.

Repo:
`C:\Users\sajal\OneDrive\Desktop\code\AI Trader`

Project:
AI Trader is a browser-first local trading desk / research / paper-trading platform.

Core constraints:

- advisory-only
- no real-money execution
- no broker order placement
- preserve the existing product story
- prioritize trust, usability, clarity, and demo safety over feature expansion
- `USOUSD` is the canonical trader-facing oil instrument
- preserve honesty around:
  - `fixture`
  - `public_live`
  - `broker_live`
  - `proxy/public fallback`
  - `stale`
  - `disconnected`
  - `unusable`

Read first:

- `README.md`
- `RUN_LOCAL.md`
- `START_HERE.md`
- `docs/PERPLEXITY_REVIEW_REPORTS.md`
- `docs/CLAUDE_NEXT_DEV_PROMPT.md`
- `docs/NEXT_DEV_HANDOFF_20260322.md`

Then inspect these code areas first:

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/styles.css`
- `apps/frontend/src/components/TopRibbon.tsx`
- `apps/frontend/src/components/LeftRail.tsx`
- `apps/frontend/src/components/ContextSidebar.tsx`
- `apps/frontend/src/components/PriceChart.tsx`
- `apps/frontend/src/components/SignalDetailsCard.tsx`
- `apps/frontend/src/tabs/DeskTab.tsx`
- `apps/frontend/src/tabs/PilotDashboardTab.tsx`
- `apps/frontend/src/tabs/PolymarketHunterTab.tsx`
- `apps/frontend/src/tabs/AIDeskTab.tsx`
- `apps/backend/app/services/dashboard_data.py`
- `apps/backend/app/services/operator_console.py`
- `apps/backend/app/services/polymarket.py`
- `apps/backend/app/services/ai_advisor.py`
- `apps/backend/app/services/openai_oauth.py`

Current live stack:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8000`
- health: `http://127.0.0.1:8000/api/health`

What has already been worked on:

- startup reliability
- detached/silent launcher behavior
- demo trust repair
- chart stale/fixture honesty
- alert dedupe
- gate consistency work
- next-event future-only logic
- disabled timeframe honesty
- AI Desk friendly unavailable/setup state
- OpenAI OAuth plumbing
- Polymarket relevance tightening
- `USOUSD` oil workflow scaffolding
- human-usability repair passes

Important:

- the git worktree is dirty; do not reset it
- assume current uncommitted changes are intentional
- work forward from the current state

Your job:

1. verify the current live browser behavior first
2. determine what is actually still broken or awkward right now
3. fix only the highest-trust/highest-usability remaining issues
4. keep scope tight
5. rerun tests and verification

Focus especially on:

- above-the-fold usability
- nav scroll-to-workspace behavior
- freshness truth consistency across ribbon/chart/right rail/signal detail
- remaining internal language leakage
- standalone Polymarket usefulness
- oil (`USOUSD`) click path and research workflow
- AI Desk usability once auth is configured or absent

Required output format when you respond after the work:

A. Root cause summary
B. Files changed
C. What was fixed
D. What still remains limited
E. Exact commands to run
F. Verification results

---

## 14. Paste-ready prompt for a new Claude Sonnet 4.6 thinking chat

Use this if you want Claude to act as the review/planning brain before more implementation:

---

You are Claude Sonnet 4.6 with extended thinking acting as the review and planning brain for this repo.

Repo:
`C:\Users\sajal\OneDrive\Desktop\code\AI Trader`

Read:

- `README.md`
- `RUN_LOCAL.md`
- `START_HERE.md`
- `docs/PERPLEXITY_REVIEW_REPORTS.md`
- `docs/CLAUDE_NEXT_DEV_PROMPT.md`
- `docs/NEXT_DEV_HANDOFF_20260322.md`

Then inspect the current shell, trust, and AI/oil files.

Your job:

1. assess the current product state honestly
2. compare current code and likely current localhost behavior against the external review reports
3. separate fixed issues from still-open issues
4. recommend the best next sprint without widening scope
5. prioritize trust, usability, trader workflow, and data honesty

Do not recommend:

- real-money execution
- architecture churn without clear reason
- broad feature expansion

Output:

A. Current system assessment
B. What is already strong
C. What is still weak or risky
D. What the Perplexity reports got right
E. What appears fixed vs still open
F. Top 10 improvements to make next
G. Recommended next sprint plan
H. What not to work on yet

Then give:

- a brutally prioritized backlog
- a demo-readiness verdict
- a daily-usability verdict
- a note on whether this can become the operator brain for the platform

---
