from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app.core.database import engine
from app.models.entities import WatchlistItem
from app.services import dashboard_data
from app.services.market_views import list_watchlist_summaries


def test_event_signal_thesis_marks_completed_events_as_cleared(monkeypatch) -> None:
    monkeypatch.setattr(dashboard_data, "naive_utc_now", lambda: datetime(2026, 3, 21, 11, 0, 0))

    thesis = dashboard_data._event_signal_thesis(
        "University of Michigan Inflation Expectations is within 14.0h. Reduce conviction and treat breakouts as event-sensitive until the release clears.",
        datetime(2026, 3, 20, 12, 0, 0),
        {"hours_to_event": 14},
    )

    assert "cleared" in thesis
    assert "is within" not in thesis


def test_event_signal_thesis_keeps_upcoming_events_future_only(monkeypatch) -> None:
    monkeypatch.setattr(dashboard_data, "naive_utc_now", lambda: datetime(2026, 3, 20, 18, 0, 0))

    thesis = dashboard_data._event_signal_thesis(
        "University of Michigan Inflation Expectations is within 14.0h. Reduce conviction and treat breakouts as event-sensitive until the release clears.",
        datetime(2026, 3, 20, 12, 0, 0),
        {"hours_to_event": 14},
    )

    assert "is within" in thesis
    assert "cleared" not in thesis


def test_watchlist_summary_backfills_default_commodity_board_when_persisted_rows_are_missing(seeded_summary) -> None:  # noqa: ARG001
    with Session(engine) as session:
        silver_row = session.exec(select(WatchlistItem).where(WatchlistItem.symbol == "SILVER")).first()
        assert silver_row is not None
        session.delete(silver_row)
        session.commit()

        payload = list_watchlist_summaries(session)

    assert [row.symbol for row in payload[:3]] == ["WTI", "GOLD", "SILVER"]
    silver_summary = next(row for row in payload if row.symbol == "SILVER")
    assert silver_summary.instrument_mapping.trader_symbol == "XAGUSD"
