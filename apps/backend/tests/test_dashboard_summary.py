from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.main import app


def _load_home_summary() -> tuple[int, dict]:
    with TestClient(app) as client:
        response = client.get("/api/dashboard/home-summary")
        return response.status_code, response.json()


def test_home_summary_stays_available_under_repeated_parallel_loads(seeded_summary) -> None:
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: _load_home_summary(), range(8)))

    for status_code, payload in results:
        assert status_code == 200
        assert "session_state" in payload
