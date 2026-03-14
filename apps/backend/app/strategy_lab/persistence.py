from __future__ import annotations

import json
import time
from typing import Any

import duckdb

from app.core.settings import get_settings
from app.models.entities import BacktestResult, StrategyRegistryEntry


settings = get_settings()


def _with_duckdb_retry(operation: Any) -> None:
    last_error: Exception | None = None
    for _ in range(6):
        try:
            with duckdb.connect(str(settings.duckdb_file)) as connection:
                operation(connection)
            return
        except duckdb.IOException as error:
            last_error = error
            time.sleep(0.2)
    if last_error is not None:
        return


def sync_strategy_registry_duckdb(entries: list[StrategyRegistryEntry]) -> None:
    def operation(connection: duckdb.DuckDBPyConnection) -> None:
        connection.execute(
            """
            create table if not exists strategy_registry (
                name varchar,
                version varchar,
                template varchar,
                description varchar,
                underlying_symbol varchar,
                tradable_symbol varchar,
                timeframe varchar,
                warmup_bars integer,
                fees_bps double,
                slippage_bps double,
                proxy_grade boolean,
                promoted boolean,
                tags_json varchar,
                validation_json varchar,
                search_space_json varchar,
                spec_json varchar
            )
            """
        )
        connection.execute("delete from strategy_registry")
        for entry in entries:
            connection.execute(
                """
                insert into strategy_registry values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    entry.name,
                    entry.version,
                    entry.template,
                    entry.description,
                    entry.underlying_symbol,
                    entry.tradable_symbol,
                    entry.timeframe,
                    entry.warmup_bars,
                    entry.fees_bps,
                    entry.slippage_bps,
                    entry.proxy_grade,
                    entry.promoted,
                    json.dumps(entry.tags_json),
                    json.dumps(entry.validation_json),
                    json.dumps(entry.search_space_json),
                    json.dumps(entry.spec_json),
                ],
            )
    _with_duckdb_retry(operation)


def persist_backtest_duckdb(result: BacktestResult) -> None:
    def operation(connection: duckdb.DuckDBPyConnection) -> None:
        connection.execute(
            """
            create table if not exists backtest_results (
                id bigint,
                strategy_name varchar,
                engine varchar,
                status varchar,
                symbol varchar,
                timeframe varchar,
                created_at varchar,
                completed_at varchar,
                proxy_grade boolean,
                promoted_candidate boolean,
                fees_bps double,
                slippage_bps double,
                warmup_bars integer,
                search_method varchar,
                robustness_score double,
                net_return_pct double,
                sharpe_ratio double,
                max_drawdown_pct double,
                trade_count integer,
                validation_json varchar,
                summary_json varchar,
                equity_curve_json varchar,
                trades_json varchar,
                stability_heatmap_json varchar,
                regime_summary_json varchar,
                metadata_json varchar
            )
            """
        )
        connection.execute("delete from backtest_results where id = ?", [result.id])
        connection.execute(
            """
            insert into backtest_results values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                result.id,
                result.strategy_name,
                result.engine,
                result.status,
                result.symbol,
                result.timeframe,
                result.created_at.isoformat(),
                result.completed_at.isoformat() if result.completed_at else None,
                result.proxy_grade,
                result.promoted_candidate,
                result.fees_bps,
                result.slippage_bps,
                result.warmup_bars,
                result.search_method,
                result.robustness_score,
                result.net_return_pct,
                result.sharpe_ratio,
                result.max_drawdown_pct,
                result.trade_count,
                json.dumps(result.validation_json),
                json.dumps(result.summary_json),
                json.dumps(result.equity_curve_json),
                json.dumps(result.trades_json),
                json.dumps(result.stability_heatmap_json),
                json.dumps(result.regime_summary_json),
                json.dumps(result.metadata_json),
            ],
        )
    _with_duckdb_retry(operation)
