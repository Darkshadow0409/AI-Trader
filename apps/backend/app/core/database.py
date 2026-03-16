from __future__ import annotations

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.settings import get_settings


settings = get_settings()
settings.sqlite_full_path.parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(f"sqlite:///{settings.sqlite_full_path}", echo=False, connect_args={"check_same_thread": False})


def _sqlite_columns(table_name: str) -> set[str]:
    with engine.connect() as connection:
        rows = connection.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row[1]) for row in rows}


def _ensure_contract_columns() -> None:
    if engine.dialect.name != "sqlite":
        return
    table_columns = {
        "asset": {
            "underlying_asset": "TEXT DEFAULT ''",
            "research_symbol": "TEXT DEFAULT ''",
            "tradable_symbol": "TEXT DEFAULT ''",
            "intended_venue": "TEXT DEFAULT ''",
            "intended_instrument": "TEXT DEFAULT ''",
            "source_name": "TEXT DEFAULT 'fixture'",
            "source_type": "TEXT DEFAULT 'fixture'",
            "source_timing": "TEXT DEFAULT 'fixture'",
            "freshness_sla_minutes": "INTEGER DEFAULT 240",
            "realism_grade": "TEXT DEFAULT 'C'",
            "proxy_mapping_notes": "TEXT DEFAULT ''",
        },
        "signalrecord": {
            "signal_id": "TEXT",
        },
        "riskreport": {
            "risk_report_id": "TEXT",
            "signal_id": "TEXT",
        },
        "journalentry": {
            "journal_id": "TEXT",
            "entry_type": "TEXT",
            "signal_id": "TEXT",
            "risk_report_id": "TEXT",
            "trade_id": "TEXT",
            "setup_quality": "INTEGER DEFAULT 0",
            "execution_quality": "INTEGER DEFAULT 0",
            "follow_through": "TEXT DEFAULT ''",
            "outcome": "TEXT DEFAULT ''",
            "lessons": "TEXT DEFAULT ''",
            "review_status": "TEXT DEFAULT 'logged'",
            "updated_at": "TIMESTAMP",
        },
        "alertrecord": {
            "signal_id": "TEXT",
            "risk_report_id": "TEXT",
            "asset_ids_json": "TEXT DEFAULT '[]'",
            "channel_targets_json": "TEXT DEFAULT '[]'",
            "body": "TEXT DEFAULT ''",
            "dedupe_key": "TEXT DEFAULT ''",
            "delivery_metadata_json": "TEXT DEFAULT '{}'",
            "suppressed_reason": "TEXT",
            "last_attempted_at": "TIMESTAMP",
        },
        "strategyregistryentry": {
            "lifecycle_state": "TEXT DEFAULT 'experimental'",
            "lifecycle_updated_at": "TIMESTAMP",
            "lifecycle_note": "TEXT DEFAULT ''",
        },
        "papertradereviewrecord": {
            "entered_inside_suggested_zone": "BOOLEAN",
            "time_stop_respected": "BOOLEAN",
            "size_plan_respected": "BOOLEAN",
            "exited_per_plan": "BOOLEAN",
            "failure_categories_json": "TEXT DEFAULT '[]'",
        },
    }
    with engine.begin() as connection:
        for table_name, columns in table_columns.items():
            existing = _sqlite_columns(table_name)
            for column_name, column_type in columns.items():
                if column_name not in existing:
                    connection.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_signalrecord_signal_id_unique ON signalrecord (signal_id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_riskreport_risk_report_id_unique ON riskreport (risk_report_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_riskreport_signal_id ON riskreport (signal_id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_journalentry_journal_id_unique ON journalentry (journal_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_alertrecord_dedupe_key ON alertrecord (dedupe_key)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_strategyregistryentry_lifecycle_state ON strategyregistryentry (lifecycle_state)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_papertraderecord_trade_id_unique ON papertraderecord (trade_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_papertraderecord_status ON papertraderecord (status)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_papertradereviewrecord_trade_id_unique ON papertradereviewrecord (trade_id)"
        )


def init_db() -> None:
    from app.models.entities import ActiveTradeRecord, AlertRecord, Asset, BacktestResult, BacktestRun, CalibrationSnapshot, ForwardValidationRecord, JournalEntry, MacroEvent, MarketBar, NewsItem, PaperTradeRecord, PaperTradeReviewRecord, PipelineRun, RiskReport, SignalRecord, StrategyRegistryEntry, StrategyStateTransition, WatchlistItem

    SQLModel.metadata.create_all(engine)
    _ensure_contract_columns()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
