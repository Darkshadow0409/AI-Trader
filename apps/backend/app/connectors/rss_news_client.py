from __future__ import annotations

from datetime import datetime, timezone
import time

import feedparser
import httpx


class RSSNewsClient:
    def fetch(self, url: str) -> list[dict[str, object]]:
        response = httpx.get(url, timeout=10.0, follow_redirects=True)
        response.raise_for_status()
        feed = feedparser.parse(response.text)
        items: list[dict[str, object]] = []
        for entry in feed.entries:
            parsed = entry.get("published_parsed")
            published_at = (
                datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc)
                if parsed
                else datetime.now(timezone.utc)
            )
            items.append(
                {
                    "source": feed.feed.get("title", "RSS"),
                    "title": entry.get("title", ""),
                    "summary": entry.get("summary", ""),
                    "link": entry.get("link", ""),
                    "published_at": published_at.isoformat(),
                    "tags": [],
                    "sentiment_bias": 0.0,
                }
            )
        return items
