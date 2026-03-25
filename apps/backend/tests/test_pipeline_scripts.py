from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _run_script(script_name: str) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, f"scripts/{script_name}"],
        cwd=ROOT,
        env=os.environ.copy(),
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def test_seed_data_script_emits_deterministic_fixture_counts() -> None:
    payload = _run_script("seed_data.py")

    assert payload["source_mode"] == "sample"
    assert payload["bars_ingested"] == 7000
    assert payload["signals_emitted"] >= 3
    assert payload["risk_reports_built"] >= payload["signals_emitted"]
    assert payload["data_quality"] == "fixture"


def test_backfill_script_emits_deterministic_fixture_counts() -> None:
    payload = _run_script("backfill.py")

    assert payload["source_mode"] == "sample"
    assert payload["bars_ingested"] == 7000
    assert payload["signals_emitted"] >= 3
    assert payload["risk_reports_built"] >= payload["signals_emitted"]
    assert payload["data_quality"] == "fixture"
