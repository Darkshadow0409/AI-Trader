from __future__ import annotations

import json
from pathlib import Path


SNAPSHOT_DIR = Path(__file__).resolve().parent / "contract_snapshots"
ROUTES = {
    "signals.json": "/api/signals",
    "signals_high_risk.json": "/api/signals/high-risk",
    "risk_latest.json": "/api/risk/latest",
    "news.json": "/api/news",
    "watchlist.json": "/api/watchlist",
    "dashboard_overview.json": "/api/dashboard/overview",
}


def test_fixture_contract_snapshots_remain_stable(client, seeded_summary) -> None:
    for filename, route in ROUTES.items():
        response = client.get(route)

        assert response.status_code == 200
        expected = json.loads((SNAPSHOT_DIR / filename).read_text(encoding="utf-8"))
        assert response.json() == expected
