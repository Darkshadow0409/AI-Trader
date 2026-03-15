from __future__ import annotations

import json
from typing import Any, Protocol
from urllib import request

from app.core.settings import Settings
from app.models.schemas import AlertEnvelope


SEVERITY_ORDER = {"info": 10, "warning": 20, "critical": 30}


def severity_allowed(alert_severity: str, minimum_severity: str) -> bool:
    return SEVERITY_ORDER.get(alert_severity, 0) >= SEVERITY_ORDER.get(minimum_severity, 0)


class AlertSink(Protocol):
    channel: str

    def deliver(self, alert: AlertEnvelope) -> dict[str, Any]: ...


class InAppAlertSink:
    channel = "in_app"

    def deliver(self, alert: AlertEnvelope) -> dict[str, Any]:
        return {
            "channel": self.channel,
            "status": "sent",
            "title": alert.title,
            "asset_ids": alert.asset_ids,
        }


class TelegramAlertSink:
    channel = "telegram"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def format_payload(self, alert: AlertEnvelope) -> dict[str, Any]:
        lines = [
            f"[{alert.severity.upper()}] {alert.title}",
            alert.body,
            f"assets={', '.join(alert.asset_ids) if alert.asset_ids else 'n/a'}",
            f"category={alert.category}",
            f"status={alert.status}",
        ]
        if alert.signal_id:
            lines.append(f"signal_id={alert.signal_id}")
        if alert.risk_report_id:
            lines.append(f"risk_report_id={alert.risk_report_id}")
        return {
            "chat_id": self.settings.telegram_chat_id,
            "text": "\n".join(lines),
            "disable_web_page_preview": True,
        }

    def deliver(self, alert: AlertEnvelope) -> dict[str, Any]:
        if not self.settings.telegram_bot_token or not self.settings.telegram_chat_id:
            raise ValueError("Telegram sink is not configured.")
        payload = self.format_payload(alert)
        response = request.urlopen(  # noqa: S310
            request.Request(
                url=f"https://api.telegram.org/bot{self.settings.telegram_bot_token}/sendMessage",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            ),
            timeout=10,
        )
        body = response.read().decode("utf-8")
        parsed = json.loads(body) if body else {}
        return {
            "channel": self.channel,
            "status": "sent",
            "response": parsed,
        }


class DiscordAlertSink:
    channel = "discord"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def format_payload(self, alert: AlertEnvelope) -> dict[str, Any]:
        description = [
            alert.body,
            "",
            f"Assets: {', '.join(alert.asset_ids) if alert.asset_ids else 'n/a'}",
            f"Category: {alert.category}",
        ]
        if alert.signal_id:
            description.append(f"Signal: `{alert.signal_id}`")
        if alert.risk_report_id:
            description.append(f"Risk: `{alert.risk_report_id}`")
        return {
            "embeds": [
                {
                    "title": alert.title,
                    "description": "\n".join(description),
                    "footer": {"text": f"{alert.severity} | {', '.join(alert.tags)}"},
                }
            ]
        }

    def deliver(self, alert: AlertEnvelope) -> dict[str, Any]:
        if not self.settings.discord_webhook_url:
            raise ValueError("Discord sink is not configured.")
        payload = self.format_payload(alert)
        response = request.urlopen(  # noqa: S310
            request.Request(
                url=self.settings.discord_webhook_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            ),
            timeout=10,
        )
        body = response.read().decode("utf-8")
        parsed = json.loads(body) if body else {}
        return {
            "channel": self.channel,
            "status": "sent",
            "response": parsed,
        }
