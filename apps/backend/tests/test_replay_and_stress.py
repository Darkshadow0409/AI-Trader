from sqlmodel import Session

from app.core.database import engine
from app.services.paper_trading import get_paper_trade_detail, paper_trade_analytics
from app.services.pipeline import seed_and_refresh
from app.services.replay_engine import replay_view, scenario_stress_summary


def test_replay_stepping_and_timeline_generation() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        detail = get_paper_trade_detail(session, "paper_trade_closed_btc")
        assert detail is not None
        assert detail.timeline is not None
        assert len(detail.timeline.trade_actions) >= 2
        replay = replay_view(session, symbol="BTC", signal_id=detail.signal_id, trade_id=detail.trade_id, event_window_minutes=180)
        assert replay.symbol == "BTC"
        assert replay.trade_id == detail.trade_id
        assert len(replay.frames) == 3
        assert any(frame.paper_trades for frame in replay.frames)


def test_execution_realism_and_quality_are_deterministic() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        detail = get_paper_trade_detail(session, "paper_trade_invalidated_eth")
        assert detail is not None
        assert detail.execution_realism is not None
        assert detail.execution_quality is not None
        assert detail.execution_realism.entry_slippage_bps > 0
        assert detail.execution_realism.stop_slippage_bps >= detail.execution_realism.entry_slippage_bps
        assert detail.execution_quality.execution_quality in {"clean", "gap_risk", "penalized"}
        assert isinstance(detail.execution_quality.notes, list)


def test_scenario_stress_outputs_cover_signals_trades_and_strategies() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        summary = scenario_stress_summary(session, symbol="BTC")
        assert summary.signal_impacts
        assert summary.active_trade_impacts or summary.promoted_strategy_impacts
        assert any(item.scenario == "btc_down" for item in summary.signal_impacts)
        assert all(item.entity_type in {"signal", "paper_trade", "strategy"} for item in [*summary.signal_impacts, *summary.active_trade_impacts, *summary.promoted_strategy_impacts])


def test_execution_quality_aggregation_is_present() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        analytics = paper_trade_analytics(session)
        assert analytics.by_signal_quality
        assert analytics.by_plan_quality
        assert analytics.by_execution_quality
        assert all(bucket.trade_count >= 0 for bucket in analytics.by_execution_quality)
