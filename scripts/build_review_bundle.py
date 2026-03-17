from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import textwrap
import zipfile
from pathlib import Path
from shutil import which


ROOT = Path(__file__).resolve().parents[1]
BUNDLE_DIR = ROOT / "review_bundle"
ZIP_PATH = ROOT / "review_bundle.zip"
BACKEND_DIR = ROOT / "apps" / "backend"
FRONTEND_DIR = ROOT / "apps" / "frontend"

CONTRACT_FILES = [
    ("/api/health", "GET", "contracts/health.json"),
    ("/api/signals", "GET", "contracts/signals.json"),
    ("/api/signals/high-risk", "GET", "contracts/signals_high_risk.json"),
    ("/api/news", "GET", "contracts/news.json"),
    ("/api/watchlist", "GET", "contracts/watchlist.json"),
    ("/api/watchlist/opportunity-hunter", "GET", "contracts/opportunity_hunter.json"),
    ("/api/risk/latest", "GET", "contracts/risk_latest.json"),
    ("/api/alerts", "GET", "contracts/alerts.json"),
    ("/api/portfolio/active-trades", "GET", "contracts/active_trades.json"),
    ("/api/portfolio/paper-trades/proposed", "GET", "contracts/paper_trades_proposed.json"),
    ("/api/portfolio/paper-trades/active", "GET", "contracts/paper_trades_active.json"),
    ("/api/portfolio/paper-trades/closed", "GET", "contracts/paper_trades_closed.json"),
    ("/api/portfolio/paper-trades/analytics", "GET", "contracts/paper_trade_analytics.json"),
    ("/api/journal", "GET", "contracts/journal.json"),
    ("/api/journal/paper-trade-reviews", "GET", "contracts/paper_trade_reviews.json"),
    ("/api/session/overview", "GET", "contracts/session_overview.json"),
    ("/api/session/review-tasks", "GET", "contracts/review_tasks.json"),
    ("/api/session/daily-briefing", "GET", "contracts/daily_briefing.json"),
    ("/api/session/weekly-review", "GET", "contracts/weekly_review.json"),
    ("/api/session/operational-backlog", "GET", "contracts/operational_backlog.json"),
    ("/api/session/pilot-metrics", "GET", "contracts/pilot_metrics.json"),
    ("/api/session/execution-gate", "GET", "contracts/execution_gate.json"),
    ("/api/session/pilot-dashboard", "GET", "contracts/pilot_dashboard.json"),
    ("/api/session/adapter-health", "GET", "contracts/adapter_health.json"),
    ("/api/session/audit-logs", "GET", "contracts/audit_logs.json"),
    ("/api/replay?symbol=BTC", "GET", "contracts/replay.json"),
    ("/api/replay/scenario-stress?symbol=BTC", "GET", "contracts/scenario_stress.json"),
    ("/api/tickets", "GET", "contracts/tickets.json"),
    ("/api/tickets/shadow-mode", "GET", "contracts/tickets_shadow_mode.json"),
    ("/api/tickets/broker-snapshot", "GET", "contracts/tickets_broker_snapshot.json"),
    ("/api/market/bars/BTC", "GET", "contracts/market_bars_BTC.json"),
    ("/api/market/chart/BTC?timeframe=1d", "GET", "contracts/market_chart_BTC_1d.json"),
    ("/api/market/chart/BTC?timeframe=15m", "GET", "contracts/market_chart_BTC_15m.json"),
    ("/api/watchlist/summary", "GET", "contracts/watchlist_summary.json"),
    ("/api/system/refresh", "POST", "contracts/system_refresh.json"),
    ("/api/strategies", "GET", "contracts/strategies.json"),
    ("/api/backtests", "GET", "contracts/backtests.json"),
    ("/api/dashboard/overview", "GET", "contracts/dashboard_overview.json"),
    ("/api/dashboard/desk", "GET", "contracts/dashboard_desk.json"),
    ("/api/dashboard/home-summary", "GET", "contracts/dashboard_home_summary.json"),
    ("/api/signals/summary", "GET", "contracts/signals_summary.json"),
    ("/api/tickets/summary", "GET", "contracts/tickets_summary.json"),
    ("/api/session/review-summary", "GET", "contracts/review_summary.json"),
    ("/api/session/pilot-summary", "GET", "contracts/pilot_summary.json"),
    ("/api/system/control-center", "GET", "contracts/system_control_center.json"),
    ("/api/system/ops-summary", "GET", "contracts/system_ops_summary.json"),
    ("/api/system/action-history", "GET", "contracts/system_action_history.json"),
]

TEST_FILES = [
    "apps/backend/tests/test_alerting.py",
    "apps/backend/tests/test_api_smoke.py",
    "apps/backend/tests/test_contract_snapshots.py",
    "apps/backend/tests/test_pipeline_scripts.py",
    "apps/backend/tests/test_connector_fallbacks.py",
    "apps/backend/tests/test_data_reality.py",
    "apps/backend/tests/test_decision_quality.py",
    "apps/backend/tests/test_feature_pipeline.py",
    "apps/backend/tests/test_paper_trading.py",
    "apps/backend/tests/test_pilot_ops.py",
    "apps/backend/tests/test_promotion_core.py",
    "apps/backend/tests/test_replay_and_stress.py",
    "apps/backend/tests/test_session_workflow.py",
    "apps/backend/tests/test_signal_and_risk_invariants.py",
    "apps/backend/tests/test_trade_tickets.py",
    "apps/backend/tests/test_ui_summary_routes.py",
    "apps/backend/tests/test_risk_engine.py",
    "apps/frontend/src/App.test.tsx",
    "apps/frontend/src/api/client.test.ts",
    "apps/frontend/src/api/contracts.test.ts",
    "apps/frontend/src/components/CommandCenter.test.tsx",
    "apps/frontend/src/components/LeftRail.test.tsx",
    "apps/frontend/src/components/PriceChart.test.tsx",
    "apps/frontend/src/components/SignalDetailsCard.test.tsx",
    "apps/frontend/src/components/TopRibbon.test.tsx",
    "apps/frontend/src/tabs/ActiveTradesTab.test.tsx",
    "apps/frontend/src/tabs/BacktestsTab.test.tsx",
    "apps/frontend/src/tabs/DeskTab.test.tsx",
    "apps/frontend/src/tabs/JournalTab.test.tsx",
    "apps/frontend/src/tabs/PilotDashboardTab.test.tsx",
    "apps/frontend/src/tabs/ReplayTab.test.tsx",
    "apps/frontend/src/tabs/SessionDashboardTab.test.tsx",
    "apps/frontend/src/tabs/StrategyLabTab.test.tsx",
    "apps/frontend/src/tabs/TradeTicketsTab.test.tsx",
    "apps/frontend/src/tabs/WatchlistTab.test.tsx",
]

SNAPSHOT_FILES = [
    "apps/backend/tests/contract_snapshots/signals.json",
    "apps/backend/tests/contract_snapshots/signals_high_risk.json",
    "apps/backend/tests/contract_snapshots/risk_latest.json",
    "apps/backend/tests/contract_snapshots/news.json",
    "apps/backend/tests/contract_snapshots/watchlist.json",
    "apps/backend/tests/contract_snapshots/dashboard_overview.json",
]

CORE_FILES = [
    "apps/backend/app/main.py",
    "apps/backend/app/core/clock.py",
    "apps/backend/app/core/database.py",
    "apps/backend/app/services/pipeline.py",
    "apps/backend/app/services/data_reality.py",
    "apps/backend/app/services/feature_pipeline.py",
    "apps/backend/app/services/signal_pipeline.py",
    "apps/backend/app/services/risk_pipeline.py",
    "apps/backend/app/api/routes/signals.py",
    "apps/backend/app/api/routes/news.py",
    "apps/backend/app/api/routes/watchlist.py",
    "apps/backend/app/api/routes/risk.py",
    "apps/backend/app/api/routes/portfolio.py",
    "apps/backend/app/api/routes/journal.py",
    "apps/backend/app/api/routes/alerts.py",
    "apps/backend/app/api/routes/tickets.py",
    "apps/backend/app/api/routes/session.py",
    "apps/backend/app/api/routes/strategies.py",
    "apps/backend/app/api/routes/backtests.py",
    "apps/backend/app/api/routes/market.py",
    "apps/backend/app/api/routes/replay.py",
    "apps/backend/app/api/routes/system.py",
    "apps/backend/app/alerting/sinks.py",
    "apps/backend/app/alerting/service.py",
    "apps/backend/app/services/operator_console.py",
    "apps/backend/app/services/paper_trading.py",
    "apps/backend/app/services/pilot_ops.py",
    "apps/backend/app/services/replay_engine.py",
    "apps/backend/app/services/session_workflow.py",
    "apps/backend/app/services/trade_tickets.py",
    "apps/backend/app/services/market_views.py",
    "apps/backend/app/services/ui_summaries.py",
    "apps/backend/app/services/broker_adapters.py",
    "apps/backend/app/strategy_lab/registry.py",
    "apps/backend/app/strategy_lab/service.py",
    "apps/backend/app/connectors/eia_client.py",
    "apps/backend/app/connectors/fred_client.py",
    "apps/backend/app/connectors/binance_market_data.py",
    "apps/backend/app/engines/signals/trend_following.py",
    "apps/backend/app/engines/signals/event_driven.py",
    "apps/backend/app/engines/signals/signal_ranker.py",
    "apps/backend/app/engines/risk/risk_report_builder.py",
    "apps/backend/app/engines/risk/size_band_logic.py",
    "apps/backend/app/engines/risk/stop_logic.py",
    "apps/backend/app/models/schemas.py",
    "apps/backend/app/models/entities.py",
    "apps/backend/fixtures/forward_validation_samples.json",
    "apps/backend/fixtures/paper_trades.json",
    "apps/backend/fixtures/paper_trade_reviews.json",
    "apps/frontend/src/App.tsx",
    "apps/frontend/src/api/client.ts",
    "apps/frontend/src/api/hooks.ts",
    "apps/frontend/src/types/api.ts",
    "apps/frontend/src/tabs/DeskTab.tsx",
    "apps/frontend/src/tabs/NewsTab.tsx",
    "apps/frontend/src/tabs/WatchlistTab.tsx",
    "apps/frontend/src/tabs/ActiveTradesTab.tsx",
    "apps/frontend/src/tabs/JournalTab.tsx",
    "apps/frontend/src/tabs/PilotDashboardTab.tsx",
    "apps/frontend/src/tabs/ReplayTab.tsx",
    "apps/frontend/src/tabs/RiskExposureTab.tsx",
    "apps/frontend/src/tabs/SessionDashboardTab.tsx",
    "apps/frontend/src/tabs/StrategyLabTab.tsx",
    "apps/frontend/src/tabs/TradeTicketsTab.tsx",
    "apps/frontend/src/components/CommandCenter.tsx",
    "apps/frontend/src/components/LeftRail.tsx",
    "apps/frontend/src/components/PriceChart.tsx",
    "apps/frontend/src/components/TopRibbon.tsx",
    "apps/frontend/src/components/ContextSidebar.tsx",
    "apps/frontend/src/components/SignalTable.tsx",
    "apps/frontend/src/components/SignalDetailsCard.tsx",
]

REPO_DOC_FILES = [
    "docs/ARCHITECTURE_OVERVIEW.md",
    "docs/SERVICE_OWNERSHIP_MAP.md",
    "docs/ENTITY_RELATIONSHIPS.md",
    "docs/OPERATOR_CONSOLE_OVERVIEW.md",
    "docs/UI_ROUTE_MAP.md",
    "docs/UI_COMPONENT_MAP.md",
    "docs/COMMAND_CENTER.md",
    "docs/SIGNAL_TO_PAPER_TRADE_FLOW.md",
    "docs/PROMOTION_VALIDATION_FLOW.md",
    "docs/VERIFICATION_TIERS.md",
]

RUNTIME_DIAGNOSTIC_FILES = [
    "data/diagnostics/latest_pipeline_timings.json",
    "data/diagnostics/route_timings.json",
    "data/diagnostics/alert_metrics.json",
    "data/diagnostics/service_boundary_snapshot.json",
]


def npm_command() -> str:
    return which("npm.cmd") or which("npm") or "npm"


def run_command(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> tuple[int, str]:
    completed = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    output = completed.stdout or ""
    if completed.stderr:
        if output and not output.endswith("\n"):
            output += "\n"
        output += completed.stderr
    return completed.returncode, output


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, payload: object) -> None:
    write_text(path, json.dumps(payload, indent=2))


def copy_relative_file(relative_path: str, destination_root: Path) -> None:
    source = ROOT / relative_path
    if not source.exists():
        return
    destination = destination_root / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def copy_by_name(relative_path: str, destination_root: Path) -> None:
    source = ROOT / relative_path
    if not source.exists():
        return
    destination = destination_root / Path(relative_path).name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def build_repo_tree() -> str:
    excluded_dirs = {
        ".git",
        ".venv",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        "node_modules",
        "dist",
        "build",
        "coverage",
        "review_bundle",
        "data\\parquet",
        "data\\sqlite",
        "data\\test_runtime",
    }
    excluded_suffixes = {".db", ".duckdb", ".parquet", ".pyc", ".pyo", ".tsbuildinfo"}
    lines: list[str] = [ROOT.name]

    def walk(current: Path, prefix: str = "") -> None:
        children = sorted(current.iterdir(), key=lambda item: (item.is_file(), item.name.lower()))
        filtered: list[Path] = []
        for child in children:
            rel = child.relative_to(ROOT)
            rel_windows = str(rel).replace("/", "\\")
            if child.is_dir() and (child.name in excluded_dirs or rel_windows in excluded_dirs):
                continue
            if child.is_file() and child.suffix in excluded_suffixes:
                continue
            filtered.append(child)
        for index, child in enumerate(filtered):
            connector = "`-- " if index == len(filtered) - 1 else "|-- "
            lines.append(f"{prefix}{connector}{child.name}")
            if child.is_dir():
                extension = "    " if index == len(filtered) - 1 else "|   "
                walk(child, prefix + extension)

    walk(ROOT)
    return "\n".join(lines) + "\n"


def read_requirements_versions() -> str:
    requirements = (BACKEND_DIR / "requirements.txt").read_text(encoding="utf-8").strip()
    package_json = json.loads((FRONTEND_DIR / "package.json").read_text(encoding="utf-8"))
    frontend_lines = ["Dependencies:"]
    for section in ("dependencies", "devDependencies"):
        frontend_lines.append(f"{section}:")
        for name, version in sorted(package_json.get(section, {}).items()):
            frontend_lines.append(f"  {name}: {version}")
    return requirements + "\n\n" + "\n".join(frontend_lines) + "\n"


def make_runtime_env(runtime_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["AI_TRADER_USE_SAMPLE_ONLY"] = "true"
    env["AI_TRADER_ENABLE_SCHEDULER"] = "false"
    env["AI_TRADER_FIXTURE_NOW_ISO"] = "2026-03-15T11:30:00+00:00"
    env["AI_TRADER_SQLITE_PATH"] = str(runtime_dir / "sqlite" / "ai_trader_review.db")
    env["AI_TRADER_DUCKDB_PATH"] = str(runtime_dir / "sqlite" / "ai_trader_review.duckdb")
    env["AI_TRADER_PARQUET_DIR"] = str(runtime_dir / "parquet")
    return env


def collect_versions(runtime_env: dict[str, str]) -> str:
    python_code, python_output = run_command([sys.executable, "--version"], ROOT, runtime_env)
    node_code, node_output = run_command(["node", "-v"], ROOT, runtime_env)
    npm_code, npm_output = run_command([npm_command(), "-v"], ROOT, runtime_env)
    header = [
        f"Python command status: {python_code}",
        python_output.strip(),
        f"Node command status: {node_code}",
        node_output.strip(),
        f"npm command status: {npm_code}",
        npm_output.strip(),
        "",
        "Pinned package versions",
        "---------------------",
        read_requirements_versions().strip(),
    ]
    return "\n".join(header) + "\n"


def collect_git_artifacts() -> tuple[str, str]:
    _, git_status = run_command(["git", "status", "--short"], ROOT)
    _, git_log = run_command(["git", "log", "--oneline", "--decorate", "-n", "10"], ROOT)
    _, git_tags = run_command(["git", "tag", "--list"], ROOT)
    git_log_combined = git_log
    if not git_log_combined.endswith("\n"):
        git_log_combined += "\n"
    git_log_combined += "\nTags\n----\n"
    git_log_combined += git_tags if git_tags else "(no tags)\n"
    return git_status, git_log_combined


def collect_verify_output(runtime_env: dict[str, str]) -> tuple[str, list[str]]:
    commands = [
        ("python scripts/seed_data.py", [sys.executable, "scripts/seed_data.py"], ROOT),
        ("python scripts/backfill.py", [sys.executable, "scripts/backfill.py"], ROOT),
        ("python -m pytest apps/backend/tests", [sys.executable, "-m", "pytest", "apps/backend/tests"], ROOT),
        ("cd apps/frontend && npm run test -- --run", [npm_command(), "run", "test", "--", "--run"], FRONTEND_DIR),
        ("cd apps/frontend && npm run build", [npm_command(), "run", "build"], FRONTEND_DIR),
        ("python scripts/verify.py", [sys.executable, "scripts/verify.py"], ROOT),
    ]
    sections: list[str] = []
    failures: list[str] = []
    for label, command, cwd in commands:
        code, output = run_command(command, cwd, runtime_env)
        sections.append(f"$ {label}\n[exit_code={code}]\n{output.rstrip()}\n")
        if code != 0:
            failures.append(label)
    return "\n".join(sections).strip() + "\n", failures


def collect_contracts(bundle_root: Path, runtime_env: dict[str, str]) -> dict[str, object]:
    os.environ.update(runtime_env)
    sys.path.insert(0, str(BACKEND_DIR))
    from fastapi.testclient import TestClient
    from app.services.pipeline import seed_and_refresh
    from app.main import app

    seed_and_refresh()
    responses: dict[str, object] = {}
    with TestClient(app) as client:
        for route, method, relative_output in CONTRACT_FILES:
            response = client.request(method, route)
            response.raise_for_status()
            payload = response.json()
            responses[route] = payload
            write_json(bundle_root / relative_output, payload)
        signals = responses.get("/api/signals")
        risks = responses.get("/api/risk/latest")
        if isinstance(signals, list) and signals:
            signal_id = signals[0].get("signal_id")
            if signal_id:
                response = client.get(f"/api/signals/{signal_id}")
                response.raise_for_status()
                payload = response.json()
                responses[f"/api/signals/{signal_id}"] = payload
                write_json(bundle_root / "contracts/signal_detail.json", payload)
        if isinstance(risks, list) and risks:
            risk_report_id = risks[0].get("risk_report_id")
            if risk_report_id:
                response = client.get(f"/api/risk/{risk_report_id}")
                response.raise_for_status()
                payload = response.json()
                responses[f"/api/risk/{risk_report_id}"] = payload
                write_json(bundle_root / "contracts/risk_detail.json", payload)
        strategies = responses.get("/api/strategies")
        if isinstance(strategies, list) and strategies:
            strategy_name = strategies[0].get("name")
            if strategy_name:
                response = client.get(f"/api/strategies/{strategy_name}")
                response.raise_for_status()
                payload = response.json()
                responses[f"/api/strategies/{strategy_name}"] = payload
                write_json(bundle_root / "contracts/strategy_detail.json", payload)
        for symbol in ("BTC", "WTI"):
            response = client.get(f"/api/dashboard/assets/{symbol}")
            response.raise_for_status()
            payload = response.json()
            responses[f"/api/dashboard/assets/{symbol}"] = payload
            write_json(bundle_root / f"contracts/asset_context_{symbol}.json", payload)
        backtests = responses.get("/api/backtests")
        if isinstance(backtests, list) and backtests:
            run_id = backtests[0].get("id")
            if run_id is not None:
                response = client.get(f"/api/backtests/{run_id}")
                response.raise_for_status()
                payload = response.json()
                responses[f"/api/backtests/{run_id}"] = payload
                write_json(bundle_root / "contracts/backtest_detail.json", payload)
        for route_name, output_name in (
            ("/api/portfolio/paper-trades/proposed", "contracts/paper_trade_detail_proposed.json"),
            ("/api/portfolio/paper-trades/active", "contracts/paper_trade_detail_active.json"),
            ("/api/portfolio/paper-trades/closed", "contracts/paper_trade_detail_closed.json"),
        ):
            rows = responses.get(route_name)
            if isinstance(rows, list) and rows:
                trade_id = rows[0].get("trade_id")
                if trade_id:
                    response = client.get(f"/api/portfolio/paper-trades/{trade_id}")
                    response.raise_for_status()
                    payload = response.json()
                    responses[f"/api/portfolio/paper-trades/{trade_id}"] = payload
                    write_json(bundle_root / output_name, payload)
                    timeline_response = client.get(f"/api/portfolio/paper-trades/{trade_id}/timeline")
                    timeline_response.raise_for_status()
                    timeline_payload = timeline_response.json()
                    responses[f"/api/portfolio/paper-trades/{trade_id}/timeline"] = timeline_payload
                    write_json(bundle_root / f"contracts/paper_trade_timeline_{trade_id}.json", timeline_payload)
                    stress_response = client.get(f"/api/portfolio/paper-trades/{trade_id}/scenario-stress")
                    stress_response.raise_for_status()
                    stress_payload = stress_response.json()
                    responses[f"/api/portfolio/paper-trades/{trade_id}/scenario-stress"] = stress_payload
                    write_json(bundle_root / f"contracts/paper_trade_stress_{trade_id}.json", stress_payload)
        ticket_rows = responses.get("/api/tickets")
        if isinstance(ticket_rows, list) and ticket_rows:
            ticket_id = ticket_rows[0].get("ticket_id")
            if ticket_id:
                response = client.get(f"/api/tickets/{ticket_id}")
                response.raise_for_status()
                payload = response.json()
                responses[f"/api/tickets/{ticket_id}"] = payload
                write_json(bundle_root / "contracts/ticket_detail.json", payload)
    return responses


def build_review_readme() -> str:
    return textwrap.dedent(
        """
        # Review Bundle

        This repository is a local-first trading research platform with a FastAPI backend, SQLite plus DuckDB and Parquet storage, and a React plus Vite frontend. The current implementation supports fixture-first ingestion, feature computation, signal generation, risk reporting, strategy-lab and backtest surfaces, a dense terminal-style operator console, thin external alert sinks for Telegram and Discord, explicit strategy promotion plus validation tracking, and a first-class data-reality layer for provenance, freshness policy, realism penalties, instrument mapping, and timing semantics. It does not perform live order execution.

        ## Fixture-first mode

        Default local behavior is sample mode. BTC and ETH market bars can come from live connectors, and macro context can come from EIA RSS and FRED, but the code intentionally falls back to deterministic local fixtures when connectors fail or keys are absent. The review bundle was generated entirely from fixture mode with scheduler disabled.

        ## Milestone actually complete

        Milestone 1 is complete and reviewable: monorepo scaffold, seed and backfill scripts, BTC and ETH plus FRED and EIA ingestion with fixture fallback, feature engine v1, trend-breakout and event-driven signals, risk reports, FastAPI routes, and a working dashboard. Milestone 1.5 contract hardening is also present through explicit `signal_id` and `risk_report_id`. Milestone 2A operator-console work is present for signal and risk detail views, opportunity hunting, active trade tracking, journal writes, and in-app alerts. Milestone 2B adds thin Telegram and Discord delivery sinks behind the local alert contract. Milestone 3A adds strategy lifecycle states, forward-validation summaries, calibration snapshots, promotion rationale, and demotion rules. Milestone 3B adds provenance contracts, freshness-policy states, deterministic realism scoring, stronger proxy or oil or metals penalties, and UI-visible data-reality summaries. Milestone 4 adds a first-class paper-trade ledger, lifecycle endpoints, structured review, empirical outcome analytics, and lifecycle alerts. Milestone 5 adds verification tiering, observability, hardening tests, and reviewability docs. Milestone 6A upgrades market-data reality with explicit research-to-tradable mapping, delayed/live timing semantics, stronger oil or metals penalties, and clearer operator-visible trust limits. Milestone 6B adds operator adherence analytics, structured failure attribution, decision-hygiene summaries, and strategy feedback that separates operator error from signal quality. Milestone 7 adds session workflow, persistent review cadence tasks, daily briefing and weekly review aggregation, and an operator backlog that makes daily and weekly operating work explicit in the web console.

        ## Intentionally stubbed

        - No real-money execution, broker routing, or autonomous trading
        - No vector DB, RL, or broad altcoin scanning
        - Macro proxies such as WTI, GOLD, DXY, and US10Y are sample-backed context, not production-grade market feeds
        - OpenAI remote adapter remains a stub
        - UI updates currently rely on polling, not a fully wired websocket event stream
        - External alert delivery remains notification-only; it does not change platform control flow and it does not expose bot commands
        - Calibration output compares score or confidence buckets only and should not be read as probability-of-profit

        ## Exact local run commands

        ```powershell
        pip install -r apps/backend/requirements.txt
        Set-Location apps/frontend
        npm install
        Set-Location ../..
        python scripts/seed_data.py
        python scripts/dev.py
        ```

        Optional:

        ```powershell
        make dev
        ```

        ## Exact test commands

        ```powershell
        python scripts/seed_data.py
        python scripts/backfill.py
        python -m pytest apps/backend/tests
        Set-Location apps/frontend
        npm run test -- --run
        npm run build
        Set-Location ../..
        python scripts/verify.py
        ```

        ## Default ports

        - Backend: `127.0.0.1:8000`
        - Frontend: `127.0.0.1:5173`

        ## Changing ports

        - Backend launcher uses `AI_TRADER_HOST` and `AI_TRADER_PORT`
        - Frontend port can be changed with Vite CLI, for example:

        ```powershell
        Set-Location apps/frontend
        npm run dev -- --host 127.0.0.1 --port 5174
        ```

        Note: if you move the frontend off `5173`, backend CORS settings may also need to be updated because the current defaults allow `127.0.0.1:5173` and `localhost:5173`.
        """
    ).strip() + "\n"


def build_milestone_summary() -> str:
    return textwrap.dedent(
        """
        # Milestone Summary

        ## Milestone 1 included

        - FastAPI plus SQLModel backend using SQLite, DuckDB, Parquet, Polars, and APScheduler
        - Fixture-first ingestion for BTC, ETH, FRED macro events, and EIA news
        - Feature engine v1 for returns, trend state, breakout levels, ATR volatility, relative volume, market structure, cross-asset correlation, and event proximity
        - Trend-breakout and event-driven signals with uncertainty and data-quality fields
        - Risk reports with stop logic, size bands, scenario shocks, and cluster exposure
        - Seed and backfill scripts, dashboard routes, and a working local dashboard shell
        - Milestone 1.5 contract hardening for explicit signal and risk identities plus fixture API snapshots
        - Milestone 2A operator-console workflows for detail views, trades, journal, opportunities, and in-app alerts
        - Milestone 2B thin external delivery sinks for Telegram and Discord with dedupe, cooldowns, and persisted delivery state
        - Milestone 3A promotion and validation core for lifecycle state transitions, forward validation summaries, calibration snapshots, and realism penalties
        - Milestone 3B data-reality upgrades for provenance tracking, freshness policy, realism scoring, and promotion or alert penalties
        - Milestone 4 paper-trading operations with a first-class ledger, lifecycle state changes, structured review, outcome analytics, and lifecycle alerts

        ## Hardened in the testing pass

        - Deterministic assertions for seed and backfill counts
        - Fixture fallback coverage for market and macro connectors
        - API smoke coverage including `POST /api/system/refresh`
        - Signal and risk invariant coverage against real route payloads
        - Feature-pipeline sanity coverage over seeded assets and warm-up behavior
        - Windows-safe `npm.cmd` resolution in `scripts/dev.py`
        - Explicit pytest async loop-scope config
        - One-command local verification with `python scripts/verify.py`

        ## Beyond milestone 1 but already present

        - Strategy registry and typed strategy DSL
        - Vectorbt and backtesting.py runner surfaces
        - Walk-forward, bounded search, and robustness scoring
        - Backtest routes and richer dashboard tabs
        - Promotion rationale, lifecycle history, and forward paper-validation tracking in the operator console

        ## Known technical debt

        - Operator-console write paths are local and last-write-wins; they do not have sync or conflict resolution
        - External alert sinks are tested with mocks only; no live credential coverage is included
        - Polling-based frontend updates despite websocket scaffolding existing in the backend
        - Macro context assets are sample-proxy quality rather than exchange-grade feeds
        - Frontend mock data and backend contracts require continued alignment as routes evolve
        - Calibration in fixture mode falls back to current symbol context when historical signal IDs are unavailable

        ## Immediate next recommended milestone

        Focus on operational hardening rather than scope expansion: add deeper browser-level interaction coverage for trade, journal, and strategy-promotion review flows, tighten websocket or polling semantics, and improve historical calibration or validation review before considering any broader asset or execution work.
        """
    ).strip() + "\n"


def build_arch_review() -> str:
    return textwrap.dedent(
        """
        # Architecture Review

        The system is a monorepo with a Python backend and a TypeScript frontend. The backend owns ingestion, storage, feature calculation, signal generation, risk report building, and API delivery. The frontend is a local dashboard that reads typed JSON contracts and can operate in mock fallback mode if the backend is unavailable.

        ## Backend and frontend split

        - Backend: FastAPI app with route modules under `apps/backend/app/api/routes`
        - Frontend: React plus Vite app under `apps/frontend/src`
        - Shared contract discipline is manual but explicit through backend Pydantic schemas and frontend TypeScript interfaces

        ## Fixture-first approach

        The code is designed to run locally without live keys. The pipeline tries live BTC and ETH market connectors only when sample-only mode is disabled. EIA news and FRED release data use fixtures by default or on failure. This keeps local review and test runs deterministic.

        ## Storage choices

        - SQLite stores operational entities such as bars, signals, risk reports, watchlist items, and pipeline runs
        - Parquet stores bar snapshots for local analytics portability
        - DuckDB provides a simple local analytical view over the parquet layer

        ## Route surface

        Core milestone-1 review routes are `health`, `signals`, `news`, `watchlist`, `risk`, `market`, and `system refresh`. Additional routes for dashboard context, strategy lab, backtests, portfolio, journal, opportunity hunter, alerts, and signal or risk detail are already present. Alert delivery is composed in the backend and then fanned out to in-app, Telegram, and Discord sinks behind configuration.

        ## Where strategy lab fits

        Strategy lab is not the core of milestone 1, but it is already integrated as a local validation layer that consumes stored bar data and persists run metadata and summaries. Milestone 3A extends that layer with lifecycle states, forward-validation tracking, calibration snapshots, promotion rationale, and realism penalties. Review it as a validation subsystem, not as a sign that live execution is present.

        ## What remains local-only

        The entire platform is local-first. There is no broker integration, no autonomous trade execution, and no remote stateful service dependency required for the default workflow. Telegram and Discord are optional thin sinks behind local config, but the browser remains the source of truth.
        """
    ).strip() + "\n"


def build_data_quality_review() -> str:
    return textwrap.dedent(
        """
        # Data Quality Review

        ## Fixture-backed today

        - Seeded OHLCV for BTC, ETH, WTI, GOLD, DXY, and US10Y
        - EIA news fixtures
        - FRED macro release fixtures
        - Sample signals, risk reports, watchlist state, opportunity hunter state, wallet balance, active trades, journal items, persisted alert records, and forward-validation records

        ## Live-capable today

        - BTC and ETH daily bars through CCXT-backed Binance and Coinbase connectors
        - EIA RSS fetch with fixture fallback
        - FRED series tail fetch when an API key is provided

        ## Proxy-grade only

        - WTI, GOLD, DXY, US10Y, and similar macro assets in the current local workflow
        - Strategy results where underlying context differs from a directly tradable proxy
        - Promotion or calibration summaries that inherit proxy-grade mappings or stale fixture context

        ## What should not be treated as production-grade market data yet

        - Any seeded OHLCV series used for macro context
        - Any derived signal confidence or noise metric as calibrated probability
        - Calibration snapshots as probability-of-profit; they are bucket comparisons only
        - Any route payload that depends on fixture narratives rather than venue-verified market data
        """
    ).strip() + "\n"


def build_testing_review() -> str:
    return textwrap.dedent(
        """
        # Testing Review

        Current reviewable coverage is aimed at deterministic local validation rather than exhaustive system testing.

        ## Covered

        - Seed and backfill script determinism
        - API startup and core route smoke coverage, including signal or risk detail, opportunities, alerts, and local trade or journal write flows
        - Alert creation, dedupe, cooldown, sink formatting, and external-delivery failure handling
        - Connector fallback behavior in fixture mode
        - Feature pipeline creation and warm-up sanity
        - Signal and risk route invariants
        - Core risk-engine helpers
        - Strategy-lab baseline parsing, walk-forward, robustness, and API serialization
        - Promotion transitions, demotion logic, forward-validation aggregation, calibration buckets, and realism penalties
        - Frontend app shell, client fallback, contract alignment, ribbon rendering, watchlist opportunity rendering, and placeholder backtest-tab behavior

        ## Deterministic counts

        Fixture mode is expected to emit:

        - `source_mode = sample`
        - `bars_ingested = 1080`
        - `signals_emitted = 2`
        - `risk_reports_built = 2`

        ## Remaining blind spots

        - No browser-level end-to-end interaction coverage
        - No websocket behavior tests
        - No deep DuckDB or parquet integrity assertions beyond smoke
        - Strategy-lab search behavior is covered only at baseline protection level
        - No browser-level mutation tests for manual lifecycle changes

        ## Windows-specific workflow

        - `scripts/dev.py` now resolves `npm.cmd` first
        - `python scripts/verify.py` runs the full local verification sequence
        - pytest explicitly sets `asyncio_default_fixture_loop_scope=function` to avoid noisy deprecation output
        """
    ).strip() + "\n"


def build_known_issues() -> str:
    return textwrap.dedent(
        """
        # Known Issues

        - Signal, risk, and alert payloads now have explicit IDs or dedupe keys, but frontend and backend contracts are still maintained manually rather than generated from a shared schema.
        - Frontend and backend contracts are aligned today, but there is no automated cross-language schema generation, so route drift remains a maintenance risk.
        - Promotion state can change as new validation runs are persisted, so fixture-state screenshots should be reviewed alongside the exact verification output captured in the bundle.
        - Data-reality penalties are deterministic but intentionally conservative in fixture mode, so realism scores should be interpreted as relative local trust signals rather than production-grade certifications.
        - The UI is polling-based even though backend websocket scaffolding exists; freshness expectations should be reviewed with that in mind.
        - Live and fixture paths can diverge in shape or market realism because fixtures are deterministic simulations rather than exchange captures.
        - Oil, metals, DXY, and US10Y context are not production-grade market feeds in the current local workflow.
        - Calibration snapshots in fixture mode may fall back from historical signal IDs to current symbol context when older validation records reference signals not present in the current signal table.
        - `scripts/dev.py` is Windows-safe for npm resolution now, but it still does not manage frontend port overrides or port collisions automatically.
        - Active trades and journal entries are writable locally, but there is no conflict-resolution layer beyond last write wins.
        - Telegram and Discord delivery are best-effort notifications; there is no retry worker or durable outbound queue beyond the local persisted status record.
        """
    ).strip() + "\n"


def build_test_notes() -> str:
    return textwrap.dedent(
        """
        # Test Notes

        - `test_alerting.py`: covers alert creation, dedupe, cooldown, sink payload formatting, and mocked external-delivery failures.
        - `test_api_smoke.py`: proves the FastAPI app starts, core routes respond, and signal or risk detail, opportunities, alerts, trade CRUD, and journal writes do not break startup.
        - `test_pipeline_scripts.py`: locks the seed and backfill scripts to deterministic fixture-mode counts.
        - `test_contract_snapshots.py`: protects the saved fixture-mode API contracts for signals, risk, news, watchlist, and dashboard overview.
        - `test_connector_fallbacks.py`: protects offline local development by proving live connector failures fall back cleanly.
        - `test_feature_pipeline.py`: checks feature columns, seeded-asset coverage, and warm-up NaN containment.
        - `test_data_reality.py`: locks provenance assignment, freshness policy transitions, realism scoring, and stronger proxy or oil penalties.
        - `test_paper_trading.py`: covers paper-trade lifecycle transitions, structured review persistence, analytics summaries, and lifecycle-alert generation.
        - `test_pilot_ops.py`: covers pilot metric aggregation, execution-gate state calculation, adapter health diagnostics, and audit-log persistence.
        - `test_promotion_core.py`: covers lifecycle transitions, demotion logic, forward-validation aggregation, calibration bucket summaries, and realism penalties.
        - `test_signal_and_risk_invariants.py`: asserts real API payloads expose the required fields and sane numeric ranges.
        - `test_risk_engine.py`: guards stop logic, size-band mapping, and risk report construction.
        - `App.test.tsx`: smoke-renders the dense dashboard shell in backend-unavailable mode.
        - `client.test.ts`: protects typed client routing and mock fallback behavior.
        - `contracts.test.ts`: keeps representative frontend payload shapes aligned with backend field names.
        - `TopRibbon.test.tsx`: covers top-ribbon rendering for both normal and stale or missing data states.
        - `ActiveTradesTab.test.tsx`: protects the paper-trade operator surface and create-proposal flow.
        - `BacktestsTab.test.tsx`: proves the backtests tab does not crash when placeholder data is empty.
        - `JournalTab.test.tsx`: protects structured paper-trade review saves and analytics rendering.
        - `PilotDashboardTab.test.tsx`: keeps the pilot-ops view rendering gate blockers, adapter health, and audit activity from the contracted payloads.
        - `StrategyLabTab.test.tsx`: protects the promotion or validation console rendering and run action wiring against contract drift.
        - `SignalDetailsCard.test.tsx`: keeps the signal-detail data-reality block visible with provenance and penalty tags.
        - `WatchlistTab.test.tsx`: checks the opportunity hunter queues render and still support drill-down callbacks.
        """
    ).strip() + "\n"


def build_dev_launch_notes() -> str:
    return textwrap.dedent(
        """
        `scripts/dev.py` launches:

        - backend: `python -m uvicorn app.main:app --app-dir apps/backend --host <AI_TRADER_HOST|127.0.0.1> --port <AI_TRADER_PORT|8000> --reload`
        - frontend: `<npm.cmd|npm> run dev -- --host <AI_TRADER_HOST|127.0.0.1>`

        Notes:

        - The frontend keeps Vite's default port unless you launch it manually with an explicit `--port`.
        - The script handles Ctrl+C and terminates both child processes.
        - The current launcher does not auto-resolve port conflicts.
        """
    ).strip() + "\n"


def build_paper_trading_review() -> str:
    return textwrap.dedent(
        """
        # Paper Trading Review

        Milestone 4 adds a first-class paper-trade ledger without adding real execution.

        ## Lifecycle states

        - proposed
        - opened
        - scaled_in
        - partially_exited
        - closed_win
        - closed_loss
        - invalidated
        - timed_out
        - cancelled

        ## Review and analytics

        Paper trades now persist deterministic local attribution such as entry quality versus zone, stop adherence, target attainment, time to outcome, and MFE or MAE proxies. Structured post-trade review is stored separately and linked by `trade_id`. Outcome analytics are exposed as empirical bucket summaries by signal family, strategy, score bucket, realism bucket, and asset.

        ## Alerts

        Lifecycle alerts are notification-only and cover review due, time stop reached, invalidation breached, target reached, stale open trade, and promoted strategy degradation.
        """
    ).strip() + "\n"


def write_samples(bundle_root: Path, contracts: dict[str, object]) -> None:
    from app.core.clock import naive_utc_now
    from app.services.data_reality import build_data_reality, default_provenance

    signals = contracts["/api/signals"]
    risks = contracts["/api/risk/latest"]
    news = contracts["/api/news"]
    watchlist = contracts["/api/watchlist"]
    opportunities = contracts["/api/watchlist/opportunity-hunter"]
    alerts = contracts["/api/alerts"]
    active_trades = contracts["/api/portfolio/active-trades"]
    proposed_paper_trades = contracts["/api/portfolio/paper-trades/proposed"]
    active_paper_trades = contracts["/api/portfolio/paper-trades/active"]
    closed_paper_trades = contracts["/api/portfolio/paper-trades/closed"]
    paper_trade_analytics = contracts["/api/portfolio/paper-trades/analytics"]
    paper_trade_reviews = contracts["/api/journal/paper-trade-reviews"]
    session_overview = contracts["/api/session/overview"]
    review_tasks = contracts["/api/session/review-tasks"]
    daily_briefing = contracts["/api/session/daily-briefing"]
    weekly_review = contracts["/api/session/weekly-review"]
    operational_backlog = contracts["/api/session/operational-backlog"]
    pilot_metrics = contracts["/api/session/pilot-metrics"]
    execution_gate = contracts["/api/session/execution-gate"]
    pilot_dashboard = contracts["/api/session/pilot-dashboard"]
    pilot_summary = contracts["/api/session/pilot-summary"]
    adapter_health = contracts["/api/session/adapter-health"]
    audit_logs = contracts["/api/session/audit-logs"]
    desk_summary = contracts["/api/dashboard/desk"]
    home_summary = contracts["/api/dashboard/home-summary"]
    signals_summary = contracts["/api/signals/summary"]
    tickets_summary = contracts["/api/tickets/summary"]
    review_summary = contracts["/api/session/review-summary"]
    control_center = contracts["/api/system/control-center"]
    ops_summary = contracts["/api/system/ops-summary"]
    replay = contracts["/api/replay?symbol=BTC"]
    scenario_stress = contracts["/api/replay/scenario-stress?symbol=BTC"]
    tickets = contracts["/api/tickets"]
    shadow_mode = contracts["/api/tickets/shadow-mode"]
    broker_snapshot = contracts["/api/tickets/broker-snapshot"]
    market_chart_btc_1d = contracts["/api/market/chart/BTC?timeframe=1d"]
    market_chart_btc_15m = contracts["/api/market/chart/BTC?timeframe=15m"]
    watchlist_summary = contracts["/api/watchlist/summary"]
    journal = contracts["/api/journal"]
    strategies = contracts["/api/strategies"]
    backtests = contracts["/api/backtests"]
    refresh = contracts["/api/system/refresh"]

    if isinstance(signals, list) and signals:
        write_json(bundle_root / "samples/seeded_signal.json", signals[0])
        strongest = max(signals, key=lambda item: (item.get("data_reality") or {}).get("realism_score", -1))
        weakest = min(signals, key=lambda item: (item.get("data_reality") or {}).get("realism_score", 10_000))
        write_json(bundle_root / "samples/strong_realism_signal.json", strongest)
        write_json(bundle_root / "samples/degraded_realism_signal.json", weakest)
    if isinstance(risks, list) and risks:
        write_json(bundle_root / "samples/seeded_risk_report.json", risks[0])
    if isinstance(news, list) and news:
        write_json(bundle_root / "samples/seeded_news_item.json", news[0])
    if isinstance(watchlist, list) and watchlist:
        write_json(bundle_root / "samples/seeded_watchlist_item.json", watchlist[0])
    if isinstance(watchlist_summary, list) and watchlist_summary:
        write_json(bundle_root / "samples/watchlist_summary_sample.json", watchlist_summary[0])
    if isinstance(opportunities, dict):
        write_json(bundle_root / "samples/opportunity_hunter.json", opportunities)
    if isinstance(alerts, list) and alerts:
        write_json(bundle_root / "samples/seeded_alert.json", alerts[0])
    if isinstance(active_trades, list) and active_trades:
        write_json(bundle_root / "samples/seeded_active_trade.json", active_trades[0])
    if isinstance(proposed_paper_trades, list) and proposed_paper_trades:
        write_json(bundle_root / "samples/paper_trade_proposed.json", proposed_paper_trades[0])
    if isinstance(active_paper_trades, list) and active_paper_trades:
        write_json(bundle_root / "samples/paper_trade_active.json", active_paper_trades[0])
    if isinstance(closed_paper_trades, list) and closed_paper_trades:
        write_json(bundle_root / "samples/paper_trade_closed.json", closed_paper_trades[0])
    if isinstance(paper_trade_reviews, list) and paper_trade_reviews:
        write_json(bundle_root / "samples/paper_trade_review.json", paper_trade_reviews[0])
    if isinstance(tickets, list) and tickets:
        write_json(bundle_root / "samples/trade_ticket_sample.json", tickets[0])
        write_json(bundle_root / "samples/checklist_sample.json", tickets[0].get("checklist_status", {}))
    if isinstance(shadow_mode, list) and shadow_mode:
        write_json(bundle_root / "samples/shadow_mode_sample.json", shadow_mode[0])
    if isinstance(broker_snapshot, dict):
        write_json(bundle_root / "samples/adapter_interface_sample.json", broker_snapshot)
    if isinstance(replay, dict):
        write_json(bundle_root / "samples/replay_sample.json", replay)
    if isinstance(scenario_stress, dict):
        write_json(bundle_root / "samples/scenario_stress_sample.json", scenario_stress)
    if isinstance(market_chart_btc_1d, dict):
        write_json(bundle_root / "samples/chart_data_sample.json", market_chart_btc_1d)
        write_json(bundle_root / "samples/chart_overlay_sample.json", market_chart_btc_1d.get("overlays", {}))
    if isinstance(market_chart_btc_15m, dict):
        write_json(
            bundle_root / "samples/chart_no_data_state_sample.json",
            {
                "status": market_chart_btc_15m.get("status"),
                "status_note": market_chart_btc_15m.get("status_note"),
                "available_timeframes": market_chart_btc_15m.get("available_timeframes"),
                "source_mode": market_chart_btc_15m.get("source_mode"),
                "freshness_state": market_chart_btc_15m.get("freshness_state"),
            },
        )
    if isinstance(review_tasks, list) and review_tasks:
        write_json(bundle_root / "samples/review_task_sample.json", review_tasks[0])
    if isinstance(daily_briefing, dict):
        write_json(bundle_root / "samples/daily_briefing_example.json", daily_briefing)
    if isinstance(weekly_review, dict):
        write_json(bundle_root / "samples/weekly_review_example.json", weekly_review)
    if isinstance(operational_backlog, dict):
        write_json(bundle_root / "samples/operational_backlog_sample.json", operational_backlog)
    if isinstance(session_overview, dict):
        write_json(bundle_root / "samples/session_dashboard_sample.json", session_overview)
    if isinstance(desk_summary, dict):
        write_json(bundle_root / "samples/operator_desk_summary.json", desk_summary)
    if isinstance(home_summary, dict):
        write_json(bundle_root / "samples/home_operator_summary.json", home_summary)
    if isinstance(control_center, dict):
        write_json(bundle_root / "samples/command_center_status.json", control_center)
    if isinstance(ops_summary, dict):
        write_json(bundle_root / "samples/ops_summary.json", ops_summary)
        write_json(bundle_root / "samples/action_history_sample.json", ops_summary.get("action_history", []))
    if isinstance(signals_summary, dict):
        write_json(bundle_root / "samples/signals_summary_sample.json", signals_summary)
    if isinstance(tickets_summary, dict):
        write_json(bundle_root / "samples/tickets_summary_sample.json", tickets_summary)
    if isinstance(review_summary, dict):
        write_json(bundle_root / "samples/review_summary_sample.json", review_summary)
    if isinstance(pilot_metrics, dict):
        write_json(bundle_root / "samples/pilot_metrics_summary.json", pilot_metrics)
        write_json(bundle_root / "samples/divergence_summary_sample.json", pilot_metrics.get("shadow_metrics", {}))
    if isinstance(execution_gate, dict):
        write_json(bundle_root / "samples/execution_gate_sample.json", execution_gate)
    if isinstance(pilot_dashboard, dict):
        write_json(bundle_root / "samples/pilot_dashboard_sample.json", pilot_dashboard)
    if isinstance(pilot_summary, dict):
        write_json(bundle_root / "samples/pilot_summary_sample.json", pilot_summary)
    if isinstance(adapter_health, list) and adapter_health:
        write_json(bundle_root / "samples/adapter_health_sample.json", adapter_health[0])
    if isinstance(audit_logs, list) and audit_logs:
        write_json(bundle_root / "samples/audit_log_sample.json", audit_logs[0])
    if isinstance(paper_trade_analytics, dict):
        write_json(bundle_root / "samples/paper_trade_analytics_summary.json", paper_trade_analytics)
        write_json(bundle_root / "samples/adherence_summary_example.json", paper_trade_analytics.get("hygiene_summary", {}))
        write_json(bundle_root / "samples/family_outcome_diagnostic_summary.json", paper_trade_analytics.get("by_signal_family", []))
        write_json(
            bundle_root / "samples/hygiene_dashboard_sample.json",
            {
                "hygiene_summary": paper_trade_analytics.get("hygiene_summary", {}),
                "failure_categories": paper_trade_analytics.get("failure_categories", []),
                "by_signal_family": paper_trade_analytics.get("by_signal_family", []),
                "by_strategy_lifecycle_state": paper_trade_analytics.get("by_strategy_lifecycle_state", []),
            },
        )
    if isinstance(paper_trade_reviews, list):
        realism_violation = next(
            (item for item in paper_trade_reviews if item.get("realism_warning_ignored")),
            None,
        )
        if realism_violation:
            write_json(bundle_root / "samples/realism_warning_violation_example.json", realism_violation)
            write_json(bundle_root / "samples/failure_attribution_example.json", realism_violation)
    if isinstance(weekly_review, dict):
        write_json(
            bundle_root / "samples/family_outcome_diagnostic_summary.json",
            weekly_review.get("signal_family_outcomes", []),
        )
    active_trade_detail = contracts.get("/api/portfolio/paper-trades/paper_trade_open_eth")
    if isinstance(active_trade_detail, dict):
        write_json(bundle_root / "samples/execution_realism_sample.json", active_trade_detail.get("execution_realism", {}))
        write_json(bundle_root / "samples/event_timeline_sample.json", active_trade_detail.get("timeline", {}))
    active_trade_stress = contracts.get("/api/portfolio/paper-trades/paper_trade_open_eth/scenario-stress")
    if active_trade_stress is not None:
        write_json(bundle_root / "samples/active_trade_stress_example.json", active_trade_stress)
    if isinstance(paper_trade_analytics, dict):
        write_json(bundle_root / "samples/adherence_summary_example.json", paper_trade_analytics.get("hygiene_summary", {}))
    if isinstance(journal, list) and journal:
        write_json(bundle_root / "samples/seeded_journal_entry.json", journal[0])
    shutil.copy2(
        ROOT / "apps/backend/fixtures/strategy_specs/trend_breakout_v1.yaml",
        bundle_root / "samples/sample_strategy_spec_trend_breakout_v1.yaml",
    )
    if isinstance(backtests, list) and backtests:
        write_json(bundle_root / "samples/sample_backtest_result.json", backtests[0])
    strategy_detail = contracts.get(f"/api/strategies/{strategies[0]['name']}") if isinstance(strategies, list) and strategies else None
    if isinstance(strategy_detail, dict):
        write_json(bundle_root / "samples/strategy_promotion_summary.json", strategy_detail)
    backtest_detail = contracts.get(f"/api/backtests/{backtests[0]['id']}") if isinstance(backtests, list) and backtests else None
    if isinstance(backtest_detail, dict):
        write_json(bundle_root / "samples/backtest_validation_summary.json", backtest_detail)
    ticket_detail = contracts.get(f"/api/tickets/{tickets[0]['ticket_id']}") if isinstance(tickets, list) and tickets else None
    if isinstance(ticket_detail, dict):
        write_json(bundle_root / "samples/manual_fill_reconciliation_sample.json", ticket_detail.get("manual_fills", []))
    write_text(
        bundle_root / "samples/seed_counts.txt",
        textwrap.dedent(
            f"""
            Fixture-mode seed counts
            ------------------------
            source_mode: {refresh.get('source_mode')}
            bars_ingested: {refresh.get('bars_ingested')}
            signals_emitted: {refresh.get('signals_emitted')}
            risk_reports_built: {refresh.get('risk_reports_built')}
            data_quality: {refresh.get('data_quality')}
            """
        ).strip()
        + "\n",
    )
    if isinstance(strategies, list) and strategies:
        write_json(bundle_root / "samples/strategy_registry_entry.json", strategies[0])
    btc_asset = contracts.get("/api/dashboard/assets/BTC")
    wti_asset = contracts.get("/api/dashboard/assets/WTI")
    if isinstance(btc_asset, dict) or isinstance(wti_asset, dict):
        write_json(
            bundle_root / "samples/provenance_summary.json",
            {
                "BTC": (btc_asset or {}).get("data_reality"),
                "WTI": (wti_asset or {}).get("data_reality"),
            },
        )
        write_json(
            bundle_root / "samples/asset_mapping_examples.json",
            {
                "BTC": {
                    "research_symbol": ((btc_asset or {}).get("data_reality") or {}).get("provenance", {}).get("research_symbol"),
                    "tradable_symbol": ((btc_asset or {}).get("data_reality") or {}).get("provenance", {}).get("tradable_symbol"),
                    "intended_venue": ((btc_asset or {}).get("data_reality") or {}).get("provenance", {}).get("intended_venue"),
                    "intended_instrument": ((btc_asset or {}).get("data_reality") or {}).get("provenance", {}).get("intended_instrument"),
                },
                "WTI": {
                    "research_symbol": ((wti_asset or {}).get("data_reality") or {}).get("provenance", {}).get("research_symbol"),
                    "tradable_symbol": ((wti_asset or {}).get("data_reality") or {}).get("provenance", {}).get("tradable_symbol"),
                    "intended_venue": ((wti_asset or {}).get("data_reality") or {}).get("provenance", {}).get("intended_venue"),
                    "intended_instrument": ((wti_asset or {}).get("data_reality") or {}).get("provenance", {}).get("intended_instrument"),
                },
            },
        )
    write_json(
        bundle_root / "samples/freshness_state_examples.json",
        {
            "fresh": {"minutes": 120, "sla_minutes": 240},
            "aging": {"minutes": 300, "sla_minutes": 240},
            "stale": {"minutes": 700, "sla_minutes": 240},
            "degraded": {"minutes": 1200, "sla_minutes": 240},
            "unusable": {"minutes": 2200, "sla_minutes": 240},
        },
    )
    write_json(
        bundle_root / "samples/delayed_live_semantics_examples.json",
        {
            "live": default_provenance("BTC", source_mode="live").model_dump(mode="json"),
            "near_live": default_provenance("BTC", source_mode="live").model_copy(update={"source_timing": "near_live"}).model_dump(mode="json"),
            "delayed": default_provenance("US10Y", source_mode="sample").model_dump(mode="json"),
            "end_of_day": default_provenance("WTI", source_mode="sample").model_dump(mode="json"),
            "fixture": default_provenance("BTC", source_mode="sample").model_dump(mode="json"),
        },
    )
    write_json(
        bundle_root / "samples/ui_route_map.json",
        {
            "shell": {
                "home": "Desk",
                "navigation": "Persistent left rail with keyboard-friendly tab access",
                "focus": "Center workspace + right context rail",
                "control_center": "/api/system/control-center",
            },
            "views": [
                {"tab": "Desk", "primary_endpoints": ["/api/dashboard/desk", "/api/system/control-center"]},
                {"tab": "Signals", "primary_endpoints": ["/api/signals", "/api/signals/{signal_id}", "/api/risk/{risk_report_id}"]},
                {"tab": "Tickets", "primary_endpoints": ["/api/tickets", "/api/tickets/shadow-mode", "/api/tickets/broker-snapshot"]},
                {"tab": "Trades", "primary_endpoints": ["/api/portfolio/paper-trades/active", "/api/portfolio/paper-trades/{trade_id}", "/api/portfolio/paper-trades/{trade_id}/timeline"]},
                {"tab": "Journal", "primary_endpoints": ["/api/journal", "/api/journal/paper-trade-reviews", "/api/portfolio/paper-trades/analytics"]},
                {"tab": "Session", "primary_endpoints": ["/api/session/overview", "/api/session/daily-briefing", "/api/session/operational-backlog"]},
                {"tab": "Strategy", "primary_endpoints": ["/api/strategies", "/api/backtests"]},
                {"tab": "Replay", "primary_endpoints": ["/api/replay", "/api/replay/scenario-stress"]},
                {"tab": "Pilot Ops", "primary_endpoints": ["/api/session/pilot-dashboard", "/api/session/execution-gate", "/api/session/adapter-health"]},
            ],
        },
    )
    write_json(
        bundle_root / "samples/ui_component_map.json",
        {
            "shell": ["App", "TopRibbon", "LeftRail", "ContextSidebar", "CommandCenter"],
            "home": ["DeskTab"],
            "signals": ["SignalTable", "SignalDetailsCard"],
            "tickets": ["TradeTicketsTab"],
            "trades": ["ActiveTradesTab"],
            "journal": ["JournalTab"],
            "reviews": ["SessionDashboardTab"],
            "strategy": ["StrategyLabTab", "BacktestsTab"],
            "replay": ["ReplayTab"],
            "pilot_ops": ["PilotDashboardTab"],
        },
    )
    gold_reality = build_data_reality(
        default_provenance("GOLD", source_mode="sample"),
        as_of=naive_utc_now(),
        data_quality="fixture",
        source_mode="sample",
        features={"cross_asset_positive": []},
        tradable_symbol="GLD",
    )
    write_json(
        bundle_root / "samples/oil_realism_example.json",
        (wti_asset or {}).get("data_reality") if isinstance(wti_asset, dict) else {},
    )
    write_json(
        bundle_root / "samples/crypto_vs_metals_realism.json",
        {
            "BTC": (btc_asset or {}).get("data_reality") if isinstance(btc_asset, dict) else {},
            "GOLD": gold_reality.model_dump(mode="json"),
        },
    )


def collect_diagnostics(bundle_root: Path, runtime_env: dict[str, str]) -> None:
    diagnostics = {
        "where_python.txt": ["where", "python"],
        "where_npm.txt": ["where", "npm"],
        "node_version.txt": ["node", "-v"],
        "npm_version.txt": [npm_command(), "-v"],
    }
    for filename, command in diagnostics.items():
        code, output = run_command(command, ROOT, runtime_env)
        write_text(bundle_root / "diagnostics" / filename, f"[exit_code={code}]\n{output}")

    port_checks: list[str] = []
    for port in ("8000", "5173"):
        code, output = run_command(["cmd", "/c", f"netstat -ano | findstr :{port}"], ROOT, runtime_env)
        entry = output.strip() if output.strip() else f"(no listeners on {port})"
        port_checks.append(f"Port {port}\n[exit_code={code}]\n{entry}\n")
    write_text(bundle_root / "diagnostics/port_checks.txt", "\n".join(port_checks))
    write_text(bundle_root / "diagnostics/dev_launch_notes.txt", build_dev_launch_notes())


def create_zip(bundle_root: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(bundle_root.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(ROOT))


def cleanup_runtime_artifacts() -> None:
    runtime_paths = [
        ROOT / "review_bundle_runtime",
        ROOT / "data/test_runtime",
    ]
    for path in runtime_paths:
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)


def main() -> int:
    git_status, git_log = collect_git_artifacts()

    if BUNDLE_DIR.exists():
        shutil.rmtree(BUNDLE_DIR)
    BUNDLE_DIR.mkdir(parents=True, exist_ok=True)
    for subdir in ("contracts", "samples", "tests", "core_files", "docs", "diagnostics"):
        (BUNDLE_DIR / subdir).mkdir(parents=True, exist_ok=True)

    runtime_dir = ROOT / "review_bundle_runtime"
    cleanup_runtime_artifacts()
    runtime_dir.mkdir(parents=True, exist_ok=True)
    try:
        (runtime_dir / "sqlite").mkdir(parents=True, exist_ok=True)
        (runtime_dir / "parquet").mkdir(parents=True, exist_ok=True)
        runtime_env = make_runtime_env(runtime_dir)

        verify_output, failures = collect_verify_output(runtime_env)
        contracts = collect_contracts(BUNDLE_DIR, runtime_env)

        write_text(BUNDLE_DIR / "README_REVIEW.md", build_review_readme())
        write_text(BUNDLE_DIR / "repo_tree.txt", build_repo_tree())
        write_text(BUNDLE_DIR / "versions.txt", collect_versions(runtime_env))
        write_text(BUNDLE_DIR / "verify_output.txt", verify_output)
        write_text(BUNDLE_DIR / "git_status.txt", git_status)
        write_text(BUNDLE_DIR / "git_log.txt", git_log)
        write_text(BUNDLE_DIR / "milestone_summary.md", build_milestone_summary())

        write_text(BUNDLE_DIR / "docs/ARCH_REVIEW.md", build_arch_review())
        write_text(BUNDLE_DIR / "docs/DATA_QUALITY_REVIEW.md", build_data_quality_review())
        write_text(BUNDLE_DIR / "docs/TESTING_REVIEW.md", build_testing_review())
        write_text(BUNDLE_DIR / "docs/KNOWN_ISSUES.md", build_known_issues())
        write_text(BUNDLE_DIR / "docs/PAPER_TRADING_REVIEW.md", build_paper_trading_review())
        for relative_path in REPO_DOC_FILES:
            copy_by_name(relative_path, BUNDLE_DIR / "docs")

        for relative_path in TEST_FILES:
            copy_relative_file(relative_path, BUNDLE_DIR / "tests")
        for relative_path in SNAPSHOT_FILES:
            copy_relative_file(relative_path, BUNDLE_DIR / "tests")
        write_text(BUNDLE_DIR / "tests/TEST_NOTES.md", build_test_notes())

        for relative_path in CORE_FILES:
            copy_relative_file(relative_path, BUNDLE_DIR / "core_files")

        write_samples(BUNDLE_DIR, contracts)
        collect_diagnostics(BUNDLE_DIR, runtime_env)
        for relative_path in RUNTIME_DIAGNOSTIC_FILES:
            copy_by_name(relative_path, BUNDLE_DIR / "diagnostics")

        if failures:
            write_text(BUNDLE_DIR / "diagnostics/failed_commands.txt", "\n".join(failures) + "\n")
        try:
            from app.core.database import engine as app_engine

            app_engine.dispose()
        except Exception:
            pass
    finally:
        cleanup_runtime_artifacts()

    create_zip(BUNDLE_DIR, ZIP_PATH)
    print(f"Created {ZIP_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
