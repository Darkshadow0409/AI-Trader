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
from urllib.parse import urlparse
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


def wants_detach() -> bool:
    argv = sys.argv[1:]
    if "--foreground" in argv:
        return False
    if "--detach" in argv:
        return True
    return os.environ.get("AI_TRADER_DETACH", "").strip().lower() in {"1", "true", "yes", "on"}


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


def request_text(url: str, timeout_seconds: float = 3.0) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "ai-trader-local-launcher"})
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        raw = response.read().decode("utf-8", errors="ignore")
        return response.status, raw


def process_alive(pid: object) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def find_repo_process_ids(root_dir: str) -> list[int]:
    if os.name != "nt":
        return []
    escaped_root = root_dir.replace("'", "''")
    script = rf"""
$root = '{escaped_root}'
Get-CimInstance Win32_Process |
  Where-Object {{
    $_.ProcessId -ne $PID -and
    $_.CommandLine -and
    (
      ($_.CommandLine -like "*$root*uvicorn*app.main:app*") -or
      ($_.CommandLine -like "*$root*apps\frontend*vite*") -or
      ($_.CommandLine -like "*$root*apps\frontend*npm*run*dev*")
    )
  }} |
  Select-Object -ExpandProperty ProcessId
"""
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        creationflags=windows_subprocess_flags(),
        check=False,
    )
    if completed.returncode != 0:
        return []
    ids: list[int] = []
    for line in completed.stdout.splitlines():
        line = line.strip()
        if line.isdigit():
            ids.append(int(line))
    return ids


def find_port_listener_process_ids(ports: list[int]) -> list[int]:
    if os.name != "nt" or not ports:
        return []
    script = """
$ports = @(%s)
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object -ExpandProperty OwningProcess -Unique
""" % ", ".join(str(port) for port in ports)
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        creationflags=windows_subprocess_flags(),
        check=False,
    )
    if completed.returncode != 0:
        return []
    ids: list[int] = []
    for line in completed.stdout.splitlines():
        line = line.strip()
        if line.isdigit():
            ids.append(int(line))
    return ids


def find_repo_port_process_ids(root_dir: str, ports: list[int]) -> list[int]:
    if os.name != "nt":
        return []
    candidate_ids = find_port_listener_process_ids(ports)
    if not candidate_ids:
        return []
    escaped_root = root_dir.replace("'", "''").lower()
    script = rf"""
$root = '{escaped_root}'
$ids = @({", ".join(str(pid) for pid in candidate_ids)})
Get-CimInstance Win32_Process |
  Where-Object {{
    $ids -contains $_.ProcessId -and
    $_.CommandLine -and
    (
      $_.CommandLine.ToLower().Contains($root) -or
      $_.CommandLine.ToLower().Contains('app.main:app') -or
      $_.CommandLine.ToLower().Contains('vite') -or
      $_.CommandLine.ToLower().Contains('npm run dev')
    )
  }} |
  Select-Object -ExpandProperty ProcessId
"""
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        creationflags=windows_subprocess_flags(),
        check=False,
    )
    if completed.returncode != 0:
        return []
    ids: list[int] = []
    for line in completed.stdout.splitlines():
        line = line.strip()
        if line.isdigit():
            ids.append(int(line))
    return ids


def stop_repo_processes(root_dir: str, ports: list[int] | None = None) -> None:
    candidate_ids = set(find_repo_process_ids(root_dir))
    if ports:
        candidate_ids.update(find_repo_port_process_ids(root_dir, ports))
    for pid in sorted(candidate_ids):
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            creationflags=windows_subprocess_flags(),
            check=False,
        )


def _port_from_url(url: object) -> int | None:
    if not isinstance(url, str) or not url:
        return None
    try:
        parsed = urlparse(url)
        return parsed.port
    except ValueError:
        return None


def probe_backend_health(url: str, timeout_seconds: float = 1.5) -> bool:
    try:
        status, payload = request_json(url, timeout_seconds=timeout_seconds)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return False
    return 200 <= status < 300 and isinstance(payload, dict) and str(payload.get("status", "")).lower() in {"ok", "mock"}


def probe_frontend(url: str, timeout_seconds: float = 1.5) -> bool:
    try:
        status, body = request_text(url, timeout_seconds=timeout_seconds)
    except (urllib.error.URLError, TimeoutError, OSError):
        return False
    normalized = body.lower()
    return 200 <= status < 300 and ("ai trader" in normalized or "id=\"root\"" in normalized)


def wait_for_json(url: str, timeout_seconds: float, label: str, process: subprocess.Popen | None = None) -> object:
    deadline = time.time() + timeout_seconds
    last_error: str | None = None
    while time.time() < deadline:
        if process is not None and process.poll() is not None:
            raise RuntimeError(f"{label} process exited early with code {process.returncode}.")
        try:
            status, payload = request_json(url)
            if 200 <= status < 300:
                return payload
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last_error = str(exc)
        time.sleep(0.5)
    raise RuntimeError(f"{label} did not become ready within {timeout_seconds:.0f}s. Last error: {last_error or 'unknown'}")


def wait_for_http(url: str, timeout_seconds: float, label: str, process: subprocess.Popen | None = None) -> None:
    deadline = time.time() + timeout_seconds
    last_error: str | None = None
    while time.time() < deadline:
        if process is not None and process.poll() is not None:
            raise RuntimeError(f"{label} process exited early with code {process.returncode}.")
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "ai-trader-local-launcher"})
            with urllib.request.urlopen(request, timeout=3.0) as response:
                if 200 <= response.status < 500:
                    return
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
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


def start_backend_stack(
    *,
    backend_candidates: list[int],
    backend_requested: int,
    host: str,
    root_dir: str,
    backend_dir: str,
    backend_env: dict[str, str],
    log_handle: object,
    detach: bool,
) -> tuple[subprocess.Popen, int, str, str, str, object]:
    last_error = "unknown"
    for candidate in backend_candidates:
        backend_url = f"http://{host}:{candidate}"
        health_url = f"{backend_url}/api/health"
        overview_url = f"{backend_url}/api/dashboard/overview"
        print(f"Starting backend on {backend_url}...")
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
            str(candidate),
        ]
        if not detach:
            backend_cmd.append("--reload")
        backend = subprocess.Popen(
            backend_cmd,
            cwd=root_dir,
            env=backend_env,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            creationflags=windows_subprocess_flags(),
        )
        try:
            wait_for_json(health_url, timeout_seconds=45, label="Backend health", process=backend)
            if backend.poll() is not None:
                raise RuntimeError(f"backend exited after health probe with code {backend.returncode}")
            print("Backend transport healthy. Waiting for operator data warmup...")
            overview_payload = wait_for_json(overview_url, timeout_seconds=90, label="Backend overview", process=backend)
            if backend.poll() is not None:
                raise RuntimeError(f"backend exited after overview probe with code {backend.returncode}")
            if candidate != backend_requested:
                print(f"Backend port fallback applied: requested {backend_requested}, using {candidate}")
            return backend, candidate, backend_url, health_url, overview_url, overview_payload
        except Exception as exc:
            last_error = str(exc)
            print(f"Backend candidate {candidate} failed: {exc}")
            terminate_pid(backend.pid)
            time.sleep(1.0)
    raise RuntimeError(f"Backend failed on all candidate ports. Last error: {last_error}")


def start_frontend_stack(
    *,
    frontend_candidates: list[int],
    frontend_requested: int,
    host: str,
    root_dir: str,
    frontend_dir: str,
    frontend_env: dict[str, str],
    log_handle: object,
) -> tuple[subprocess.Popen, int, str]:
    last_error = "unknown"
    for candidate in frontend_candidates:
        frontend_url = f"http://{host}:{candidate}"
        print(f"Starting frontend on {frontend_url}...")
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
            str(candidate),
            "--strictPort",
        ]
        frontend = subprocess.Popen(
            frontend_cmd,
            cwd=root_dir,
            env=frontend_env,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            creationflags=windows_subprocess_flags(),
        )
        try:
            wait_for_http(frontend_url, timeout_seconds=60, label="Frontend UI", process=frontend)
            if frontend.poll() is not None:
                raise RuntimeError(f"frontend exited after startup probe with code {frontend.returncode}")
            if candidate != frontend_requested:
                print(f"Frontend port fallback applied: requested {frontend_requested}, using {candidate}")
            return frontend, candidate, frontend_url
        except Exception as exc:
            last_error = str(exc)
            print(f"Frontend candidate {candidate} failed: {exc}")
            terminate_pid(frontend.pid)
            time.sleep(1.0)
    raise RuntimeError(f"Frontend failed on all candidate ports. Last error: {last_error}")


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
    backend_port: int | None = None
    frontend_port: int | None = None
    backend_pid: int | None = None
    frontend_pid: int | None = None
    reused_backend = False
    reused_frontend = False

    state = read_runtime_state()
    if state:
        state_health_url = state.get("health_url")
        state_frontend_url = state.get("frontend_url")
        state_backend_pid = state.get("backend_pid")
        state_frontend_pid = state.get("frontend_pid")
        if isinstance(state_health_url, str) and probe_backend_health(state_health_url):
            backend_port = _port_from_url(state_health_url)
            backend_pid = state_backend_pid if process_alive(state_backend_pid) else None
            reused_backend = backend_port is not None
        elif process_alive(state_backend_pid):
            terminate_pid(state_backend_pid)
        if isinstance(state_frontend_url, str) and probe_frontend(state_frontend_url):
            frontend_port = _port_from_url(state_frontend_url)
            frontend_pid = state_frontend_pid if process_alive(state_frontend_pid) else None
            reused_frontend = frontend_port is not None
        elif process_alive(state_frontend_pid):
            terminate_pid(state_frontend_pid)
        if not reused_backend and not reused_frontend:
            remove_runtime_state()

    if backend_port is None:
        backend_port = choose_port(host, backend_candidates, "backend")

    if frontend_port is None:
        frontend_port = choose_port(host, frontend_candidates, "frontend")

    backend_url = f"http://{host}:{backend_port}"
    frontend_url = f"http://{host}:{frontend_port}"
    health_url = f"{backend_url}/api/health"
    frontend_api_base = f"{backend_url}/api"
    frontend_env["VITE_API_BASE_URL"] = frontend_api_base
    auto_open = wants_browser_open()
    detach = wants_detach()

    if detach:
        stop_repo_processes(root_dir, backend_candidates + frontend_candidates)
        remove_runtime_state()
        time.sleep(2.0)

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
    ]
    if not detach:
        backend_cmd.append("--reload")
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
    print(f"Detached mode: {'enabled' if detach else 'disabled'}")
    backend_log_handle, frontend_log_handle = open_log_handles()
    backend: subprocess.Popen | None = None
    frontend: subprocess.Popen | None = None
    if reused_backend:
        print(f"Reusing healthy backend: {backend_url}")
    else:
        backend = subprocess.Popen(
            backend_cmd,
            cwd=root_dir,
            env=backend_env,
            stdout=backend_log_handle,
            stderr=subprocess.STDOUT,
            creationflags=windows_subprocess_flags(),
        )
        backend_pid = backend.pid

    try:
        if not reused_backend:
            backend, backend_port, backend_url, health_url, _, overview_payload = start_backend_stack(
                backend_candidates=backend_candidates,
                backend_requested=backend_requested,
                host=host,
                root_dir=root_dir,
                backend_dir=backend_dir,
                backend_env=backend_env,
                log_handle=backend_log_handle,
                detach=detach,
            )
            backend_pid = backend.pid
            frontend_api_base = f"{backend_url}/api"
            frontend_env["VITE_API_BASE_URL"] = frontend_api_base
            frontend_url = f"http://{host}:{frontend_port}"
        else:
            print("Backend transport healthy. Waiting for operator data warmup...")
            overview_payload = wait_for_json(f"{backend_url}/api/dashboard/overview", timeout_seconds=90, label="Backend overview")
        source_mode = str((overview_payload or {}).get("source_mode", "unknown"))
        market_data_mode = str((overview_payload or {}).get("market_data_mode", "unknown"))
        print(f"Backend healthy: {health_url}")
        print(f"Source mode: {source_mode}")
        print(f"Market data mode: {market_data_mode}")

        if reused_frontend:
            print(f"Reusing healthy frontend: {frontend_url}")
        else:
            frontend, frontend_port, frontend_url = start_frontend_stack(
                frontend_candidates=frontend_candidates,
                frontend_requested=frontend_requested,
                host=host,
                root_dir=root_dir,
                frontend_dir=frontend_dir,
                frontend_env=frontend_env,
                log_handle=frontend_log_handle,
            )
            frontend_pid = frontend.pid
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
                "backend_pid": backend_pid,
                "frontend_pid": frontend_pid,
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
        if detach:
            backend_log_handle.close()
            frontend_log_handle.close()
            print("Local stack detached. Use stop_local.cmd to stop it later.")
            return 0
    except Exception as exc:
        print(f"Startup failed: {exc}")
        print(f"Backend log: {plain_windows_path(BACKEND_LOG)}")
        print(f"Frontend log: {plain_windows_path(FRONTEND_LOG)}")
        if backend is not None:
            terminate_pid(backend.pid)
        if frontend is not None:
            terminate_pid(frontend.pid)
        backend_log_handle.close()
        frontend_log_handle.close()
        remove_runtime_state()
        return 1

    def shutdown(*_: object) -> None:
        if backend is not None:
            terminate_pid(backend.pid)
        if frontend is not None:
            terminate_pid(frontend.pid)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        backend_code = backend.wait() if backend is not None else 0
        frontend_code = frontend.wait() if frontend is not None else 0
        return backend_code or frontend_code
    finally:
        shutdown()
        backend_log_handle.close()
        frontend_log_handle.close()
        remove_runtime_state()


if __name__ == "__main__":
    raise SystemExit(main())
