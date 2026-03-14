from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "apps" / "backend"
SNAPSHOT_DIR = BACKEND_DIR / "tests" / "contract_snapshots"
RUNTIME_DIR = ROOT / "data" / "contract_snapshot_runtime"


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    if RUNTIME_DIR.exists():
        shutil.rmtree(RUNTIME_DIR, ignore_errors=True)
    (RUNTIME_DIR / "sqlite").mkdir(parents=True, exist_ok=True)
    (RUNTIME_DIR / "parquet").mkdir(parents=True, exist_ok=True)

    os.environ["AI_TRADER_USE_SAMPLE_ONLY"] = "true"
    os.environ["AI_TRADER_ENABLE_SCHEDULER"] = "false"
    os.environ["AI_TRADER_FIXTURE_NOW_ISO"] = "2026-03-15T11:30:00+00:00"
    os.environ["AI_TRADER_SQLITE_PATH"] = str(RUNTIME_DIR / "sqlite" / "ai_trader_contracts.db")
    os.environ["AI_TRADER_DUCKDB_PATH"] = str(RUNTIME_DIR / "sqlite" / "ai_trader_contracts.duckdb")
    os.environ["AI_TRADER_PARQUET_DIR"] = str(RUNTIME_DIR / "parquet")

    sys.path.insert(0, str(BACKEND_DIR))

    from fastapi.testclient import TestClient
    from app.main import app
    from app.services.pipeline import seed_and_refresh

    seed_and_refresh()
    routes = {
        "signals.json": ("GET", "/api/signals"),
        "signals_high_risk.json": ("GET", "/api/signals/high-risk"),
        "risk_latest.json": ("GET", "/api/risk/latest"),
        "news.json": ("GET", "/api/news"),
        "watchlist.json": ("GET", "/api/watchlist"),
        "dashboard_overview.json": ("GET", "/api/dashboard/overview"),
    }
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    with TestClient(app) as client:
        for filename, (method, route) in routes.items():
            response = client.request(method, route)
            response.raise_for_status()
            _write_json(SNAPSHOT_DIR / filename, response.json())
    print(f"Saved contract snapshots to {SNAPSHOT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
