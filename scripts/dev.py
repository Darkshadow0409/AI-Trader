from __future__ import annotations

import os
import socket
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from shutil import which
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def resolve_npm_command() -> str:
    return which("npm.cmd") or which("npm") or "npm"


def should_open_browser() -> bool:
    if "--open" in sys.argv[1:]:
        return True
    return os.environ.get("AI_TRADER_OPEN_BROWSER", "").strip().lower() in {"1", "true", "yes", "on"}


def can_bind_port(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def choose_port(host: str, candidates: list[int], label: str) -> int:
    for port in candidates:
        if can_bind_port(host, port):
            return port
    tried = ", ".join(str(port) for port in candidates)
    raise RuntimeError(f"No usable {label} port found. Tried: {tried}")


def open_browser_when_ready(url: str) -> None:
    def _runner() -> None:
        time.sleep(1.5)
        try:
            webbrowser.open(url)
        except Exception as exc:  # pragma: no cover - best-effort helper
            print(f"Browser auto-open failed: {exc}")

    threading.Thread(target=_runner, daemon=True).start()


def main() -> int:
    env = os.environ.copy()
    backend_env = env.copy()
    frontend_env = env.copy()
    backend_env.setdefault("PYTHONPATH", str(ROOT / "apps" / "backend"))
    host = env.get("AI_TRADER_HOST", "127.0.0.1")
    backend_port_env = env.get("AI_TRADER_PORT")
    frontend_port_env = env.get("AI_TRADER_FRONTEND_PORT")
    backend_requested = int(backend_port_env or "8000")
    frontend_requested = int(frontend_port_env or "5173")
    backend_candidates = [backend_requested] if backend_port_env else [8000, 8001, 8010]
    frontend_candidates = [frontend_requested] if frontend_port_env else [5173, 5174, 5175, 5180]
    backend_port = str(choose_port(host, backend_candidates, "backend"))
    frontend_port = str(choose_port(host, frontend_candidates, "frontend"))
    frontend_url = f"http://{host}:{frontend_port}"
    backend_url = f"http://{host}:{backend_port}"
    health_url = f"{backend_url}/api/health"
    auto_open = should_open_browser()
    frontend_env["VITE_API_BASE_URL"] = f"{backend_url}/api"

    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        str(ROOT / "apps" / "backend"),
        "--host",
        host,
        "--port",
        backend_port,
        "--reload",
    ]
    frontend_cmd = [resolve_npm_command(), "run", "dev", "--", "--host", host, "--port", frontend_port, "--strictPort"]

    print("Starting AI Trader local stack")
    print(f"Frontend UI: {frontend_url}")
    print(f"Backend API: {backend_url}")
    print(f"Health check: {health_url}")
    print(f"Frontend API base: {frontend_env['VITE_API_BASE_URL']}")
    print("Mode: local-first, fixture-safe defaults unless overridden in .env")
    print(f"Browser auto-open: {'enabled' if auto_open else 'disabled'}")
    if backend_port != str(backend_requested):
        print(f"Backend port fallback applied: requested {backend_requested}, using {backend_port}")
    if frontend_port != str(frontend_requested):
        print(f"Frontend port fallback applied: requested {frontend_requested}, using {frontend_port}")
    print("Press Ctrl+C once to stop both processes.")

    backend = subprocess.Popen(backend_cmd, cwd=ROOT, env=backend_env)
    frontend = subprocess.Popen(frontend_cmd, cwd=ROOT / "apps" / "frontend", env=frontend_env)

    if auto_open:
        open_browser_when_ready(frontend_url)

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
