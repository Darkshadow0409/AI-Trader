from __future__ import annotations

import json
from pathlib import Path

import httpx


class FredClient:
    def __init__(self, fixtures_dir: Path, api_key: str | None = None) -> None:
        self.fixtures_dir = fixtures_dir
        self.api_key = api_key

    def fetch_release_calendar(self) -> list[dict[str, object]]:
        path = self.fixtures_dir / "fred_events.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def fetch_series_tail(self, series_id: str) -> list[dict[str, object]]:
        if not self.api_key:
            return []
        url = "https://api.stlouisfed.org/fred/series/observations"
        params = {"series_id": series_id, "api_key": self.api_key, "file_type": "json"}
        response = httpx.get(url, params=params, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
        return payload.get("observations", [])[-10:]

