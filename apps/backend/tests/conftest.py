from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[3]
TEST_RUNTIME = ROOT / "data" / f"test_runtime_{os.getpid()}"

if TEST_RUNTIME.exists():
    shutil.rmtree(TEST_RUNTIME)
(TEST_RUNTIME / "parquet").mkdir(parents=True, exist_ok=True)

os.environ["AI_TRADER_USE_SAMPLE_ONLY"] = "true"
os.environ["AI_TRADER_ENABLE_SCHEDULER"] = "false"
os.environ["AI_TRADER_FIXTURE_NOW_ISO"] = "2026-03-15T11:30:00+00:00"
os.environ["AI_TRADER_SQLITE_PATH"] = str((TEST_RUNTIME / "ai_trader_test.db").relative_to(ROOT)).replace("\\", "/")
os.environ["AI_TRADER_DUCKDB_PATH"] = str((TEST_RUNTIME / "ai_trader_test.duckdb").relative_to(ROOT)).replace("\\", "/")
os.environ["AI_TRADER_PARQUET_DIR"] = str((TEST_RUNTIME / "parquet").relative_to(ROOT)).replace("\\", "/")


@pytest.fixture()
def seeded_summary():
    from app.services.pipeline import seed_and_refresh

    return seed_and_refresh()


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
