from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from app.core.settings import get_settings


settings = get_settings()
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "Referer": "https://polymarket.com/",
    "Origin": "https://polymarket.com",
}


def _request_json(path: str, query: dict[str, Any]) -> Any:
    base_url = settings.polymarket_base_url.rstrip("/")
    encoded_query = urllib.parse.urlencode({key: value for key, value in query.items() if value is not None})
    url = f"{base_url}{path}"
    if encoded_query:
        url = f"{url}?{encoded_query}"
    request = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    with urllib.request.urlopen(request, timeout=settings.polymarket_timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_events(limit: int = 40, active: bool = True, closed: bool = False) -> list[dict[str, Any]]:
    payload = _request_json(
        "/events",
        {
            "limit": limit,
            "active": str(active).lower(),
            "closed": str(closed).lower(),
        },
    )
    return payload if isinstance(payload, list) else []
