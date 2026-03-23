from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

from sqlalchemy import delete
from sqlmodel import Session, select

from app.alerting.service import dispatch_alert
from app.alerting.sinks import DiscordAlertSink, TelegramAlertSink
from app.core.clock import naive_utc_now
from app.core.database import engine
from app.core.settings import Settings
from app.models.entities import AlertRecord
from app.models.schemas import AlertEnvelope
from app.services.operator_console import _compose_stale_data_alert, list_alerts, refresh_alerts
from app.services.pipeline import seed_and_refresh


def _base_alert(**overrides: object) -> AlertEnvelope:
    payload = {
        "alert_id": "alert_test_base",
        "created_at": naive_utc_now(),
        "signal_id": "sig_test",
        "risk_report_id": "risk_test",
        "asset_ids": ["BTC"],
        "severity": "info",
        "category": "signal_ranked",
        "channel_targets": ["in_app"],
        "title": "BTC ranked signal",
        "body": "Regression alert body.",
        "tags": ["btc", "signal"],
        "dedupe_key": "signal_ranked:sig_test",
        "data_quality": "fixture",
    }
    payload.update(overrides)
    return AlertEnvelope(**payload)


def test_pipeline_generates_persisted_alerts(seeded_summary) -> None:
    with Session(engine) as session:
        alerts = list_alerts(session)
        categories = {row.category for row in alerts}

    assert seeded_summary.signals_emitted == 2
    assert "signal_ranked" in categories
    assert "high_risk_signal" in categories
    assert "daily_digest_summary" in categories


def test_dispatch_alert_suppresses_exact_dedupe() -> None:
    with Session(engine) as session:
        session.exec(delete(AlertRecord))
        session.commit()

        first = dispatch_alert(session, _base_alert())
        second = dispatch_alert(session, _base_alert(alert_id="alert_test_dup"))

        assert first.status == "sent"
        assert second.status == "suppressed"
        assert second.suppressed_reason == "dedupe_window"


def test_dispatch_alert_suppresses_cooldown_replays() -> None:
    with Session(engine) as session:
        session.exec(delete(AlertRecord))
        session.commit()

        first = dispatch_alert(session, _base_alert(dedupe_key="signal_ranked:sig_one", signal_id="sig_one"))
        second = dispatch_alert(
            session,
            _base_alert(
                alert_id="alert_test_cooldown",
                dedupe_key="signal_ranked:sig_two",
                signal_id="sig_two",
                created_at=naive_utc_now() + timedelta(minutes=1),
            ),
        )

        assert first.status == "sent"
        assert second.status == "suppressed"
        assert second.suppressed_reason == "cooldown_window"


def test_list_alerts_hides_suppressed_duplicates_from_ui() -> None:
    with Session(engine) as session:
        session.exec(delete(AlertRecord))
        session.commit()

        dispatch_alert(session, _base_alert())
        dispatch_alert(session, _base_alert(alert_id="alert_test_dup"))

        visible = list_alerts(session)

    assert len(visible) == 1
    assert visible[0].status == "sent"


def test_list_alerts_prefers_latest_actionable_alert_for_same_operator_slot() -> None:
    with Session(engine) as session:
        session.exec(delete(AlertRecord))
        session.commit()

        dispatch_alert(
            session,
            _base_alert(
                alert_id="alert_test_old",
                signal_id="sig_old",
                dedupe_key="signal_ranked:sig_old",
                body="University of Michigan Inflation Expectations is within 38.0h.",
                created_at=naive_utc_now() - timedelta(days=1),
            ),
        )
        dispatch_alert(
            session,
            _base_alert(
                alert_id="alert_test_new",
                signal_id="sig_new",
                dedupe_key="signal_ranked:sig_new",
                body="University of Michigan Inflation Expectations is within 1.7h.",
                created_at=naive_utc_now(),
            ),
        )

        visible = list_alerts(session)

    assert len(visible) == 1
    assert visible[0].body == "University of Michigan Inflation Expectations is within 1.7h."


def test_refresh_alerts_replaces_legacy_recomputed_signal_bodies() -> None:
    seed_and_refresh()
    with Session(engine) as session:
        dispatch_alert(
            session,
            _base_alert(
                alert_id="alert_test_legacy_ranked",
                signal_id="sig_legacy",
                dedupe_key="signal_ranked:sig_legacy",
                body="University of Michigan Inflation Expectations is within 38.0h.",
                created_at=naive_utc_now() - timedelta(days=1),
            ),
        )

        refresh_alerts(session)
        visible = list_alerts(session)

    ranked_bodies = [row.body for row in visible if row.category == "signal_ranked"]
    assert ranked_bodies
    assert all("38.0h" not in body for body in ranked_bodies)


def test_stale_alerts_dedupe_across_freshness_minute_changes() -> None:
    ribbon = SimpleNamespace(
        last_refresh=naive_utc_now(),
        data_freshness_minutes=670,
        freshness_status="stale",
        source_mode="live",
        market_data_mode="public_live",
    )
    ribbon_later = SimpleNamespace(
        last_refresh=naive_utc_now() + timedelta(minutes=5),
        data_freshness_minutes=675,
        freshness_status="stale",
        source_mode="live",
        market_data_mode="public_live",
    )

    with Session(engine) as session:
        session.exec(delete(AlertRecord))
        session.commit()

        first = dispatch_alert(session, _compose_stale_data_alert(ribbon))
        second = dispatch_alert(session, _compose_stale_data_alert(ribbon_later))

        assert first.status == "sent"
        assert second.status == "sent"
        assert second.alert_id == first.alert_id
        assert session.exec(select(AlertRecord)).all().__len__() == 1


def test_sink_payload_formatting_is_stable() -> None:
    telegram = TelegramAlertSink(
        Settings(telegram_bot_token="token", telegram_chat_id="chat", alert_enable_telegram=True)
    )
    discord = DiscordAlertSink(
        Settings(discord_webhook_url="https://discord.test/webhook", alert_enable_discord=True)
    )
    alert = _base_alert(channel_targets=["telegram", "discord"], severity="warning")

    telegram_payload = telegram.format_payload(alert)
    discord_payload = discord.format_payload(alert)

    assert telegram_payload["chat_id"] == "chat"
    assert "BTC ranked signal" in telegram_payload["text"]
    assert discord_payload["embeds"][0]["title"] == "BTC ranked signal"
    assert "Assets: BTC" in discord_payload["embeds"][0]["description"]


def test_dispatch_alert_records_failed_external_delivery() -> None:
    with Session(engine) as session:
        session.exec(delete(AlertRecord))
        session.commit()

        failed = dispatch_alert(
            session,
            _base_alert(
                alert_id="alert_test_failed",
                severity="warning",
                channel_targets=["telegram"],
                dedupe_key="signal_ranked:sig_failed",
                signal_id="sig_failed",
            ),
        )
        persisted = session.exec(select(AlertRecord).where(AlertRecord.alert_id == failed.alert_id)).first()

    assert failed.status == "failed"
    assert persisted is not None
    assert "telegram" in persisted.delivery_metadata_json["failed_channels"]
