from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Any, Iterator

from app.core.clock import naive_utc_now
from app.core.settings import get_settings


LOGGER = logging.getLogger("ai_trader")
if not LOGGER.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def diagnostics_dir() -> Path:
    path = get_settings().diagnostics_full_path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def append_event(name: str, payload: dict[str, Any]) -> None:
    event = {"timestamp": naive_utc_now().isoformat(), "name": name, **payload}
    path = diagnostics_dir() / "events.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event) + "\n")


@contextmanager
def timed_block(name: str, **context: object) -> Iterator[dict[str, Any]]:
    started = perf_counter()
    payload: dict[str, Any] = {}
    try:
        yield payload
    finally:
        duration_ms = round((perf_counter() - started) * 1000, 2)
        append_event("timed_block", {"block": name, "duration_ms": duration_ms, "context": context, "payload": payload})
        LOGGER.info("timed_block block=%s duration_ms=%.2f", name, duration_ms)


def record_pipeline_timings(step_timings: dict[str, float], summary: dict[str, Any]) -> None:
    payload = {
        "recorded_at": naive_utc_now().isoformat(),
        "step_timings_ms": step_timings,
        "summary": summary,
    }
    _write_json(diagnostics_dir() / "latest_pipeline_timings.json", payload)
    append_event("pipeline_summary", payload)


def record_route_timing(method: str, path: str, status_code: int, duration_ms: float) -> None:
    file_path = diagnostics_dir() / "route_timings.json"
    payload = _read_json(file_path, {"recorded_at": None, "routes": {}})
    key = f"{method.upper()} {path}"
    routes = payload.setdefault("routes", {})
    route = routes.setdefault(key, {"count": 0, "total_ms": 0.0, "avg_ms": 0.0, "last_ms": 0.0, "last_status": 0, "last_seen": None})
    route["count"] += 1
    route["total_ms"] = round(float(route["total_ms"]) + duration_ms, 2)
    route["avg_ms"] = round(float(route["total_ms"]) / int(route["count"]), 2)
    route["last_ms"] = round(duration_ms, 2)
    route["last_status"] = status_code
    route["last_seen"] = naive_utc_now().isoformat()
    payload["recorded_at"] = naive_utc_now().isoformat()
    _write_json(file_path, payload)


def record_alert_metric(category: str, channel_targets: list[str], status: str, duration_ms: float) -> None:
    file_path = diagnostics_dir() / "alert_metrics.json"
    payload = _read_json(file_path, {"recorded_at": None, "total_count": 0, "status_counts": {}, "channel_counts": {}, "category_counts": {}, "avg_dispatch_ms": 0.0, "total_dispatch_ms": 0.0})
    payload["total_count"] += 1
    payload["total_dispatch_ms"] = round(float(payload["total_dispatch_ms"]) + duration_ms, 2)
    payload["avg_dispatch_ms"] = round(float(payload["total_dispatch_ms"]) / int(payload["total_count"]), 2)
    payload["status_counts"][status] = int(payload["status_counts"].get(status, 0)) + 1
    payload["category_counts"][category] = int(payload["category_counts"].get(category, 0)) + 1
    for channel in channel_targets:
        payload["channel_counts"][channel] = int(payload["channel_counts"].get(channel, 0)) + 1
    payload["recorded_at"] = naive_utc_now().isoformat()
    _write_json(file_path, payload)


def record_paper_trade_event(trade_id: str, from_status: str, to_status: str, note: str, details: dict[str, Any] | None = None) -> None:
    append_event(
        "paper_trade_transition",
        {
            "trade_id": trade_id,
            "from_status": from_status,
            "to_status": to_status,
            "note": note,
            "details": details or {},
        },
    )


def write_reviewability_snapshot(filename: str, payload: dict[str, Any]) -> None:
    _write_json(diagnostics_dir() / filename, payload)


def isoformat(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None
