from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from shutil import which


ROOT = Path(__file__).resolve().parents[1]


def _run(command: list[str], cwd: Path) -> None:
    print(f"> {' '.join(command)}")
    subprocess.run(command, cwd=cwd, env=os.environ.copy(), check=True)


def _npm_command() -> str:
    return which("npm.cmd") or which("npm") or "npm"


def main() -> int:
    _run([sys.executable, "scripts/seed_data.py"], ROOT)
    _run([sys.executable, "scripts/backfill.py"], ROOT)
    _run([sys.executable, "-m", "pytest", "apps/backend/tests"], ROOT)
    _run([_npm_command(), "run", "test", "--", "--run"], ROOT / "apps" / "frontend")
    _run([_npm_command(), "run", "build"], ROOT / "apps" / "frontend")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
