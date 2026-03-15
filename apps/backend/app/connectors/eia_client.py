from __future__ import annotations

import json
from pathlib import Path

from app.connectors.rss_news_client import RSSNewsClient
from app.core.settings import get_settings


class EIAClient:
    RSS_URL = "https://www.eia.gov/rss/press_rss.xml"

    def __init__(self, fixtures_dir: Path) -> None:
        self.fixtures_dir = fixtures_dir
        self.rss_client = RSSNewsClient()
        self.settings = get_settings()

    def fetch_news(self) -> list[dict[str, object]]:
        if self.settings.use_sample_only:
            path = self.fixtures_dir / "eia_news.json"
            return json.loads(path.read_text(encoding="utf-8"))
        try:
            items = self.rss_client.fetch(self.RSS_URL)
            return items[:5]
        except Exception:
            path = self.fixtures_dir / "eia_news.json"
            return json.loads(path.read_text(encoding="utf-8"))
