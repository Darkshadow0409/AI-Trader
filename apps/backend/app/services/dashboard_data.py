from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.models.entities import BacktestResult, MacroEvent, MarketBar, NewsItem, RiskReport, SignalRecord
from app.models.schemas import (
    ActiveTradeView,
    AssetContextView,
    BacktestListView,
    JournalReviewView,
    NewsView,
    ResearchView,
    RibbonView,
    RiskExposureView,
    RiskView,
    SignalView,
    WalletBalanceLineView,
    WalletBalanceView,
)
from app.services.data_reality import asset_reality, freshness_minutes, freshness_state, latest_pipeline_run
from app.services.market_identity import instrument_mapping_view, market_data_mode, terminal_focus_priority
from app.services.polymarket import crowd_implied_narrative, related_polymarket_markets
from app.services.feature_pipeline import build_feature_frame


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"
RISK_BUDGET_TOTAL_PCT = 2.5
ASSET_KEYWORDS: dict[str, set[str]] = {
    "BTC": {"btc", "bitcoin", "crypto"},
    "ETH": {"eth", "ethereum", "crypto"},
    "WTI": {"wti", "oil", "crude", "energy"},
    "GOLD": {"gold", "bullion", "real yield"},
    "SILVER": {"silver", "bullion"},
    "DXY": {"dxy", "dollar", "usd"},
    "US10Y": {"us10y", "treasury", "rates", "yield"},
    "VIX": {"vix", "volatility", "risk"},
}


def _research_sort_key(view: ResearchView) -> tuple[int, float, float, str]:
    return (
        terminal_focus_priority(view.symbol),
        -view.structure_score,
        -view.breakout_distance,
        view.label,
    )


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC).replace(tzinfo=None)


def _operator_mode_labels(source_mode: str, data_mode: str) -> tuple[str, str, str]:
    data_mode_label = {
        "fixture": "Fixture research data",
        "public_live": "Public live data",
        "broker_live": "Broker-aligned live data",
    }.get(data_mode, data_mode.replace("_", " "))
    feed_source_label = {
        "sample": "Local sample source family",
        "fixture": "Fixture source family",
        "live": "Live-capable source family",
    }.get(source_mode, source_mode.replace("_", " "))
    if data_mode == "fixture":
        explainer = "Fixture mode is active. Feed source describes the source family, not live tradable market truth."
    elif data_mode == "public_live":
        explainer = "Using the latest public market data path available to this local desk."
    elif data_mode == "broker_live":
        explainer = "Using broker-aligned data where the current source path supports it."
    else:
        explainer = "Market mode and feed source are shown separately so data truth stays explicit."
    return data_mode_label, feed_source_label, explainer


def _next_future_event(events: list[MacroEvent]) -> MacroEvent | None:
    now = naive_utc_now()
    return next((item for item in events if item.event_time > now), None)


def _infer_assets(text: str, tags: list[str]) -> list[str]:
    haystack = f"{text} {' '.join(tags)}".lower()
    matched = [symbol for symbol, keywords in ASSET_KEYWORDS.items() if any(keyword in haystack for keyword in keywords)]
    if "BTC" in matched and "ETH" not in matched and "crypto" in haystack:
        matched.append("ETH")
    return sorted(set(matched))


def _event_signal_thesis(thesis: str, timestamp: datetime, features: dict[str, Any]) -> str:
    hours_to_event = features.get("hours_to_event")
    if hours_to_event is None or " is within " not in thesis:
        return thesis
    try:
        event_offset = float(hours_to_event)
    except (TypeError, ValueError):
        return thesis
    event_time = timestamp + timedelta(hours=event_offset)
    title = thesis.split(" is within ", 1)[0].strip() or "Macro event"
    remaining_hours = (event_time - naive_utc_now()).total_seconds() / 3600
    if remaining_hours <= 0:
        return (
            f"{title} cleared {abs(remaining_hours):.1f}h ago. "
            "Re-check whether the breakout still holds after the release."
        )
    return (
        f"{title} is within {remaining_hours:.1f}h. Reduce conviction and treat "
        "breakouts as event-sensitive until the release clears."
    )

def _news_view(item: NewsItem) -> NewsView:
    affected_assets = _infer_assets(f"{item.title} {item.summary}", item.tags_json)
    entity_tags = sorted(set([*item.tags_json, *affected_assets]))
    minutes = freshness_minutes(item.published_at)
    primary_asset = affected_assets[0] if affected_assets else None
    if minutes <= 180 and primary_asset in {"WTI", "BTC", "ETH"}:
        event_relevance = "high"
    elif minutes <= 1440 or primary_asset is not None:
        event_relevance = "medium"
    else:
        event_relevance = "low"
    primary_symbol = primary_asset or (affected_assets[0] if affected_assets else "")
    related_markets = related_polymarket_markets(primary_symbol, item.title, item.summary, *item.tags_json) if primary_symbol else []
    return NewsView(
        source=item.source,
        published_at=item.published_at,
        freshness_minutes=minutes,
        freshness_state=freshness_state(minutes, 240),
        title=item.title,
        summary=item.summary,
        url=item.url,
        tags=item.tags_json,
        entity_tags=entity_tags,
        affected_assets=affected_assets,
        primary_asset=primary_asset,
        event_relevance=event_relevance,
        market_data_mode="fixture",
        data_quality=item.data_quality,
        related_polymarket_markets=related_markets,
    )


def _risk_view(report: RiskReport) -> RiskView:
    return RiskView(
        risk_report_id=report.risk_report_id,
        signal_id=report.signal_id,
        symbol=report.symbol,
        as_of=report.as_of,
        freshness_minutes=freshness_minutes(report.as_of),
        stop_price=report.stop_price,
        size_band=report.size_band,
        max_portfolio_risk_pct=report.max_portfolio_risk_pct,
        exposure_cluster=report.exposure_cluster,
        uncertainty=report.uncertainty,
        data_quality=report.data_quality,
        scenario_shocks={key: float(value) for key, value in report.report_json.get("scenario_shocks", {}).items()},
        report=report.report_json,
        data_reality=None,
    )


def _signal_targets(direction: str, entry_reference: float, atr_14: float) -> dict[str, float]:
    if direction == "short":
        return {
            "base": round(entry_reference - atr_14 * 1.5, 2),
            "stretch": round(entry_reference - atr_14 * 2.4, 2),
        }
    return {
        "base": round(entry_reference + atr_14 * 1.5, 2),
        "stretch": round(entry_reference + atr_14 * 2.4, 2),
    }


def _signal_view(row: SignalRecord, risk_map: dict[str, RiskReport]) -> SignalView:
    risk_report = risk_map.get(row.signal_id)
    feature_snapshot = dict(row.features_json)
    reference_fallback = risk_report.report_json.get("entry_reference") if risk_report else 0.0
    atr_fallback = risk_report.report_json.get("atr_14") if risk_report else 0.0
    entry_reference = float(feature_snapshot.get("close") or reference_fallback or 0.0)
    atr_14 = float(feature_snapshot.get("atr_14") or atr_fallback or entry_reference * 0.03)
    confidence = round(_clamp(1.0 - row.uncertainty, 0.05, 0.95), 2)
    noise_probability = round(
        _clamp(row.uncertainty + (0.16 if row.signal_type == "event_driven" else 0.08), 0.05, 0.95),
        2,
    )
    thesis = _event_signal_thesis(row.thesis, row.timestamp, feature_snapshot) if row.signal_type == "event_driven" else row.thesis
    invalidation = risk_report.stop_price if risk_report else round(entry_reference - atr_14 * 1.2, 2)
    affected_assets = sorted(set([row.symbol, *(_infer_assets(row.thesis, [row.symbol]))]))
    return SignalView(
        signal_id=row.signal_id,
        symbol=row.symbol,
        signal_type=row.signal_type,
        timestamp=row.timestamp,
        freshness_minutes=freshness_minutes(row.timestamp),
        direction=row.direction,
        score=row.score,
        confidence=confidence,
        noise_probability=noise_probability,
        thesis=thesis,
        invalidation=invalidation,
        targets=_signal_targets(row.direction, entry_reference, atr_14),
        uncertainty=row.uncertainty,
        data_quality=row.data_quality,
        affected_assets=affected_assets,
        features=feature_snapshot,
        data_reality=None,
    )


def _trend_state_from_history(rows: list[MarketBar]) -> str:
    if len(rows) < 2:
        return "unknown"
    baseline = rows[max(0, len(rows) - 6)].close
    latest = rows[-1].close
    if baseline <= 0:
        return "unknown"
    move = (latest / baseline) - 1
    if move >= 0.01:
        return "uptrend"
    if move <= -0.01:
        return "downtrend"
    return "range"


def _minimal_research_views(session: Session, rows: list[MarketBar]) -> list[ResearchView]:
    grouped: dict[str, list[MarketBar]] = {}
    for row in rows:
        grouped.setdefault(row.symbol, []).append(row)

    payload: list[ResearchView] = []
    for symbol, symbol_rows in grouped.items():
        ordered = sorted(symbol_rows, key=lambda item: item.timestamp)
        latest = ordered[-1]
        previous = ordered[-2] if len(ordered) >= 2 else latest
        lookback = ordered[-6] if len(ordered) >= 6 else ordered[0]
        recent_window = ordered[-20:]
        volume_avg = sum(item.volume for item in recent_window) / len(recent_window) if recent_window else 0.0
        breakout_high = max(item.high for item in recent_window) if recent_window else latest.high
        breakout_low = min(item.low for item in recent_window) if recent_window else latest.low
        breakout_reference = breakout_high if latest.close >= previous.close else breakout_low
        breakout_distance = (
            ((latest.close / breakout_reference) - 1) * 100
            if breakout_reference
            else 0.0
        )
        trend_state = _trend_state_from_history(ordered)
        reality = asset_reality(
            session,
            symbol,
            as_of=latest.timestamp,
            data_quality=latest.data_quality,
            freshness_sla_minutes=240,
        )
        structure_score = 60.0 if trend_state in {"uptrend", "downtrend"} else 42.0
        view = ResearchView(
            symbol=symbol,
            label=instrument_mapping_view(symbol).trader_symbol,
            timeframe="1d",
            last_price=round(latest.close, 2),
            return_1d_pct=round((((latest.close / previous.close) - 1) * 100), 2) if previous.close else 0.0,
            return_5d_pct=round((((latest.close / lookback.close) - 1) * 100), 2) if lookback.close else 0.0,
            trend_state=trend_state,
            relative_volume=round((latest.volume / volume_avg), 2) if volume_avg else 0.0,
            atr_pct=round((((latest.high - latest.low) / latest.close) * 100), 2) if latest.close else 0.0,
            breakout_distance=round(breakout_distance, 2),
            structure_score=structure_score,
            data_quality=latest.data_quality,
            data_reality=reality,
        )
        view.related_polymarket_markets = related_polymarket_markets(view.symbol, view.label, view.trend_state)
        view.crowd_implied_narrative = crowd_implied_narrative(view.symbol, view.label, view.trend_state)
        payload.append(view)
    return sorted(payload, key=_research_sort_key)


def list_signal_views(session: Session) -> list[SignalView]:
    signals = session.exec(select(SignalRecord).order_by(desc(SignalRecord.score), desc(SignalRecord.timestamp))).all()
    risk_reports = session.exec(select(RiskReport)).all()
    risk_map = {report.signal_id: report for report in risk_reports}
    payload = [_signal_view(row, risk_map) for row in signals]
    for row in payload:
        row.data_reality = asset_reality(
            session,
            row.symbol,
            as_of=row.timestamp,
            data_quality=row.data_quality,
            features=row.features,
        )
    return payload


def list_high_risk_signal_views(session: Session) -> list[SignalView]:
    return [
        row
        for row in list_signal_views(session)
        if row.noise_probability >= 0.35 or row.uncertainty >= 0.33 or row.signal_type == "event_driven"
    ]


def list_news_views(session: Session, symbol: str | None = None) -> list[NewsView]:
    rows = session.exec(select(NewsItem).order_by(desc(NewsItem.published_at))).all()
    mode = market_data_mode(session)
    payload = []
    for row in rows:
        view = _news_view(row)
        view.market_data_mode = mode
        if view.primary_asset:
            mapping = instrument_mapping_view(view.primary_asset)
            view.entity_tags = sorted(set([*view.entity_tags, mapping.broker_symbol, mapping.public_symbol]))
        payload.append(view)
    if symbol is None:
        return payload
    return [row for row in payload if symbol in row.affected_assets or not row.affected_assets]


def list_risk_views(session: Session) -> list[RiskView]:
    rows = session.exec(select(RiskReport).order_by(desc(RiskReport.as_of))).all()
    payload = [_risk_view(row) for row in rows]
    for row in payload:
        row.data_reality = asset_reality(
            session,
            row.symbol,
            as_of=row.as_of,
            data_quality=row.data_quality,
            features=row.report,
        )
    return payload


def list_risk_exposure_views(session: Session) -> list[RiskExposureView]:
    reports = list_risk_views(session)
    clusters: dict[str, dict[str, Any]] = {}
    for report in reports:
        entry = clusters.setdefault(
            report.exposure_cluster,
            {"symbols": [], "gross_risk_pct": 0.0, "worst_scenario_pct": 0.0},
        )
        entry["symbols"].append(report.symbol)
        entry["gross_risk_pct"] += report.max_portfolio_risk_pct
        entry["worst_scenario_pct"] = min(entry["worst_scenario_pct"], *report.scenario_shocks.values(), 0.0)
    return [
        RiskExposureView(
            cluster=cluster,
            symbols=sorted(values["symbols"]),
            gross_risk_pct=round(values["gross_risk_pct"], 3),
            worst_scenario_pct=round(values["worst_scenario_pct"], 2),
        )
        for cluster, values in sorted(clusters.items())
    ]


def list_research_views(session: Session) -> list[ResearchView]:
    rows = session.exec(
        select(MarketBar)
        .where(MarketBar.timeframe == "1d")
        .order_by(MarketBar.symbol.asc(), MarketBar.timestamp.asc())
    ).all()
    if not rows:
        return []
    events = session.exec(select(MacroEvent).order_by(MacroEvent.event_time.asc())).all()
    next_event = _next_future_event(events)
    try:
        frame, _ = build_feature_frame(
            [
                {
                    "symbol": row.symbol,
                    "timeframe": row.timeframe,
                    "timestamp": row.timestamp,
                    "open": row.open,
                    "high": row.high,
                    "low": row.low,
                    "close": row.close,
                    "volume": row.volume,
                    "source": row.source,
                    "uncertainty": row.uncertainty,
                    "data_quality": row.data_quality,
                }
                for row in rows
            ],
            next_event.event_time if next_event else None,
        )
        latest = frame.sort(["symbol", "timestamp"]).group_by("symbol", maintain_order=True).tail(1).to_dicts()
        payload = [
            ResearchView(
                symbol=str(item["symbol"]),
                label=instrument_mapping_view(str(item["symbol"])).trader_symbol,
                timeframe="1d",
                last_price=round(float(item.get("close") or 0.0), 2),
                return_1d_pct=round(float(item.get("return_1") or 0.0) * 100, 2),
                return_5d_pct=round(float(item.get("return_5") or 0.0) * 100, 2),
                trend_state=str(item.get("trend_state") or "unknown"),
                relative_volume=round(float(item.get("relative_volume") or 0.0), 2),
                atr_pct=round(float(item.get("atr_pct") or 0.0) * 100, 2),
                breakout_distance=round(float(item.get("breakout_distance") or 0.0) * 100, 2),
                structure_score=round(float(item.get("structure_score") or 0.0), 2),
                data_quality=str(item.get("data_quality") or "fixture"),
                data_reality=asset_reality(
                    session,
                    str(item["symbol"]),
                    as_of=cast(datetime, item.get("timestamp")) if item.get("timestamp") is not None else None,
                    data_quality=str(item.get("data_quality") or "fixture"),
                    features=cast(dict[str, Any], item),
                    freshness_sla_minutes=240,
                ),
            )
            for item in latest
        ]
        for row in payload:
            row.related_polymarket_markets = related_polymarket_markets(row.symbol, row.label, row.trend_state)
            row.crowd_implied_narrative = crowd_implied_narrative(row.symbol, row.label, row.trend_state)
        return sorted(payload, key=_research_sort_key)
    except Exception:
        return _minimal_research_views(session, rows)


def dashboard_ribbon(session: Session) -> RibbonView:
    latest_bar = session.exec(select(MarketBar).order_by(desc(MarketBar.timestamp))).first()
    latest_run = latest_pipeline_run(session)
    events = session.exec(select(MacroEvent).order_by(MacroEvent.event_time.asc())).all()
    next_event = _next_future_event(events)
    research_rows = list_research_views(session)
    wti_research = next((row for row in research_rows if row.symbol == "WTI"), None)
    gold_research = next((row for row in research_rows if row.symbol == "GOLD"), None)
    silver_research = next((row for row in research_rows if row.symbol == "SILVER"), None)
    freshness_age = freshness_minutes(latest_bar.timestamp) if latest_bar else 9999
    freshness_status = freshness_state(freshness_age, 240)
    data_mode = market_data_mode(session)
    source_mode = latest_run.source_mode if latest_run else "sample"
    system_refresh_minutes = (
        freshness_minutes(latest_run.completed_at)
        if latest_run and latest_run.completed_at is not None
        else None
    )
    system_refresh_status = (
        freshness_state(system_refresh_minutes, 180)
        if system_refresh_minutes is not None
        else "unknown"
    )
    data_mode_label, feed_source_label, mode_explainer = _operator_mode_labels(source_mode, data_mode)
    risk_budget_used = round(sum(report.max_portfolio_risk_pct for report in list_risk_views(session)), 3)
    macro_regime = "balanced"
    if next_event and next_event.impact == "high":
        macro_regime = "event-risk"
    elif wti_research and wti_research.trend_state == "uptrend" and wti_research.return_5d_pct > 0:
        macro_regime = "energy-firm"
    elif (
        (gold_research and gold_research.return_5d_pct > 0 and gold_research.trend_state == "uptrend")
        or (silver_research and silver_research.return_5d_pct > 0 and silver_research.trend_state == "uptrend")
    ):
        macro_regime = "hard-asset-bid"
    elif all(
        row.return_5d_pct < 0
        for row in [wti_research, gold_research, silver_research]
        if row is not None
    ) and any(row is not None for row in [wti_research, gold_research, silver_research]):
        macro_regime = "defensive"
    return RibbonView(
        macro_regime=macro_regime,
        data_freshness_minutes=freshness_age,
        freshness_status=freshness_status,
        market_data_as_of=latest_bar.timestamp if latest_bar else None,
        system_refresh_minutes=system_refresh_minutes,
        system_refresh_status=system_refresh_status,
        risk_budget_used_pct=risk_budget_used,
        risk_budget_total_pct=RISK_BUDGET_TOTAL_PCT,
        pipeline_status=latest_run.status if latest_run else "unknown",
        source_mode=source_mode,
        market_data_mode=data_mode,
        data_mode_label=data_mode_label,
        feed_source_label=feed_source_label,
        mode_explainer=mode_explainer,
        last_refresh=latest_run.completed_at if latest_run else None,
        next_event=(
            {
                "title": next_event.event_name,
                "impact": next_event.impact,
                "event_time": next_event.event_time.isoformat(),
            }
            if next_event
            else None
        ),
    )


def asset_context(session: Session, symbol: str) -> AssetContextView:
    research = next((row for row in list_research_views(session) if row.symbol == symbol), None)
    signal = next((row for row in list_signal_views(session) if row.symbol == symbol), None)
    risk = next((row for row in list_risk_views(session) if row.symbol == symbol), None)
    related_news = list_news_views(session, symbol=symbol)[:6]
    backtest = session.exec(select(BacktestResult).where(BacktestResult.symbol == symbol).order_by(desc(BacktestResult.created_at))).first()
    latest_backtest = (
        BacktestListView(
            id=backtest.id or 0,
            strategy_name=backtest.strategy_name,
            engine=backtest.engine,
            status=backtest.status,
            symbol=backtest.symbol,
            timeframe=backtest.timeframe,
            created_at=backtest.created_at,
            proxy_grade=backtest.proxy_grade,
            promoted_candidate=backtest.promoted_candidate,
            search_method=backtest.search_method,
            robustness_score=backtest.robustness_score,
            net_return_pct=backtest.net_return_pct,
            sharpe_ratio=backtest.sharpe_ratio,
            max_drawdown_pct=backtest.max_drawdown_pct,
            trade_count=backtest.trade_count,
            data_reality=asset_reality(
                session,
                symbol,
                as_of=backtest.created_at,
                data_quality=research.data_quality if research else "fixture",
            ),
        )
        if backtest
        else None
    )
    context_reality = asset_reality(
        session,
        symbol,
        as_of=signal.timestamp if signal else risk.as_of if risk else None,
        data_quality=signal.data_quality if signal else risk.data_quality if risk else research.data_quality if research else "fixture",
        features=signal.features if signal else None,
    )
    related_markets = related_polymarket_markets(
        symbol,
        signal.thesis if signal else "",
        research.label if research else "",
        *(news.title for news in related_news[:3]),
    )
    return AssetContextView(
        symbol=symbol,
        latest_signal=signal,
        latest_risk=risk,
        research=research,
        related_news=related_news,
        latest_backtest=latest_backtest,
        data_reality=context_reality,
        related_polymarket_markets=related_markets,
        crowd_implied_narrative=crowd_implied_narrative(symbol, signal.thesis if signal else "", *(news.title for news in related_news[:2])),
    )


def _load_fixture(name: str) -> list[dict[str, Any]]:
    path = FIXTURES_DIR / name
    return json.loads(path.read_text(encoding="utf-8"))


def list_active_trades() -> list[ActiveTradeView]:
    return [
        ActiveTradeView(
            symbol=item["symbol"],
            strategy_name=item["strategy_name"],
            side=item["side"],
            entry_time=_parse_iso(item["entry_time"]),
            entry_price=float(item["entry_price"]),
            current_price=float(item["current_price"]),
            stop_price=float(item["stop_price"]),
            target_price=float(item["target_price"]),
            pnl_pct=float(item["pnl_pct"]),
            size_band=item["size_band"],
            status=item["status"],
            thesis=item["thesis"],
            data_quality=item.get("data_quality", "fixture"),
        )
        for item in _load_fixture("active_trades.json")
    ]


def list_wallet_balances() -> list[WalletBalanceView]:
    payload = []
    for item in _load_fixture("wallet_balances.json"):
        payload.append(
            WalletBalanceView(
                venue=item["venue"],
                account_label=item["account_label"],
                updated_at=_parse_iso(item["updated_at"]),
                total_usd=float(item["total_usd"]),
                available_usd=float(item["available_usd"]),
                data_quality=item.get("data_quality", "fixture"),
                balances=[
                    WalletBalanceLineView(
                        asset=row["asset"],
                        free=float(row["free"]),
                        locked=float(row["locked"]),
                        usd_value=float(row["usd_value"]),
                    )
                    for row in item["balances"]
                ],
            )
        )
    return payload


def list_journal_reviews() -> list[JournalReviewView]:
    return [
        JournalReviewView(
            symbol=item["symbol"],
            entered_at=_parse_iso(item["entered_at"]),
            note=item["note"],
            mood=item["mood"],
            tags=item["tags"],
            setup_quality=int(item.get("setup_quality", 3)),
            execution_quality=int(item.get("execution_quality", 3)),
            follow_through=item.get("follow_through", "partial"),
            outcome=item.get("outcome", "open"),
            lessons=item.get("lessons", ""),
            review_status=item.get("review_status", "logged"),
        )
        for item in _load_fixture("journal_entries.json")
    ]
