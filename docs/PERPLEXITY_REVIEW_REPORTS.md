# Perplexity Review Reports

This file condenses the external Perplexity-style QA passes that were used to pressure-test the product from a human, demo, and operator perspective.

## Report 1

- Date: 20 Mar 2026
- Title: AI Trader Phase 1 - Full QA Review
- Focus: broad product QA, navigation, signal workflow, paper trading, pilot ops, chart trust

### Key findings at the time

- The data-honesty model was strong: fixture, proxy, stale, reality grades, and penalty stacks were viewed as one of the product's best traits.
- Signal detail depth, chart annotations, paper-account framing, and promotion gatekeeping were strong.
- Desk, chart, and ticket surfaces were promising.

### Main failures found

- Navigation from Desk to several later sections could leave the workspace stuck or feel unchanged.
- Nav clicks did not scroll the user to the active workspace.
- Desk reloads could appear to downgrade from live/public context into fixture/unusable context without a user action.
- Alert Center accumulated repeated stale-data warnings.
- Raw IDs and raw JSON leaked into user-facing views.
- AI Desk exposed raw API errors.
- Watchlist entries for oil/gold could appear broken or unexplained.

### External verdict then

- Promising but unfinished.
- Not demo-ready at that point.

## Report 2

- Date: 21 Mar 2026
- Title: AI Trader Phase 1 - Human Usability Review
- Focus: first-use human usability and trust

### What worked

- The `Start Here` onboarding card helped.
- The 10k paper-capital panel and next-actions buttons were clear.
- Chart fixture warnings and signal prose were understandable.
- Core Desk -> Signal -> Risk read-only research flow was usable.

### Main failures found

- The first visible screen was still too metadata-heavy and not obviously the product entry point.
- Nav clicks could technically switch content while leaving the user stranded at the wrong scroll position.
- `mode fixture / source live` was cognitively confusing.
- Watchlist cards were too dense and too technical.
- Gate tokens like `review_required` were unexplained.
- Polymarket could show noisy or irrelevant markets.
- Suppressed alerts exposed internal terms such as `cooldown_window`.
- Large blank gaps and raw loading/error text made some panels feel unfinished.
- AI Desk leading with raw fetch errors was especially damaging.
- Freshness truth felt contradictory across ribbon, alerts, and chart context.

### External verdict then

- Promising but still awkward.
- Not ready for serious demo/customer use.

## Report 3

- Date: 21 Mar 2026
- Title: Usability-Repair Verification
- Focus: check whether the trust-repair changes were actually live in the browser

### Changes that were clearly visible

- Ribbon labels improved with separate `Data Mode` and `Feed Source`.
- AI Desk showed a friendly connection guidance state instead of raw fetch dumps.
- Watchlist was symbol-first and `USOUSD` was the trader-facing oil symbol.
- Right-rail Polymarket context was more relevant.
- Pilot summary explanation improved.
- Chart stale banner and refresh action were visible.

### Remaining failures found at that time

- The first screen was still too metadata-heavy above the fold.
- Nav did not reliably scroll to the active operator workspace.
- Clicking `USOUSD` could route incorrectly because the nav stack intercepted the click.
- Alerts were still not clearly separated into actionable vs noise-reduced sections.
- Alert cards still exposed raw internal slash-tag metadata.
- Standalone Polymarket workspace could be empty or confusing.
- Raw `ref sig_...` IDs were still visible.
- `not_ready` still appeared untranslated in some places.
- `Market As Of` needed clearer date context.

### External verdict then

- Changes were only partially live.

## Internal follow-up after those reports

The repo was updated after the reports above. The most important follow-up fixes that were implemented include:

- operator-workspace scroll targeting on tab changes
- translated gate labels
- humanized alert metadata plus a separate `Noise reduced` section
- stronger Polymarket filtering
- AI Desk friendly setup state
- `USOUSD` watchlist click routing into a chart-capable workspace
- removal of BTC chart bleed when oil is selected
- alert refresh cleanup so stale ranked-signal text does not survive across refresh cycles

## How Claude should use this file

Claude should treat these reports as external-product evidence, not as guaranteed-current truth.

Recommended review approach:

1. Read these reports to understand historical trust failures.
2. Compare them against the current code and current localhost behavior.
3. Separate:
   - already fixed issues
   - partially fixed issues
   - still-open issues
4. Prioritize remaining work by demo trust, human usability, and operator confidence.
