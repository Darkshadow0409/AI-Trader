from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Callable, TypeVar
from urllib.parse import urlencode

import httpx
from fastapi import Request
from sqlmodel import Session

from app.core.settings import get_settings
from app.models.schemas import (
    AIActionStepView,
    AIDeskContextSnapshotView,
    AIAdvisorResponseView,
    AIAgentResultView,
    AIProviderStatusView,
)
from app.services.dashboard_data import asset_context, list_news_views, list_research_views, list_risk_views, list_signal_views
from app.services.data_reality import asset_reality
from app.services.market_identity import instrument_mapping_view, market_data_mode, resolve_symbol
from app.services.market_views import list_watchlist_summaries, market_chart_view
from app.services.openai_oauth import current_oauth_connection, oauth_callback_url
from app.services.operator_console import get_risk_detail, get_signal_detail
from app.services.polymarket import crowd_implied_narrative, related_polymarket_markets


T = TypeVar("T")
WORKSPACE_LABELS = {
    "desk": "Desk",
    "signals": "Signals",
    "high_risk": "High Risk",
    "watchlist": "Watchlist",
    "trade_tickets": "Tickets",
    "active_trades": "Trades",
    "journal": "Journal",
    "session": "Review Queue",
    "strategy_lab": "Strategy",
    "backtests": "Backtests",
    "replay": "Replay",
    "pilot_ops": "Pilot Ops",
    "risk": "Risk",
    "research": "Research",
    "news": "News",
    "polymarket": "Polymarket",
    "ai_desk": "AI Desk",
    "wallet_balance": "Wallet",
}


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _oauth_connect_url(origin: str | None) -> str:
    settings = get_settings()
    return f"/api/ai/oauth/start?{urlencode({'return_to': origin or settings.frontend_origin})}"


def _available_models() -> list[str]:
    settings = get_settings()
    return settings.openai_available_models_list


def _resolve_selected_model(requested_model: str | None) -> tuple[str, str | None]:
    settings = get_settings()
    available_models = _available_models()
    fallback_model = settings.openai_default_model if settings.openai_default_model in available_models else available_models[0]
    if not requested_model:
        return fallback_model, None
    if requested_model in available_models:
        return requested_model, None
    return fallback_model, f"Requested model {requested_model} is not enabled on this backend. Using {fallback_model} instead."


def _workspace_label(active_tab: str | None) -> str:
    if not active_tab:
        return "AI Desk"
    return WORKSPACE_LABELS.get(active_tab, active_tab.replace("_", " ").title())


def _data_mode_label(mode: str) -> str:
    return {
        "fixture": "Fixture data",
        "public_live": "Public live data",
        "broker_live": "Broker live data",
    }.get(mode, mode.replace("_", " "))


def _feed_source_label(source_mode: str) -> str:
    return {
        "live": "Live-capable source family",
        "sample": "Sample source family",
        "fixture": "Fixture source family",
    }.get(source_mode, source_mode.replace("_", " ").title())


def _provider_status(
    *,
    bearer_token: str | None,
    auth_mode: str,
    status: str | None = None,
    selected_model: str | None = None,
    warning: str | None = None,
    connected_account: str | None = None,
    oauth_enabled: bool = False,
    connect_url: str | None = None,
    session_expires_at: datetime | None = None,
    callback_url: str | None = None,
) -> AIProviderStatusView:
    settings = get_settings()
    available_models = _available_models()
    model = selected_model or settings.openai_default_model
    connected = bool(bearer_token)
    provider_status = status or ("connected" if connected else "auth_required")
    if connected:
        guidance = "Connected. Agents remain advisory-only and use the currently selected symbol, timeframe, and product context."
    elif provider_status == "oauth_not_configured":
        guidance = "OpenAI OAuth is not configured on this backend. AI Desk will keep using the local structured brief until those credentials are added."
    elif provider_status == "session_expired":
        guidance = "Your saved OpenAI session expired or was revoked. Reconnect if you want authenticated advisory runs. The local structured brief remains available."
    elif provider_status == "auth_unavailable":
        guidance = "OpenAI could not refresh the saved session right now. Reconnect or keep using the local structured brief."
    elif oauth_enabled:
        guidance = "Connect with OpenAI to run the advisory agents with your user-authenticated OpenAI session. Without it, the desk still returns a local advisory summary."
    else:
        guidance = "OpenAI OAuth is not configured yet. Set AI_TRADER_OPENAI_OAUTH_CLIENT_ID and AI_TRADER_OPENAI_OAUTH_CLIENT_SECRET to enable user-authenticated advisory runs."
    return AIProviderStatusView(
        provider="openai",
        auth_mode=auth_mode,
        status=provider_status,
        connected=connected,
        oauth_enabled=oauth_enabled,
        oauth_connect_url=connect_url,
        oauth_callback_url=callback_url,
        connected_account=connected_account if connected else None,
        default_model=settings.openai_default_model,
        selected_model=model,
        available_models=available_models,
        guidance=guidance,
        warning=warning,
        session_expires_at=session_expires_at,
    )


def advisor_status(request: Request, api_key: str | None = None) -> AIProviderStatusView:
    settings = get_settings()
    oauth = current_oauth_connection(request)
    manual_token = api_key or None
    server_token = settings.openai_api_key or None
    connect_url = None
    callback_url = oauth_callback_url(request)
    if oauth.oauth_enabled:
        connect_url = _oauth_connect_url(request.headers.get("origin"))
    if manual_token:
        return _provider_status(
            bearer_token=manual_token,
            auth_mode="user_token",
            status="connected",
            oauth_enabled=oauth.oauth_enabled,
            connect_url=connect_url,
            callback_url=callback_url,
            connected_account="manual user token",
        )
    if oauth.access_token:
        return _provider_status(
            bearer_token=oauth.access_token,
            auth_mode="oauth",
            status="connected",
            warning=oauth.warning,
            connected_account=oauth.connected_account,
            oauth_enabled=oauth.oauth_enabled,
            connect_url=connect_url,
            callback_url=callback_url,
            session_expires_at=oauth.session_expires_at,
        )
    return _provider_status(
        bearer_token=server_token,
        auth_mode="server_token" if server_token else "oauth",
        status="connected" if server_token else oauth.status,
        warning=oauth.warning,
        connected_account="server-side env token" if server_token else None,
        oauth_enabled=oauth.oauth_enabled,
        connect_url=connect_url,
        callback_url=callback_url,
        session_expires_at=oauth.session_expires_at,
    )


def _first(rows: list[T], predicate: Callable[[T], bool]) -> T | None:
    for row in rows:
        if predicate(row):
            return row
    return None


def _build_advisory_context(
    session: Session,
    symbol: str,
    timeframe: str,
    query: str,
    *,
    active_tab: str | None = None,
    selected_signal_id: str | None = None,
    selected_risk_report_id: str | None = None,
) -> dict[str, Any]:
    canonical_symbol = resolve_symbol(symbol)
    mapping = instrument_mapping_view(canonical_symbol, requested_symbol=symbol)
    chart = market_chart_view(session, canonical_symbol, timeframe)
    reality = chart.data_reality or asset_reality(session, canonical_symbol, None, chart.data_quality)
    asset = asset_context(session, canonical_symbol)
    research_rows = list_research_views(session)
    research = asset.research or _first(research_rows, lambda row: row.symbol == canonical_symbol)
    signal_rows = list_signal_views(session)
    signal = (
        get_signal_detail(session, selected_signal_id) if selected_signal_id else None
    ) or (
        get_signal_detail(session, asset.latest_signal.signal_id) if asset.latest_signal else None
    )
    news_rows = asset.related_news[:3] or list_news_views(session, canonical_symbol)[:3]
    risk_rows = list_risk_views(session)
    risk = (
        get_risk_detail(session, selected_risk_report_id) if selected_risk_report_id else None
    ) or (
        get_risk_detail(session, signal.related_risk.risk_report_id) if signal and signal.related_risk else None
    ) or (
        get_risk_detail(session, asset.latest_risk.risk_report_id) if asset.latest_risk else None
    )
    crowd_rows = asset.related_polymarket_markets[:3] or related_polymarket_markets(canonical_symbol, query, *(news.title for news in news_rows))[:3]
    crowd_summary = asset.crowd_implied_narrative or crowd_implied_narrative(canonical_symbol, query, *(news.title for news in news_rows))
    live_data_available = chart.market_data_mode != "fixture" and chart.freshness_state in {"fresh", "aging"}
    data_truth_note = chart.status_note or (reality.ui_warning if reality else None) or mapping.mapping_notes
    watchlist_rows = list_watchlist_summaries(session)[:5]
    return {
        "canonical_symbol": canonical_symbol,
        "active_workspace": _workspace_label(active_tab),
        "mapping": mapping,
        "chart": chart,
        "reality": reality,
        "asset": asset,
        "research_rows": research_rows,
        "research": research,
        "signal_rows": signal_rows,
        "signal": signal,
        "news_rows": news_rows,
        "risk": risk,
        "crowd_rows": crowd_rows,
        "crowd_summary": crowd_summary,
        "live_data_available": live_data_available,
        "data_truth_note": data_truth_note,
        "watchlist_rows": watchlist_rows,
    }


def _format_probability(probability: float | None) -> str:
    if probability is None:
        return "n/a"
    return f"{round(probability * 100)}%"


def _related_market_lines(context: dict[str, Any]) -> list[str]:
    crowd_rows = context["crowd_rows"]
    if crowd_rows:
        related = []
        for row in crowd_rows:
            lead_outcome = row.outcomes[0] if row.outcomes else None
            outcome_label = lead_outcome.label if lead_outcome else "Market"
            probability = _format_probability(lead_outcome.probability if lead_outcome else None)
            related.append(f"{row.question} ({outcome_label} {probability})")
        return related

    canonical_symbol = context["canonical_symbol"]
    research_rows = context["research_rows"]
    if canonical_symbol == "WTI":
        cross_assets = ["GOLD", "SILVER", "DXY", "US10Y"]
    elif canonical_symbol in {"GOLD", "SILVER"}:
        cross_assets = ["WTI", "DXY", "US10Y"]
    else:
        cross_assets = ["WTI", "GOLD", "SILVER"]
    related: list[str] = []
    for related_symbol in cross_assets:
        row = _first(research_rows, lambda item: item.symbol == related_symbol)
        if row is None:
            continue
        related.append(f"{row.label} {row.trend_state}, {row.return_5d_pct:+.2f}% over 5d")
        if len(related) == 3:
            break
    return related


def _signal_focus_line(context: dict[str, Any]) -> str | None:
    signal = context["signal"]
    if signal is None:
        return None
    return f"{signal.symbol} {signal.signal_type} · score {signal.score:.1f} · {round(signal.confidence * 100)}% confidence"


def _risk_focus_line(context: dict[str, Any]) -> str | None:
    risk = context["risk"]
    if risk is None:
        return None
    return f"{risk.symbol} stop {risk.stop_price:.2f} · size {risk.size_band} · max risk {risk.max_portfolio_risk_pct:.3f}%"


def _context_snapshot(context: dict[str, Any]) -> AIDeskContextSnapshotView:
    mapping = context["mapping"]
    chart = context["chart"]
    news_rows = context["news_rows"]
    crowd_rows = context["crowd_rows"]
    return AIDeskContextSnapshotView(
        selected_instrument=mapping.trader_symbol,
        active_workspace=context["active_workspace"],
        timeframe=chart.timeframe,
        market_freshness=f"{chart.freshness_state} · {chart.freshness_minutes}m",
        data_mode_label=_data_mode_label(chart.market_data_mode),
        feed_source_label=_feed_source_label(chart.source_mode),
        truth_note=context["data_truth_note"],
        signal_focus=_signal_focus_line(context),
        risk_focus=_risk_focus_line(context),
        watchlist_board=[row.instrument_mapping.trader_symbol for row in context["watchlist_rows"][:5]],
        catalyst_headlines=[row.title for row in news_rows[:3]],
        crowd_markets=[row.question for row in crowd_rows[:3]],
    )


def _next_actions(context: dict[str, Any]) -> list[AIActionStepView]:
    actions: list[AIActionStepView] = [
        AIActionStepView(
            label="Refresh chart truth",
            workspace="watchlist",
            note="Re-check chart freshness, timeframe availability, and proxy/live truth on the selected commodity.",
        ),
    ]
    if context["signal"] is not None:
        actions.append(
            AIActionStepView(
                label="Inspect latest signal",
                workspace="signals",
                note="Confirm setup family, score, and invalidation before treating the move as actionable.",
            )
        )
    if context["risk"] is not None:
        actions.append(
            AIActionStepView(
                label="Validate risk frame",
                workspace="risk",
                note="Confirm stop distance, cluster exposure, and size band before drafting a ticket.",
            )
        )
    if context["news_rows"]:
        actions.append(
            AIActionStepView(
                label="Review catalysts",
                workspace="news",
                note="Check whether oil, metals, or macro headlines still support the current thesis.",
            )
        )
    if context["crowd_rows"]:
        actions.append(
            AIActionStepView(
                label="Check crowd confirmation",
                workspace="polymarket",
                note="Use crowd markets as a sentiment cross-check, not as execution truth.",
            )
        )
    if context["signal"] is not None and context["risk"] is not None:
        actions.append(
            AIActionStepView(
                label="Draft paper ticket",
                workspace="trade_tickets",
                note="Only move to ticket drafting once chart, signal, and risk stay aligned in paper mode.",
            )
        )
    return actions[:5]


def _key_level_lines(context: dict[str, Any]) -> list[str]:
    chart = context["chart"]
    signal = context["signal"]
    risk = context["risk"]
    levels: list[str] = []
    for line in chart.overlays.price_lines[:4]:
        levels.append(f"{line.label}: {line.value:.2f}")
    if signal is not None:
        levels.append(f"Signal invalidation: {signal.invalidation:.2f}")
        for label, value in list(signal.targets.items())[:2]:
            levels.append(f"{label.replace('_', ' ').title()}: {value:.2f}")
    if risk is not None:
        levels.append(f"Risk stop: {risk.stop_price:.2f}")
    return levels[:6] or ["No chart or signal levels are loaded yet. Stay in context review mode until the desk refresh completes."]


def _terminal_sections(
    context: dict[str, Any],
) -> tuple[str, str, list[str], list[str], str, list[str], list[str], list[AIActionStepView]]:
    mapping = context["mapping"]
    chart = context["chart"]
    research = context["research"]
    signal = context["signal"]
    risk = context["risk"]
    news_rows = context["news_rows"]
    watchlist_rows = context["watchlist_rows"]
    live_data_available = context["live_data_available"]
    active_workspace = context["active_workspace"]
    market_view = (
        f"{mapping.trader_symbol} is running on {chart.timeframe} bars with {chart.freshness_state} market context. "
        f"{mapping.underlying_asset} research is {research.trend_state if research else 'unreadable'} and breakout distance is "
        f"{research.breakout_distance:.2f}%."
        if research
        else f"{mapping.trader_symbol} is loaded, but current research structure is thin. Treat this desk as context-first until the next refresh lands."
    )
    if not mapping.broker_truth:
        market_view += f" {mapping.mapping_notes}"

    catalysts = [f"{item.title} ({item.event_relevance}, {item.freshness_state})" for item in news_rows[:3]]
    if signal is not None and signal.signal_type == "event_driven":
        catalysts.insert(0, signal.thesis)
    if not catalysts:
        catalysts.append("No fresh catalyst headline is loaded for the selected asset right now.")

    why_it_matters_now = (
        f"{active_workspace} is focused on {mapping.trader_symbol}, so the desk needs one clear read on structure, catalysts, and invalidation before moving deeper into paper workflow. "
        f"{'Signal context is loaded and should anchor the next review step.' if signal is not None else 'Signal context is thin, so this stays chart-and-news first for now.'}"
    )
    if not live_data_available:
        why_it_matters_now += " Market timing is currently stale, proxy, or fixture-grade, so treat this as research support rather than timing truth."

    invalidation = (
        f"Primary invalidation sits near {risk.stop_price:.2f}. If price loses that level, treat the current thesis as broken and reopen the setup from scratch."
        if risk is not None
        else f"No dedicated risk report is loaded for {mapping.trader_symbol}. Use the chart stop and signal thesis only as research guidance."
    )
    if signal is not None:
        invalidation += f" Current signal family: {signal.signal_type}."

    risk_frame = []
    if risk is not None:
        risk_frame.append(f"Size band {risk.size_band} with max portfolio risk {risk.max_portfolio_risk_pct:.3f}%.")
        risk_frame.append(f"Exposure cluster {risk.exposure_cluster} and uncertainty {risk.uncertainty:.2f}.")
    else:
        risk_frame.append("Risk report unavailable. Do not treat this as a ticket-ready setup yet.")
    risk_frame.append(
        "Market data is live-capable and usable for timing."
        if live_data_available
        else "Current market timing is stale, proxy, or fixture-grade. Keep decisions in research and paper workflow only."
    )
    if watchlist_rows:
        risk_frame.append(
            "Primary board in scope: "
            + ", ".join(row.instrument_mapping.trader_symbol for row in watchlist_rows[:3])
            + "."
        )

    related_markets = _related_market_lines(context)
    if not related_markets:
        related_markets.append("No strong related markets are loaded beyond the current chart and catalyst stack.")

    return (
        market_view,
        why_it_matters_now,
        _key_level_lines(context),
        catalysts,
        invalidation,
        risk_frame,
        related_markets,
        _next_actions(context),
    )


def _agent_results(context: dict[str, Any]) -> tuple[list[AIAgentResultView], str, str, bool]:
    canonical_symbol = context["canonical_symbol"]
    mapping = context["mapping"]
    chart = context["chart"]
    reality = context["reality"]
    research = context["research"]
    news_rows = context["news_rows"]
    risk = context["risk"]
    crowd_rows = context["crowd_rows"]
    crowd_summary = context["crowd_summary"]
    live_data_available = context["live_data_available"]
    data_truth_note = context["data_truth_note"]

    research_summary = (
        f"{mapping.trader_symbol} is mapped from {mapping.underlying_asset} context. "
        f"Trend is {research.trend_state if research else 'unknown'}, breakout distance "
        f"{research.breakout_distance:.2f}% and ATR {research.atr_pct:.2f}%."
        if research
        else f"No current research frame is loaded for {mapping.trader_symbol}."
    )
    research_warnings = []
    if not mapping.broker_truth:
        research_warnings.append("Current trader instrument uses proxy/public fallback, not direct broker-truth pricing.")
    if chart.available_timeframes and chart.timeframe not in chart.available_timeframes:
        research_warnings.append(f"{chart.timeframe} is not currently available for this instrument in the active mode.")

    news_summary = (
        " | ".join(f"{item.title} ({item.event_relevance}, {item.freshness_state})" for item in news_rows)
        if news_rows
        else f"No current news was found for {mapping.trader_symbol}."
    )
    risk_summary = (
        f"Stop {risk.stop_price:.2f}, size band {risk.size_band}, max risk {risk.max_portfolio_risk_pct:.3f}%."
        if risk
        else f"No current risk report is loaded for {mapping.trader_symbol}."
    )
    sentiment_summary = crowd_summary or "No strong crowd-implied narrative is currently matched to this asset."

    agent_results = [
        AIAgentResultView(
            agent="Research Agent",
            headline=f"{mapping.trader_symbol} market structure",
            summary=research_summary,
            confidence=0.72 if research else 0.34,
            citations=[
                f"chart:{canonical_symbol}:{chart.timeframe}",
                f"mapping:{mapping.research_symbol}->{mapping.broker_symbol}",
            ],
            warnings=research_warnings,
        ),
        AIAgentResultView(
            agent="News Agent",
            headline=f"{mapping.trader_symbol} catalyst feed",
            summary=news_summary,
            confidence=0.78 if news_rows else 0.28,
            citations=[item.url for item in news_rows[:2]],
            warnings=[] if news_rows else ["No current news context is loaded for this symbol."],
        ),
        AIAgentResultView(
            agent="Risk Analysis Agent",
            headline=f"{mapping.trader_symbol} risk framing",
            summary=risk_summary,
            confidence=0.76 if risk else 0.31,
            citations=[f"risk:{risk.risk_report_id}"] if risk else [],
            warnings=[] if risk else ["Risk context is not currently loaded for this asset."],
        ),
        AIAgentResultView(
            agent="Sentiment Agent",
            headline=f"{mapping.trader_symbol} crowd-implied narrative",
            summary=sentiment_summary,
            confidence=0.66 if crowd_rows else 0.22,
            citations=[item.url for item in crowd_rows[:2]],
            warnings=[] if crowd_rows else ["No strong Polymarket-style crowd context is currently matched."],
        ),
    ]
    context_summary = (
        f"{context['active_workspace']} / {mapping.trader_symbol} / {chart.timeframe} / {chart.market_data_mode}. "
        f"Freshness {chart.freshness_state}. Reality {reality.provenance.realism_grade if reality else 'n/a'}."
    )
    return agent_results, context_summary, data_truth_note, live_data_available


def _fallback_answer(
    symbol: str,
    timeframe: str,
    context_summary: str,
    market_view: str,
    why_it_matters_now: str,
    key_levels: list[str],
    catalysts: list[str],
    invalidation: str,
    risk_frame: list[str],
    next_actions: list[AIActionStepView],
    data_truth_note: str,
) -> str:
    catalyst_summary = " ".join(catalysts[:2])
    key_level_summary = " ".join(key_levels[:3])
    risk_summary = " ".join(risk_frame[:2])
    next_step = next_actions[0].note if next_actions else "Stay in research mode until the next usable setup appears."
    return (
        f"{symbol} advisory summary for {timeframe}: {context_summary} "
        f"{market_view} {why_it_matters_now} {key_level_summary} {catalyst_summary} {invalidation} {risk_summary} "
        f"Next step: {next_step} Data-truth note: {data_truth_note} "
        "Use this as research support for signals, ticket drafting, and paper-trade review only."
    )


def _extract_output_text(payload: dict[str, Any]) -> str | None:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()
    return None


def _compose_provider_prompt(
    *,
    query: str,
    context_summary: str,
    snapshot: AIDeskContextSnapshotView,
    agent_results: list[AIAgentResultView],
    market_view: str,
    why_it_matters_now: str,
    key_levels: list[str],
    catalysts: list[str],
    invalidation: str,
    risk_frame: list[str],
    related_markets: list[str],
    next_actions: list[AIActionStepView],
    data_truth_note: str,
) -> str:
    return "\n".join(
        [
            "You are the advisory brain of a local-first trading terminal.",
            "Stay advisory-only. Do not imply order placement, execution, certainty, or guaranteed outcomes.",
            "Write in concise operator language, not chatbot filler.",
            f"User question: {query}",
            f"Current workspace: {snapshot.active_workspace}",
            f"Selected instrument: {snapshot.selected_instrument}",
            f"Timeframe: {snapshot.timeframe}",
            f"Market freshness: {snapshot.market_freshness}",
            f"Data mode: {snapshot.data_mode_label}",
            f"Feed source: {snapshot.feed_source_label}",
            f"Signal focus: {snapshot.signal_focus or 'none'}",
            f"Risk focus: {snapshot.risk_focus or 'none'}",
            f"Watchlist board: {' | '.join(snapshot.watchlist_board)}",
            f"Context summary: {context_summary}",
            f"Current market read: {market_view}",
            f"Why it matters now: {why_it_matters_now}",
            f"Key levels / scenarios: {' | '.join(key_levels)}",
            f"Catalyst watch: {' | '.join(catalysts)}",
            f"Invalidation: {invalidation}",
            f"Risk frame: {' | '.join(risk_frame)}",
            f"Related assets: {' | '.join(related_markets)}",
            f"Platform next steps: {' | '.join(f'{item.workspace}: {item.note}' for item in next_actions)}",
            f"Data truth note: {data_truth_note}",
            "Contributing agents:",
            *[
                f"- {item.agent}: {item.summary} | confidence {item.confidence:.2f} | warnings {', '.join(item.warnings) or 'none'}"
                for item in agent_results
            ],
            "Respond as one compact operator brief that reinforces the structured desk sections already provided.",
        ]
    )


def _friendly_openai_warning(error: Exception) -> str:
    if isinstance(error, httpx.TimeoutException):
        return "OpenAI timed out for this run, so AI Desk returned the local structured brief instead."
    if isinstance(error, httpx.HTTPStatusError):
        status_code = error.response.status_code
        if status_code in {401, 403}:
            return "OpenAI auth is missing or expired for this run, so AI Desk returned the local structured brief instead."
        if status_code == 429:
            return "OpenAI rate-limited this run, so AI Desk returned the local structured brief instead."
        if status_code >= 500:
            return "OpenAI was unavailable for this run, so AI Desk returned the local structured brief instead."
        return "OpenAI rejected this run, so AI Desk returned the local structured brief instead."
    if isinstance(error, httpx.HTTPError):
        return "OpenAI could not be reached for this run, so AI Desk returned the local structured brief instead."
    return "OpenAI could not complete this run, so AI Desk returned the local structured brief instead."


def _openai_answer(
    *,
    api_key: str,
    model: str,
    prompt: str,
) -> tuple[str | None, str | None]:
    settings = get_settings()
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                f"{settings.openai_base_url.rstrip('/')}/responses",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "input": prompt,
                },
            )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        return None, _friendly_openai_warning(exc)

    payload = response.json()
    text = _extract_output_text(payload)
    if not text:
        return None, "OpenAI returned no readable advisory text, so AI Desk kept the local structured brief."
    return text, None


def run_advisor(
    session: Session,
    request: Request,
    query: str,
    symbol: str,
    timeframe: str,
    api_key: str | None = None,
    model: str | None = None,
    active_tab: str | None = None,
    selected_signal_id: str | None = None,
    selected_risk_report_id: str | None = None,
) -> AIAdvisorResponseView:
    settings = get_settings()
    oauth = current_oauth_connection(request)
    manual_token = api_key or None
    server_token = settings.openai_api_key or None
    effective_key = manual_token or oauth.access_token or server_token or None
    selected_model, model_warning = _resolve_selected_model(model)
    advisory_context = _build_advisory_context(
        session,
        symbol,
        timeframe,
        query,
        active_tab=active_tab,
        selected_signal_id=selected_signal_id,
        selected_risk_report_id=selected_risk_report_id,
    )
    agent_results, context_summary, data_truth_note, live_data_available = _agent_results(advisory_context)
    snapshot = _context_snapshot(advisory_context)
    (
        market_view,
        why_it_matters_now,
        key_levels,
        catalysts,
        invalidation,
        risk_frame,
        related_markets,
        next_actions,
    ) = _terminal_sections(advisory_context)
    warning: str | None = None
    final_answer = _fallback_answer(
        symbol,
        timeframe,
        context_summary,
        market_view,
        why_it_matters_now,
        key_levels,
        catalysts,
        invalidation,
        risk_frame,
        next_actions,
        data_truth_note,
    )
    if effective_key:
        provider_prompt = _compose_provider_prompt(
            query=query,
            context_summary=context_summary,
            snapshot=snapshot,
            agent_results=agent_results,
            market_view=market_view,
            why_it_matters_now=why_it_matters_now,
            key_levels=key_levels,
            catalysts=catalysts,
            invalidation=invalidation,
            risk_frame=risk_frame,
            related_markets=related_markets,
            next_actions=next_actions,
            data_truth_note=data_truth_note,
        )
        ai_answer, warning = _openai_answer(
            api_key=effective_key,
            model=selected_model,
            prompt=provider_prompt,
        )
        if ai_answer:
            final_answer = ai_answer
    connect_url = None
    callback_url = oauth_callback_url(request)
    if oauth.oauth_enabled:
        connect_url = _oauth_connect_url(request.headers.get("origin"))
    if manual_token:
        auth_mode = "user_token"
        connected_account = "manual user token"
        auth_status = "connected"
    elif oauth.access_token:
        auth_mode = "oauth"
        connected_account = oauth.connected_account
        auth_status = "connected"
    elif server_token:
        auth_mode = "server_token"
        connected_account = "server-side env token"
        auth_status = "connected"
    else:
        auth_mode = "oauth"
        connected_account = None
        auth_status = oauth.status
    provider_status = _provider_status(
        bearer_token=effective_key,
        auth_mode=auth_mode,
        status=auth_status,
        selected_model=selected_model,
        warning=warning or oauth.warning,
        connected_account=connected_account,
        oauth_enabled=oauth.oauth_enabled,
        connect_url=connect_url,
        callback_url=callback_url,
        session_expires_at=oauth.session_expires_at,
    )
    warnings = [item for item in [model_warning, warning, oauth.warning] if item]
    return AIAdvisorResponseView(
        generated_at=_utc_now(),
        symbol=resolve_symbol(symbol),
        timeframe=timeframe,
        requested_query=query,
        provider_status=provider_status,
        market_data_mode=market_data_mode(session),
        context_summary=context_summary,
        final_answer=final_answer,
        agent_results=agent_results,
        warnings=warnings,
        live_data_available=live_data_available,
        data_truth_note=data_truth_note,
        context_snapshot=snapshot,
        market_view=market_view,
        why_it_matters_now=why_it_matters_now,
        key_levels=key_levels,
        catalysts=catalysts,
        invalidation=invalidation,
        risk_frame=risk_frame,
        related_markets=related_markets,
        next_actions=next_actions,
    )
