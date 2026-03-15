from __future__ import annotations

from datetime import timedelta
from time import perf_counter
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, desc, select

from app.alerting.sinks import DiscordAlertSink, InAppAlertSink, TelegramAlertSink, severity_allowed
from app.core.clock import naive_utc_now
from app.core.settings import get_settings
from app.core.telemetry import record_alert_metric
from app.models.entities import AlertRecord
from app.models.schemas import AlertEnvelope


settings = get_settings()


def stable_alert_id(*parts: object) -> str:
    return f"alert_{uuid5(NAMESPACE_URL, '|'.join(str(part) for part in parts)).hex}"


def choose_channel_targets(severity: str) -> list[str]:
    targets: list[str] = []
    if settings.alert_enable_in_app and severity_allowed(severity, settings.alert_in_app_min_severity):
        targets.append("in_app")
    if settings.alert_enable_telegram and severity_allowed(severity, settings.alert_telegram_min_severity):
        targets.append("telegram")
    if settings.alert_enable_discord and severity_allowed(severity, settings.alert_discord_min_severity):
        targets.append("discord")
    return targets


def sinks_for_targets(channel_targets: list[str]) -> dict[str, Any]:
    sinks: dict[str, Any] = {}
    if "in_app" in channel_targets:
        sinks["in_app"] = InAppAlertSink()
    if "telegram" in channel_targets:
        sinks["telegram"] = TelegramAlertSink(settings)
    if "discord" in channel_targets:
        sinks["discord"] = DiscordAlertSink(settings)
    return sinks


def _is_duplicate(session: Session, alert: AlertEnvelope) -> AlertRecord | None:
    window_start = alert.created_at - timedelta(minutes=settings.alert_dedupe_window_minutes)
    return session.exec(
        select(AlertRecord)
        .where(AlertRecord.dedupe_key == alert.dedupe_key)
        .where(AlertRecord.created_at >= window_start)
        .order_by(desc(AlertRecord.created_at))
    ).first()


def _existing_alert(session: Session, alert: AlertEnvelope) -> AlertRecord | None:
    return session.exec(select(AlertRecord).where(AlertRecord.alert_id == alert.alert_id)).first()


def _is_in_cooldown(session: Session, alert: AlertEnvelope) -> AlertRecord | None:
    if not alert.asset_ids:
        return None
    window_start = alert.created_at - timedelta(minutes=settings.alert_cooldown_minutes)
    recent = session.exec(
        select(AlertRecord)
        .where(AlertRecord.category == alert.category)
        .where(AlertRecord.created_at >= window_start)
        .order_by(desc(AlertRecord.created_at))
    ).all()
    asset_set = set(alert.asset_ids)
    for row in recent:
        if asset_set.intersection(row.asset_ids_json):
            return row
    return None


def _build_record(alert: AlertEnvelope, status: str, delivery_metadata: dict[str, Any], suppressed_reason: str | None = None) -> AlertRecord:
    return AlertRecord(
        alert_id=alert.alert_id,
        created_at=alert.created_at,
        symbol=alert.asset_ids[0] if alert.asset_ids else None,
        signal_id=alert.signal_id,
        risk_report_id=alert.risk_report_id,
        trade_id=None,
        asset_ids_json=alert.asset_ids,
        severity=alert.severity,
        category=alert.category,
        channel_targets_json=alert.channel_targets,
        title=alert.title,
        message=alert.body,
        body=alert.body,
        dedupe_key=alert.dedupe_key,
        freshness_minutes=0,
        data_quality=alert.data_quality,
        tags_json=alert.tags,
        status=status,
        metadata_json=delivery_metadata,
        delivery_metadata_json=delivery_metadata,
        suppressed_reason=suppressed_reason,
        last_attempted_at=naive_utc_now() if status in {"sent", "failed"} else None,
    )


def _suppressed_alert_id(session: Session, alert: AlertEnvelope, reason: str) -> str:
    sequence = len(session.exec(select(AlertRecord)).all()) + 1
    return stable_alert_id(alert.alert_id, reason, sequence)


def dispatch_alert(session: Session, alert: AlertEnvelope) -> AlertRecord:
    started = perf_counter()
    existing = _existing_alert(session, alert)
    if existing is not None:
        record_alert_metric(alert.category, alert.channel_targets, existing.status, (perf_counter() - started) * 1000)
        return existing

    duplicate = _is_duplicate(session, alert)
    if duplicate is not None:
        suppressed_alert = alert.model_copy(update={"alert_id": _suppressed_alert_id(session, alert, "dedupe_window")})
        record = _build_record(
            suppressed_alert,
            status="suppressed",
            delivery_metadata={"suppressed_by": duplicate.alert_id, "reason": "dedupe_window"},
            suppressed_reason="dedupe_window",
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        record_alert_metric(alert.category, alert.channel_targets, record.status, (perf_counter() - started) * 1000)
        return record

    cooldown = _is_in_cooldown(session, alert)
    if cooldown is not None:
        suppressed_alert = alert.model_copy(update={"alert_id": _suppressed_alert_id(session, alert, "cooldown_window")})
        record = _build_record(
            suppressed_alert,
            status="suppressed",
            delivery_metadata={"suppressed_by": cooldown.alert_id, "reason": "cooldown_window"},
            suppressed_reason="cooldown_window",
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        record_alert_metric(alert.category, alert.channel_targets, record.status, (perf_counter() - started) * 1000)
        return record

    targets = alert.channel_targets
    if not targets:
        suppressed_alert = alert.model_copy(update={"alert_id": _suppressed_alert_id(session, alert, "no_channel_targets")})
        record = _build_record(
            suppressed_alert,
            status="suppressed",
            delivery_metadata={"reason": "no_channel_targets"},
            suppressed_reason="no_channel_targets",
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        record_alert_metric(alert.category, alert.channel_targets, record.status, (perf_counter() - started) * 1000)
        return record
    deliveries: dict[str, Any] = {}
    sent_channels: list[str] = []
    failed_channels: list[str] = []
    for channel, sink in sinks_for_targets(targets).items():
        try:
            deliveries[channel] = sink.deliver(alert)
            sent_channels.append(channel)
        except Exception as exc:  # noqa: BLE001
            deliveries[channel] = {"channel": channel, "status": "failed", "error": str(exc)}
            failed_channels.append(channel)

    status = "sent" if sent_channels else "failed"
    record = _build_record(
        alert,
        status=status,
        delivery_metadata={
            "deliveries": deliveries,
            "sent_channels": sent_channels,
            "failed_channels": failed_channels,
        },
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    record_alert_metric(alert.category, alert.channel_targets, record.status, (perf_counter() - started) * 1000)
    return record
