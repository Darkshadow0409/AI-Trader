from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from sqlmodel import Session, desc, select

from app.models.entities import MarketBar, PaperTradeRecord, RiskReport, SignalRecord, TradeTicketRecord, WatchlistItem
from app.models.schemas import (
    BarView,
    ChartIndicatorPointView,
    ChartIndicatorSetView,
    ChartOverlayLineView,
    ChartOverlayMarkerView,
    ChartOverlayView,
    MarketChartView,
    WatchlistSummaryView,
)
from app.services.data_reality import asset_reality, freshness_minutes, freshness_state, latest_pipeline_run
from app.services.market_identity import instrument_mapping_view, market_data_mode, resolve_symbol


SUPPORTED_TIMEFRAMES = ["15m", "1h", "4h", "1d"]


def _ema(values: list[float], period: int) -> list[float | None]:
    if not values:
        return []
    multiplier = 2 / (period + 1)
    output: list[float | None] = []
    ema_value: float | None = None
    running: list[float] = []
    for value in values:
        running.append(value)
        if ema_value is None:
            if len(running) < period:
                output.append(None)
                continue
            ema_value = sum(running[-period:]) / period
        else:
            ema_value = (value - ema_value) * multiplier + ema_value
        output.append(round(ema_value, 4))
    return output


def _rsi(values: list[float], period: int = 14) -> list[float | None]:
    if len(values) < 2:
        return [None for _ in values]
    gains: list[float] = [0.0]
    losses: list[float] = [0.0]
    for previous, current in zip(values, values[1:], strict=False):
        delta = current - previous
        gains.append(max(delta, 0.0))
        losses.append(abs(min(delta, 0.0)))
    result: list[float | None] = [None] * len(values)
    avg_gain = 0.0
    avg_loss = 0.0
    for index in range(1, len(values)):
        if index < period:
            continue
        if index == period:
            avg_gain = sum(gains[1 : period + 1]) / period
            avg_loss = sum(losses[1 : period + 1]) / period
        else:
            avg_gain = ((avg_gain * (period - 1)) + gains[index]) / period
            avg_loss = ((avg_loss * (period - 1)) + losses[index]) / period
        if avg_loss == 0:
            result[index] = 100.0
            continue
        relative_strength = avg_gain / avg_loss
        result[index] = round(100 - (100 / (1 + relative_strength)), 4)
    return result


def _atr(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> list[float | None]:
    if not highs:
        return []
    true_ranges: list[float] = []
    previous_close: float | None = None
    for high, low, close in zip(highs, lows, closes, strict=False):
        if previous_close is None:
            true_range = high - low
        else:
            true_range = max(high - low, abs(high - previous_close), abs(low - previous_close))
        true_ranges.append(true_range)
        previous_close = close
    result: list[float | None] = [None] * len(true_ranges)
    atr_value: float | None = None
    for index, true_range in enumerate(true_ranges):
        if index + 1 < period:
            continue
        if atr_value is None:
            atr_value = sum(true_ranges[:period]) / period
        else:
            atr_value = ((atr_value * (period - 1)) + true_range) / period
        result[index] = round(atr_value, 4)
    return result


def _indicator_points(rows: list[MarketBar], values: Iterable[float | None]) -> list[ChartIndicatorPointView]:
    points: list[ChartIndicatorPointView] = []
    for row, value in zip(rows, values, strict=False):
        if value is None:
            continue
        points.append(ChartIndicatorPointView(timestamp=row.timestamp, value=float(value)))
    return points


def _midpoint(zone: dict[str, object]) -> float | None:
    low = zone.get("low", zone.get("min"))
    high = zone.get("high", zone.get("max"))
    if low is None or high is None:
        return None
    return round((float(low) + float(high)) / 2, 4)


def _build_indicator_set(rows: list[MarketBar]) -> ChartIndicatorSetView:
    closes = [row.close for row in rows]
    highs = [row.high for row in rows]
    lows = [row.low for row in rows]
    return ChartIndicatorSetView(
        ema_20=_indicator_points(rows, _ema(closes, 20)),
        ema_50=_indicator_points(rows, _ema(closes, 50)),
        ema_200=_indicator_points(rows, _ema(closes, 200)),
        rsi_14=_indicator_points(rows, _rsi(closes, 14)),
        atr_14=_indicator_points(rows, _atr(highs, lows, closes, 14)),
    )


def _build_overlays(session: Session, symbol: str) -> ChartOverlayView:
    overlay = ChartOverlayView()
    latest_signal = session.exec(
        select(SignalRecord).where(SignalRecord.symbol == symbol).order_by(desc(SignalRecord.timestamp))
    ).first()
    latest_risk = session.exec(
        select(RiskReport).where(RiskReport.symbol == symbol).order_by(desc(RiskReport.as_of))
    ).first()
    latest_ticket = session.exec(
        select(TradeTicketRecord).where(TradeTicketRecord.symbol == symbol).order_by(desc(TradeTicketRecord.created_at))
    ).first()
    latest_trade = session.exec(
        select(PaperTradeRecord).where(PaperTradeRecord.symbol == symbol).order_by(desc(PaperTradeRecord.updated_at))
    ).first()

    if latest_signal:
        overlay.markers.append(
            ChartOverlayMarkerView(
                marker_id=f"signal-{latest_signal.signal_id}",
                timestamp=latest_signal.timestamp,
                label=f"signal {latest_signal.signal_type}",
                kind="signal",
                tone="accent",
            )
        )
        if latest_risk is not None:
            overlay.price_lines.append(
                ChartOverlayLineView(
                    line_id=f"invalidation-{latest_signal.signal_id}",
                    label="invalidation",
                    value=latest_risk.stop_price,
                    kind="invalidation",
                    tone="warning",
                )
            )
        target_base = latest_signal.features_json.get("target_base")
        target_stretch = latest_signal.features_json.get("target_stretch")
        if target_base is not None:
            overlay.price_lines.append(
                ChartOverlayLineView(
                    line_id=f"target-base-{latest_signal.signal_id}",
                    label="target base",
                    value=float(target_base),
                    kind="target",
                    tone="positive",
                )
            )
        if target_stretch is not None:
            overlay.price_lines.append(
                ChartOverlayLineView(
                    line_id=f"target-stretch-{latest_signal.signal_id}",
                    label="target stretch",
                    value=float(target_stretch),
                    kind="target",
                    tone="positive",
                )
            )
    if latest_risk:
        overlay.price_lines.append(
            ChartOverlayLineView(
                line_id=f"stop-{latest_risk.risk_report_id}",
                label="risk stop",
                value=latest_risk.stop_price,
                kind="stop",
                tone="negative",
            )
        )
        entry_reference = latest_risk.report_json.get("entry_reference")
        if entry_reference is not None:
            overlay.price_lines.append(
                ChartOverlayLineView(
                    line_id=f"entry-{latest_risk.risk_report_id}",
                    label="entry reference",
                    value=float(entry_reference),
                    kind="entry",
                    tone="accent",
                )
            )
    if latest_ticket:
        overlay.markers.append(
            ChartOverlayMarkerView(
                marker_id=f"ticket-{latest_ticket.ticket_id}",
                timestamp=latest_ticket.created_at,
                label=f"ticket {latest_ticket.status}",
                kind="ticket",
                tone="warning",
            )
        )
        zone_mid = _midpoint(latest_ticket.proposed_entry_zone_json)
        if zone_mid is not None:
            overlay.price_lines.append(
                ChartOverlayLineView(
                    line_id=f"ticket-zone-{latest_ticket.ticket_id}",
                    label="ticket zone mid",
                    value=zone_mid,
                    kind="entry_zone",
                    tone="accent",
                )
            )
    if latest_trade:
        event_time = latest_trade.opened_at or latest_trade.updated_at
        overlay.markers.append(
            ChartOverlayMarkerView(
                marker_id=f"trade-{latest_trade.trade_id}",
                timestamp=event_time,
                label=f"trade {latest_trade.status}",
                kind="trade",
                tone="positive" if "win" in latest_trade.status else "accent",
            )
        )
        if latest_trade.actual_entry is not None:
            overlay.price_lines.append(
                ChartOverlayLineView(
                    line_id=f"trade-entry-{latest_trade.trade_id}",
                    label="trade entry",
                    value=latest_trade.actual_entry,
                    kind="trade_entry",
                    tone="accent",
                )
            )
        overlay.price_lines.append(
            ChartOverlayLineView(
                line_id=f"trade-stop-{latest_trade.trade_id}",
                label="trade stop",
                value=latest_trade.stop_price,
                kind="stop",
                tone="negative",
            )
        )
    return overlay


def market_chart_view(session: Session, symbol: str, timeframe: str) -> MarketChartView:
    requested_symbol = symbol.upper()
    normalized_symbol = resolve_symbol(requested_symbol)
    normalized_timeframe = timeframe.lower()
    all_rows = session.exec(
        select(MarketBar).where(MarketBar.symbol == normalized_symbol).order_by(MarketBar.timestamp.asc())
    ).all()
    available_timeframes = [value for value in SUPPORTED_TIMEFRAMES if any(row.timeframe == value for row in all_rows)]
    rows = [row for row in all_rows if row.timeframe == normalized_timeframe]
    latest_run = latest_pipeline_run(session)
    source_mode = latest_run.source_mode if latest_run else "sample"
    data_mode = market_data_mode(session)
    mapping = instrument_mapping_view(normalized_symbol, requested_symbol=requested_symbol)

    if not rows:
        reality = asset_reality(session, normalized_symbol, as_of=None, data_quality="missing")
        available_label = ", ".join(available_timeframes) if available_timeframes else "none"
        return MarketChartView(
            symbol=normalized_symbol,
            timeframe=normalized_timeframe,
            available_timeframes=available_timeframes,
            status="no_data",
            status_note=f"No {normalized_timeframe} bars are available for {normalized_symbol}. Available timeframes: {available_label}.",
            source_mode=source_mode,
            market_data_mode=data_mode,
            freshness_minutes=9999,
            freshness_state="unusable",
            data_quality="missing",
            is_fixture_mode=source_mode == "sample",
            bars=[],
            indicators=ChartIndicatorSetView(),
            overlays=ChartOverlayView(),
            instrument_mapping=mapping,
            data_reality=reality,
        )

    latest_bar = rows[-1]
    age_minutes = freshness_minutes(latest_bar.timestamp)
    state = freshness_state(age_minutes, 240 if normalized_timeframe == "1d" else 60)
    note_parts = []
    if source_mode == "sample" or latest_bar.data_quality == "fixture":
        note_parts.append("Fixture mode is active. Use this chart for research, paper workflow, and review, not live execution claims.")
    elif data_mode == "public_live":
        note_parts.append("Live public data is active where available. Broker-truth symbols remain labeled explicitly when the current source is public or proxy-grade.")
    elif data_mode == "broker_live":
        note_parts.append("Broker-aligned live mode is active for available instruments.")
    if state in {"stale", "degraded", "unusable"}:
        note_parts.append(f"Data freshness is {state}. Review the latest refresh before acting.")
    if normalized_timeframe != "1d":
        note_parts.append("Current fixture data is strongest on 1d bars. Intraday availability depends on what has been seeded locally.")
    if not mapping.broker_truth:
        note_parts.append(mapping.mapping_notes)
    return MarketChartView(
        symbol=normalized_symbol,
        timeframe=normalized_timeframe,
        available_timeframes=available_timeframes,
        status="stale" if state in {"stale", "degraded", "unusable"} else "ok",
        status_note=" ".join(note_parts) or "Chart data loaded from the local-first store.",
        source_mode=source_mode,
        market_data_mode=data_mode,
        freshness_minutes=age_minutes,
        freshness_state=state,
        data_quality=latest_bar.data_quality,
        is_fixture_mode=source_mode == "sample" or latest_bar.data_quality == "fixture",
        bars=[BarView.model_validate(row.model_dump()) for row in rows],
        indicators=_build_indicator_set(rows),
        overlays=_build_overlays(session, normalized_symbol),
        instrument_mapping=mapping,
        data_reality=asset_reality(
            session,
            normalized_symbol,
            as_of=latest_bar.timestamp,
            data_quality=latest_bar.data_quality,
        ),
    )


def list_watchlist_summaries(session: Session) -> list[WatchlistSummaryView]:
    rows = session.exec(select(WatchlistItem).order_by(desc(WatchlistItem.last_signal_score))).all()
    payload: list[WatchlistSummaryView] = []
    data_mode = market_data_mode(session)
    for row in rows:
        bars = session.exec(
            select(MarketBar)
            .where(MarketBar.symbol == row.symbol)
            .where(MarketBar.timeframe == "1d")
            .order_by(desc(MarketBar.timestamp))
            .limit(20)
        ).all()
        ordered = list(reversed(bars))
        latest_bar = ordered[-1] if ordered else None
        first_bar = ordered[0] if ordered else None
        reality = asset_reality(
            session,
            row.symbol,
            as_of=latest_bar.timestamp if latest_bar else None,
            data_quality=latest_bar.data_quality if latest_bar else "missing",
        )
        payload.append(
            WatchlistSummaryView(
                symbol=row.symbol,
                label=row.label,
                status=row.status,
                last_price=round(latest_bar.close, 2) if latest_bar else 0.0,
                change_pct=round((((latest_bar.close / first_bar.close) - 1) * 100), 2) if latest_bar and first_bar and first_bar.close else 0.0,
                freshness_minutes=freshness_minutes(latest_bar.timestamp) if latest_bar else 9999,
                freshness_state=freshness_state(freshness_minutes(latest_bar.timestamp), 240) if latest_bar else "unusable",
                realism_grade=reality.provenance.realism_grade if reality else "n/a",
                market_data_mode=data_mode,
                source_label=(reality.provenance.source_type if reality else "missing"),
                top_setup_tag="watch" if row.last_signal_score <= 0 else f"score {row.last_signal_score:.0f}",
                sparkline=[round(item.close, 2) for item in ordered],
                instrument_mapping=instrument_mapping_view(row.symbol),
            )
        )
    return payload
