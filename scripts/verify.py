from __future__ import annotations

import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from shutil import which


ROOT = Path(__file__).resolve().parents[1]


def _run(command: list[str], cwd: Path) -> None:
    started = time.perf_counter()
    started_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    print(f"[verify] START {started_at} :: {' '.join(command)}", flush=True)
    try:
        subprocess.run(command, cwd=cwd, env=os.environ.copy(), check=True)
    except subprocess.CalledProcessError:
        elapsed = time.perf_counter() - started
        print(f"[verify] FAIL after {elapsed:.1f}s :: {' '.join(command)}", flush=True)
        raise
    elapsed = time.perf_counter() - started
    print(f"[verify] OK after {elapsed:.1f}s :: {' '.join(command)}", flush=True)


def _npm_command() -> str:
    return which("npm.cmd") or which("npm") or "npm"


def main() -> int:
    total_started = time.perf_counter()
    _run([sys.executable, "scripts/seed_data.py"], ROOT)
    _run([sys.executable, "scripts/backfill.py"], ROOT)
    _run([sys.executable, "-m", "pytest", "apps/backend/tests"], ROOT)
    _run([_npm_command(), "run", "test", "--", "--run"], ROOT / "apps" / "frontend")
    _run([_npm_command(), "run", "build"], ROOT / "apps" / "frontend")
    print(f"[verify] COMPLETE after {time.perf_counter() - total_started:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
