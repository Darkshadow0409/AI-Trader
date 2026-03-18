from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, desc, select

from app.core.clock import naive_utc_now
from app.core.settings import get_settings
from app.models.entities import OpsActionRecord
from app.models.schemas import OpsActionRequest, OpsActionSpecView, OpsActionView, OpsSummaryView
from app.services.pipeline import refresh_pipeline, seed_and_refresh


settings = get_settings()
ROOT = settings.repo_root
OPS_LOG_DIR = ROOT / "data" / "ops_logs"
OPS_LOG_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class _ActionSpec:
    action_name: str
    label: str
    category: str
    is_heavy: bool
    warning: str


ACTION_SPECS: dict[str, _ActionSpec] = {
    "system_refresh": _ActionSpec("system_refresh", "Refresh System", "safe_common", False, "Refreshes the in-app pipeline state from fixture-safe sources."),
    "fixture_refresh": _ActionSpec("fixture_refresh", "Refresh Fixture Data", "safe_common", False, "Re-seeds deterministic fixture-mode data and refreshes derived views."),
    "pilot_export": _ActionSpec("pilot_export", "Trigger Pilot Export", "safe_common", False, "Writes a timestamped pilot report under data/exports."),
    "save_contract_snapshots": _ActionSpec("save_contract_snapshots", "Save Contract Snapshots", "heavy_maintenance", True, "Captures fixture-mode API contract snapshots for regression review."),
    "build_review_bundle": _ActionSpec("build_review_bundle", "Build Review Bundle", "heavy_maintenance", True, "Runs the compact review artifact builder and can take noticeable time."),
    "verify_fast": _ActionSpec("verify_fast", "Run Fast Verify", "safe_common", False, "Runs the fast local verification path."),
    "verify_full": _ActionSpec("verify_full", "Run Full Verify", "heavy_maintenance", True, "Runs the full local verification chain and is slower."),
}


def _stable_id(prefix: str, *parts: object) -> str:
    return f"{prefix}_{uuid5(NAMESPACE_URL, '|'.join(str(part) for part in parts)).hex}"


def _log_path(action_id: str) -> Path:
    return OPS_LOG_DIR / f"{action_id}.log"


def _spec_view(spec: _ActionSpec) -> OpsActionSpecView:
    return OpsActionSpecView(
        action_name=spec.action_name,
        label=spec.label,
        category=spec.category,
        is_heavy=spec.is_heavy,
        warning=spec.warning,
    )


def list_action_specs() -> list[OpsActionSpecView]:
    return [_spec_view(spec) for spec in ACTION_SPECS.values()]


def _row_to_view(row: OpsActionRecord) -> OpsActionView:
    return OpsActionView(
        action_id=row.action_id,
        action_name=row.action_name,
        category=row.category,
        status=row.status,
        started_at=row.started_at,
        finished_at=row.finished_at,
        summary=row.summary,
        log_path=row.log_path,
        details=row.details_json,
    )


def list_recent_actions(session: Session, limit: int = 12) -> list[OpsActionView]:
    rows = session.exec(select(OpsActionRecord).order_by(desc(OpsActionRecord.started_at))).all()[:limit]
    return [_row_to_view(row) for row in rows]


def _latest_action(session: Session, action_name: str) -> OpsActionView | None:
    row = session.exec(
        select(OpsActionRecord)
        .where(OpsActionRecord.action_name == action_name)
        .order_by(desc(OpsActionRecord.started_at))
    ).first()
    return _row_to_view(row) if row is not None else None


def _write_log(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _summary_from_output(output: str, *, fallback: str) -> str:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    return " | ".join(lines[-3:])[:500] if lines else fallback


def _subprocess_creationflags() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform.startswith("win") else 0


def _subprocess_action(command: list[str]) -> tuple[str, str, dict[str, object]]:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
        creationflags=_subprocess_creationflags(),
    )
    output = "\n".join(part for part in (completed.stdout, completed.stderr) if part).strip()
    return output, _summary_from_output(output, fallback="completed"), {"command": command}


def _run_refresh() -> tuple[str, str, dict[str, object]]:
    summary = refresh_pipeline(force_live=False)
    output = f"source_mode={summary.source_mode}\nbars_ingested={summary.bars_ingested}\nsignals_emitted={summary.signals_emitted}\nrisk_reports_built={summary.risk_reports_built}"
    return output, _summary_from_output(output, fallback="refresh completed"), summary.model_dump(mode="json")


def _run_fixture_refresh() -> tuple[str, str, dict[str, object]]:
    summary = seed_and_refresh()
    output = f"source_mode={summary.source_mode}\nbars_ingested={summary.bars_ingested}\nsignals_emitted={summary.signals_emitted}\nrisk_reports_built={summary.risk_reports_built}"
    return output, _summary_from_output(output, fallback="fixture refresh completed"), summary.model_dump(mode="json")


def trigger_action(session: Session, action_name: str, payload: OpsActionRequest | None = None) -> OpsActionView:
    spec = ACTION_SPECS.get(action_name)
    if spec is None:
        raise ValueError(f"Unsupported action: {action_name}")
    request = payload or OpsActionRequest()
    if spec.is_heavy and not request.confirm_heavy:
        raise ValueError(f"Action '{action_name}' requires confirm_heavy=true.")

    started_at = naive_utc_now()
    action_id = _stable_id("ops", action_name, started_at.isoformat())
    log_path = _log_path(action_id)
    row = OpsActionRecord(
        action_id=action_id,
        action_name=action_name,
        category=spec.category,
        status="running",
        started_at=started_at,
        log_path=str(log_path),
        summary=f"{spec.label} started.",
        details_json={"warning": spec.warning},
    )
    session.add(row)
    session.commit()

    try:
        if action_name == "system_refresh":
            output, summary, details = _run_refresh()
        elif action_name == "fixture_refresh":
            output, summary, details = _run_fixture_refresh()
        elif action_name == "pilot_export":
            output, summary, details = _subprocess_action([sys.executable, "scripts/pilot_export.py", "--no-refresh"])
        elif action_name == "save_contract_snapshots":
            output, summary, details = _subprocess_action([sys.executable, "scripts/save_contract_snapshots.py"])
        elif action_name == "build_review_bundle":
            output, summary, details = _subprocess_action([sys.executable, "scripts/build_review_bundle.py"])
        elif action_name == "verify_fast":
            output, summary, details = _subprocess_action([sys.executable, "scripts/verify_fast.py"])
        elif action_name == "verify_full":
            output, summary, details = _subprocess_action([sys.executable, "scripts/verify.py"])
        else:
            raise ValueError(f"Unsupported action: {action_name}")
        _write_log(log_path, output)
        row.status = "success"
        row.finished_at = naive_utc_now()
        row.summary = summary
        row.details_json = details
    except subprocess.CalledProcessError as exc:
        output = "\n".join(part for part in (exc.stdout, exc.stderr) if part).strip()
        _write_log(log_path, output)
        row.status = "failed"
        row.finished_at = naive_utc_now()
        row.summary = _summary_from_output(output, fallback=f"{spec.label} failed")
        row.details_json = {"returncode": exc.returncode, "command": exc.cmd}
    except Exception as exc:
        _write_log(log_path, str(exc))
        row.status = "failed"
        row.finished_at = naive_utc_now()
        row.summary = str(exc)
        row.details_json = {"error": str(exc)}
    session.add(row)
    session.commit()
    session.refresh(row)
    return _row_to_view(row)


def ops_summary(session: Session) -> OpsSummaryView:
    actions = list_recent_actions(session)
    return OpsSummaryView(
        generated_at=naive_utc_now(),
        latest_fast_verify=_latest_action(session, "verify_fast"),
        latest_full_verify=_latest_action(session, "verify_full"),
        latest_export=_latest_action(session, "pilot_export"),
        latest_bundle=_latest_action(session, "build_review_bundle"),
        latest_refresh=_latest_action(session, "system_refresh") or _latest_action(session, "fixture_refresh"),
        latest_contract_snapshot=_latest_action(session, "save_contract_snapshots"),
        action_history=actions,
        available_actions=list_action_specs(),
    )
