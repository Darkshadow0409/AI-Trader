from __future__ import annotations

from datetime import UTC, datetime

from app.core.settings import get_settings


def fixture_utc_now() -> datetime:
    settings = get_settings()
    return datetime.fromisoformat(settings.fixture_now_iso.replace("Z", "+00:00")).astimezone(UTC)


def utc_now() -> datetime:
    settings = get_settings()
    return fixture_utc_now() if settings.use_sample_only else datetime.now(UTC)


def naive_utc_now() -> datetime:
    return utc_now().replace(tzinfo=None)
