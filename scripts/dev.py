from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from shutil import which


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "data" / "local_runtime"
PID_FILE = RUNTIME_DIR / "local_stack.json"
BACKEND_LOG = RUNTIME_DIR / "backend.log"
FRONTEND_LOG = RUNTIME_DIR / "frontend.log"


def resolve_npm_command() -> str:
    return which("npm.cmd") or which("npm") or "npm"


def windows_subprocess_flags() -> int:
    if os.name != "nt":
        return 0
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def plain_windows_path(value: Path | str) -> str:
    text = os.fspath(value)
    if os.name != "nt":
        return text
    if text.startswith("\\\\?\\UNC\\"):
        return "\\" + text[7:]
    if text.startswith("\\\\?\\"):
        return text[4:]
    return text


def wants_browser_open() -> bool:
    argv = sys.argv[1:]
    if "--no-open" in argv:
        return False
    if "--open" in argv:
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


def unique_ports(candidates: list[int]) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for port in candidates:
        if port not in seen:
            ordered.append(port)
            seen.add(port)
    return ordered


def build_backend_candidates(explicit_port: str | None) -> list[int]:
    if explicit_port:
        return [int(explicit_port)]
    return unique_ports([8000, 8001, 8010, 8011, 8012, 8013, 8014, 8015])


def build_frontend_candidates(explicit_port: str | None) -> list[int]:
    if explicit_port:
        return [int(explicit_port)]
    return unique_ports([5173, 5174, 5175, 5180, 5181, 5182, 5183, 5184])


def choose_port(host: str, candidates: list[int], label: str) -> int:
    for port in candidates:
        if can_bind_port(host, port):
            return port
    tried = ", ".join(str(port) for port in candidates)
    raise RuntimeError(f"No usable {label} port found. Tried: {tried}")


def ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def write_runtime_state(payload: dict[str, object]) -> None:
    ensure_runtime_dir()
    PID_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_runtime_state() -> dict[str, object] | None:
    if not PID_FILE.exists():
        return None
    try:
        return json.loads(PID_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def remove_runtime_state() -> None:
    if PID_FILE.exists():
        PID_FILE.unlink()


def request_json(url: str, timeout_seconds: float = 3.0) -> tuple[int, object]:
    request = urllib.request.Request(url, headers={"User-Agent": "ai-trader-local-launcher"})
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        raw = response.read().decode("utf-8")
        return response.status, json.loads(raw)


def wait_for_json(url: str, timeout_seconds: float, label: str) -> object:
    deadline = time.time() + timeout_seconds
    last_error: str | None = None
    while time.time() < deadline:
        try:
            status, payload = request_json(url)
            if 200 <= status < 300:
                return payload
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = str(exc)
        time.sleep(0.5)
    raise RuntimeError(f"{label} did not become ready within {timeout_seconds:.0f}s. Last error: {last_error or 'unknown'}")


def wait_for_http(url: str, timeout_seconds: float, label: str) -> None:
    deadline = time.time() + timeout_seconds
    last_error: str | None = None
    while time.time() < deadline:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "ai-trader-local-launcher"})
            with urllib.request.urlopen(request, timeout=3.0) as response:
                if 200 <= response.status < 500:
                    return
        except urllib.error.URLError as exc:
            last_error = str(exc)
        time.sleep(0.5)
    raise RuntimeError(f"{label} did not become ready within {timeout_seconds:.0f}s. Last error: {last_error or 'unknown'}")


def open_browser(url: str) -> None:
    try:
        webbrowser.open(url)
    except Exception as exc:  # pragma: no cover - best effort only
        print(f"Browser auto-open failed: {exc}")


def terminate_pid(pid: int | None) -> None:
    if not pid:
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return


def stop_running_stack() -> int:
    state = read_runtime_state()
    if not state:
        print("No running local stack metadata found.")
        return 0
    backend_pid = state.get("backend_pid")
    frontend_pid = state.get("frontend_pid")
    terminate_pid(int(backend_pid) if isinstance(backend_pid, int) else None)
    terminate_pid(int(frontend_pid) if isinstance(frontend_pid, int) else None)
    print("Stop signal sent to local backend and frontend.")
    remove_runtime_state()
    return 0


def open_log_handles() -> tuple[object, object]:
    ensure_runtime_dir()
    backend_handle = open(BACKEND_LOG, "w", encoding="utf-8")
    frontend_handle = open(FRONTEND_LOG, "w", encoding="utf-8")
    return backend_handle, frontend_handle


def main() -> int:
    if "--stop" in sys.argv[1:]:
        return stop_running_stack()

    env = os.environ.copy()
    backend_env = env.copy()
    frontend_env = env.copy()

    root_dir = plain_windows_path(ROOT)
    backend_dir = plain_windows_path(ROOT / "apps" / "backend")
    frontend_dir = plain_windows_path(ROOT / "apps" / "frontend")
    backend_env.setdefault("PYTHONPATH", backend_dir)

    host = env.get("AI_TRADER_HOST", "127.0.0.1")
    backend_port_env = env.get("AI_TRADER_PORT")
    frontend_port_env = env.get("AI_TRADER_FRONTEND_PORT")
    backend_requested = int(backend_port_env or "8000")
    frontend_requested = int(frontend_port_env or "5173")
    backend_candidates = build_backend_candidates(backend_port_env)
    frontend_candidates = build_frontend_candidates(frontend_port_env)
    backend_port = choose_port(host, backend_candidates, "backend")
    frontend_port = choose_port(host, frontend_candidates, "frontend")

    backend_url = f"http://{host}:{backend_port}"
    frontend_url = f"http://{host}:{frontend_port}"
    health_url = f"{backend_url}/api/health"
    overview_url = f"{backend_url}/api/dashboard/overview"
    frontend_api_base = f"{backend_url}/api"
    frontend_env["VITE_API_BASE_URL"] = frontend_api_base
    auto_open = wants_browser_open()

    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        backend_dir,
        "--host",
        host,
        "--port",
        str(backend_port),
        "--reload",
    ]
    frontend_cmd = [
        resolve_npm_command(),
        "--prefix",
        frontend_dir,
        "run",
        "dev",
        "--",
        "--host",
        host,
        "--port",
        str(frontend_port),
        "--strictPort",
    ]

    print("Starting AI Trader local stack")
    print(f"Project root: {root_dir}")
    print(f"Frontend UI: {frontend_url}")
    print(f"Backend API: {backend_url}")
    print(f"Health check: {health_url}")
    print(f"Frontend API base: {frontend_api_base}")
    print(f"Browser auto-open: {'enabled' if auto_open else 'disabled'}")
    if backend_port != backend_requested:
        print(f"Backend port fallback applied: requested {backend_requested}, using {backend_port}")
    if frontend_port != frontend_requested:
        print(f"Frontend port fallback applied: requested {frontend_requested}, using {frontend_port}")

    backend_log_handle, frontend_log_handle = open_log_handles()
    backend = subprocess.Popen(
        backend_cmd,
        cwd=root_dir,
        env=backend_env,
        stdout=backend_log_handle,
        stderr=subprocess.STDOUT,
        creationflags=windows_subprocess_flags(),
    )

    try:
        wait_for_json(health_url, timeout_seconds=45, label="Backend health")
        overview_payload = wait_for_json(overview_url, timeout_seconds=20, label="Backend overview")
        source_mode = str((overview_payload or {}).get("source_mode", "unknown"))
        market_data_mode = str((overview_payload or {}).get("market_data_mode", "unknown"))
        print(f"Backend healthy: {health_url}")
        print(f"Source mode: {source_mode}")
        print(f"Market data mode: {market_data_mode}")

        frontend = subprocess.Popen(
            frontend_cmd,
            cwd=root_dir,
            env=frontend_env,
            stdout=frontend_log_handle,
            stderr=subprocess.STDOUT,
            creationflags=windows_subprocess_flags(),
        )
        wait_for_http(frontend_url, timeout_seconds=60, label="Frontend UI")
        print(f"Frontend started: {frontend_url}")
        print(f"Backend logs: {plain_windows_path(BACKEND_LOG)}")
        print(f"Frontend logs: {plain_windows_path(FRONTEND_LOG)}")
        print("Home page: Desk")
        print("First click: use Desk for triage, then open Command Center for safe operational actions.")
        print("Command Center handles refresh, verify, export, and review-bundle actions.")
        if auto_open:
            open_browser(frontend_url)
            print(f"Browser opened: {frontend_url}")

        write_runtime_state(
            {
                "launcher_pid": os.getpid(),
                "backend_pid": backend.pid,
                "frontend_pid": frontend.pid,
                "backend_url": backend_url,
                "frontend_url": frontend_url,
                "health_url": health_url,
                "frontend_api_base": frontend_api_base,
                "source_mode": source_mode,
                "market_data_mode": market_data_mode,
                "backend_log": plain_windows_path(BACKEND_LOG),
                "frontend_log": plain_windows_path(FRONTEND_LOG),
                "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            },
        )
    except Exception as exc:
        print(f"Startup failed: {exc}")
        print(f"Backend log: {plain_windows_path(BACKEND_LOG)}")
        print(f"Frontend log: {plain_windows_path(FRONTEND_LOG)}")
        terminate_pid(backend.pid)
        backend_log_handle.close()
        frontend_log_handle.close()
        remove_runtime_state()
        return 1

    def shutdown(*_: object) -> None:
        terminate_pid(backend.pid)
        terminate_pid(frontend.pid)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        backend_code = backend.wait()
        frontend_code = frontend.wait()
        return backend_code or frontend_code
    finally:
        shutdown()
        backend_log_handle.close()
        frontend_log_handle.close()
        remove_runtime_state()


if __name__ == "__main__":
    raise SystemExit(main())
