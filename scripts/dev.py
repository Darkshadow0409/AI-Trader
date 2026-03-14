from __future__ import annotations

import os
import signal
import subprocess
import sys
from shutil import which
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def resolve_npm_command() -> str:
    return which("npm.cmd") or which("npm") or "npm"


def main() -> int:
    env = os.environ.copy()
    backend_env = env.copy()
    frontend_env = env.copy()
    backend_env.setdefault("PYTHONPATH", str(ROOT / "apps" / "backend"))

    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        str(ROOT / "apps" / "backend"),
        "--host",
        env.get("AI_TRADER_HOST", "127.0.0.1"),
        "--port",
        env.get("AI_TRADER_PORT", "8000"),
        "--reload",
    ]
    frontend_cmd = [resolve_npm_command(), "run", "dev", "--", "--host", env.get("AI_TRADER_HOST", "127.0.0.1")]

    backend = subprocess.Popen(backend_cmd, cwd=ROOT, env=backend_env)
    frontend = subprocess.Popen(frontend_cmd, cwd=ROOT / "apps" / "frontend", env=frontend_env)

    def shutdown(*_: object) -> None:
        for proc in (backend, frontend):
            if proc.poll() is None:
                proc.terminate()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        backend_code = backend.wait()
        frontend_code = frontend.wait()
        return backend_code or frontend_code
    finally:
        shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
