from __future__ import annotations

from typing import Protocol

from sqlmodel import Session

from app.models.entities import AlertRecord
from app.models.schemas import AlertEnvelope


class AlertSink(Protocol):
    def publish(self, alert: AlertEnvelope) -> None: ...


class InAppAlertSink:
    def __init__(self, session: Session) -> None:
        self.session = session

    def publish(self, alert: AlertEnvelope) -> None:
        self.session.add(
            AlertRecord(
                alert_id=alert.alert_id,
                created_at=alert.created_at,
                category=alert.category,
                severity=alert.severity,
                title=alert.title,
                message=alert.message,
                symbol=alert.symbol,
                signal_id=alert.signal_id,
                risk_report_id=alert.risk_report_id,
                trade_id=alert.trade_id,
                freshness_minutes=alert.freshness_minutes,
                data_quality=alert.data_quality,
                tags_json=alert.tags,
                status=alert.status,
                metadata_json=alert.metadata,
            )
        )
