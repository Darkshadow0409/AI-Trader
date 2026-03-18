from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from app.core.clock import naive_utc_now
from app.core.database import engine
from app.models.entities import MacroEvent
from app.services.dashboard_data import dashboard_ribbon
from app.services.pipeline import seed_and_refresh
from app.services.sample_data import generate_sample_ohlcv


def test_dashboard_ribbon_uses_future_event_only() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        now = naive_utc_now()
        for index, event in enumerate(session.exec(select(MacroEvent)).all()):
            event.event_time = now - timedelta(minutes=index + 1)
            session.add(event)
        session.commit()

        ribbon = dashboard_ribbon(session)

    assert ribbon.next_event is None


def test_fixture_generation_keeps_btc_and_eth_distinct() -> None:
    btc = generate_sample_ohlcv("BTC", bars=8)
    eth = generate_sample_ohlcv("ETH", bars=8)

    assert [row["close"] for row in btc] != [row["close"] for row in eth]
    assert [row["volume"] for row in btc] != [row["volume"] for row in eth]
