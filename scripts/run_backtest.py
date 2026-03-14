from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlmodel import Session


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "backend"))

from app.core.database import engine, init_db
from app.models.schemas import BacktestRunRequest
from app.services.pipeline import seed_and_refresh
from app.strategy_lab.service import run_backtest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a local Strategy Lab backtest and persist the result.")
    parser.add_argument("--strategy", required=True, help="Registered strategy name, for example trend_breakout_v1")
    parser.add_argument("--search-method", choices=["grid", "random", "optuna"], default="grid")
    parser.add_argument("--max-trials", type=int, default=8)
    parser.add_argument("--promote", action="store_true", help="Request promotion if walk-forward and robustness gates pass")
    parser.add_argument("--skip-refresh", action="store_true", help="Do not seed or refresh sample data before running")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    init_db()
    if not args.skip_refresh:
        seed_and_refresh()

    request = BacktestRunRequest(
        strategy_name=args.strategy,
        search_method=args.search_method,
        max_trials=args.max_trials,
        promote_candidate=args.promote,
    )
    with Session(engine) as session:
        result = run_backtest(session, request)

    payload = {
        "id": result.id,
        "strategy_name": result.strategy_name,
        "symbol": result.symbol,
        "search_method": result.search_method,
        "proxy_grade": result.proxy_grade,
        "promoted_candidate": result.promoted_candidate,
        "robustness_score": result.robustness_score,
        "net_return_pct": result.net_return_pct,
        "sharpe_ratio": result.sharpe_ratio,
        "max_drawdown_pct": result.max_drawdown_pct,
        "trade_count": result.trade_count,
    }
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
