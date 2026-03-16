from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from app.core.clock import naive_utc_now
from app.models.entities import MarketBar, StrategyRegistryEntry
from app.models.schemas import BarView, ReplayFrameView, ReplayView, ScenarioStressItemView, ScenarioStressSummaryView
from app.services.dashboard_data import list_risk_views, list_signal_views
from app.services.operator_console import list_alerts
from app.services.paper_trading import (
    ACTIVE_PAPER_STATUSES,
    _scenario_shock,
    get_paper_trade_detail,
    list_paper_trades,
)


def _frame_times(anchor, event_window_minutes: int) -> list:
    if anchor is None:
        anchor = naive_utc_now()
    steps = [anchor - timedelta(minutes=event_window_minutes), anchor, anchor + timedelta(minutes=event_window_minutes)]
    return sorted(steps)


def replay_view(
    session: Session,
    *,
    symbol: str,
    signal_id: str | None = None,
    trade_id: str | None = None,
    event_window_minutes: int = 180,
) -> ReplayView:
    signal_map = {row.signal_id: row for row in list_signal_views(session)}
    risk_views = list_risk_views(session)
    alerts = list_alerts(session)
    paper_trades = list_paper_trades(session)
    trade_detail = get_paper_trade_detail(session, trade_id) if trade_id else None
    signal = signal_map.get(signal_id or "") if signal_id else next((row for row in signal_map.values() if row.symbol == symbol), None)
    anchor = None
    if trade_detail is not None:
        anchor = trade_detail.opened_at or trade_detail.closed_at
    elif signal is not None:
        anchor = signal.timestamp
    frames: list[ReplayFrameView] = []
    for cursor in _frame_times(anchor, event_window_minutes):
        bars = [
            row
            for row in session.exec(
                select(MarketBar).where(MarketBar.symbol == symbol).order_by(MarketBar.timestamp.asc())
            ).all()
            if abs((row.timestamp - cursor).total_seconds()) <= event_window_minutes * 60
        ]
        frames.append(
            ReplayFrameView(
                cursor=cursor,
                bars=[
                    BarView(
                        symbol=row.symbol,
                        timestamp=row.timestamp,
                        open=row.open,
                        high=row.high,
                        low=row.low,
                        close=row.close,
                        volume=row.volume,
                    )
                    for row in bars[-6:]
                ],
                signals=[
                    row
                    for row in signal_map.values()
                    if row.symbol == symbol and abs((row.timestamp - cursor).total_seconds()) <= event_window_minutes * 60
                ],
                risks=[
                    row
                    for row in risk_views
                    if row.symbol == symbol and abs((row.as_of - cursor).total_seconds()) <= event_window_minutes * 60
                ],
                alerts=[
                    row
                    for row in alerts
                    if symbol in row.asset_ids and abs((row.created_at - cursor).total_seconds()) <= event_window_minutes * 60
                ],
                paper_trades=[
                    row
                    for row in paper_trades
                    if row.symbol == symbol
                    and (
                        trade_id is None
                        or row.trade_id == trade_id
                        or row.signal_id == signal_id
                    )
                ],
            )
        )
    return ReplayView(
        generated_at=naive_utc_now(),
        symbol=symbol,
        signal_id=signal_id,
        trade_id=trade_id,
        event_window_minutes=event_window_minutes,
        frames=frames,
    )


def scenario_stress_summary(
    session: Session,
    *,
    symbol: str | None = None,
    signal_id: str | None = None,
    trade_id: str | None = None,
) -> ScenarioStressSummaryView:
    signals = list_signal_views(session)
    risks = list_risk_views(session)
    trades = list_paper_trades(session, statuses=ACTIVE_PAPER_STATUSES)
    target_signals = [row for row in signals if (symbol is None or row.symbol == symbol) and (signal_id is None or row.signal_id == signal_id)]
    if not target_signals and signals and signal_id is None and symbol is None:
        target_signals = signals[:2]
    target_trades = [row for row in trades if (symbol is None or row.symbol == symbol) and (trade_id is None or row.trade_id == trade_id)]
    promoted = session.exec(select(StrategyRegistryEntry).where(StrategyRegistryEntry.lifecycle_state == "promoted")).all()
    if not promoted:
        promoted = session.exec(select(StrategyRegistryEntry)).all()[:1]
    signal_items: list[ScenarioStressItemView] = []
    trade_items: list[ScenarioStressItemView] = []
    strategy_items: list[ScenarioStressItemView] = []

    for row in target_signals:
        for scenario in ("btc_down", "oil_spike", "dxy_up", "yield_shock", "vol_spike"):
            shock_pct = _scenario_shock(row.symbol, scenario)
            signal_items.append(
                ScenarioStressItemView(
                    scenario=scenario,
                    entity_type="signal",
                    entity_id=row.signal_id,
                    symbol=row.symbol,
                    severity="critical" if abs(shock_pct) >= 8 else "warning",
                    shock_pct=shock_pct,
                    pnl_impact_pct=round(shock_pct * (1 if row.direction != "short" else -1), 2),
                    confidence_impact=round(min(1.0, abs(shock_pct) / 12), 2),
                    rationale=f"{row.symbol} signal stress uses deterministic {scenario} shock with score {row.score:.1f}.",
                )
            )

    for row in target_trades:
        detail = get_paper_trade_detail(session, row.trade_id)
        if detail is None:
            continue
        trade_items.extend(detail.scenario_stress)

    for row in promoted:
        for scenario in ("btc_down", "oil_spike", "dxy_up", "yield_shock", "vol_spike"):
            shock_pct = _scenario_shock(row.underlying_symbol, scenario)
            strategy_items.append(
                ScenarioStressItemView(
                    scenario=scenario,
                    entity_type="strategy",
                    entity_id=row.name,
                    symbol=row.underlying_symbol,
                    severity="critical" if abs(shock_pct) >= 8 or row.proxy_grade else "warning",
                    shock_pct=shock_pct,
                    pnl_impact_pct=round(shock_pct * 0.8, 2),
                    confidence_impact=round(min(1.0, abs(shock_pct) / 14 + (0.1 if row.proxy_grade else 0.0)), 2),
                    rationale=f"Promoted strategy {row.name} inherits deterministic {scenario} stress from {row.underlying_symbol}.",
                )
            )

    return ScenarioStressSummaryView(
        generated_at=naive_utc_now(),
        signal_impacts=signal_items,
        active_trade_impacts=trade_items,
        promoted_strategy_impacts=strategy_items,
    )
