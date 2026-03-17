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
        "reviewtaskrecord": {
            "task_id": "TEXT",
            "task_type": "TEXT DEFAULT ''",
            "title": "TEXT DEFAULT ''",
            "summary": "TEXT DEFAULT ''",
            "state": "TEXT DEFAULT 'open'",
            "priority": "TEXT DEFAULT 'medium'",
            "session_state": "TEXT DEFAULT 'live_session'",
            "linked_entity_type": "TEXT DEFAULT ''",
            "linked_entity_id": "TEXT DEFAULT ''",
            "linked_symbol": "TEXT DEFAULT ''",
            "signal_id": "TEXT",
            "risk_report_id": "TEXT",
            "trade_id": "TEXT",
            "strategy_name": "TEXT",
            "due_at": "TIMESTAMP",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
            "completed_at": "TIMESTAMP",
            "notes": "TEXT DEFAULT ''",
            "metadata_json": "TEXT DEFAULT '{}'",
        },
        "papertraderecord": {
            "entry_slippage_bps": "REAL DEFAULT 0.0",
            "stop_slippage_bps": "REAL DEFAULT 0.0",
            "target_fill_mode": "TEXT DEFAULT 'touch'",
            "gap_through_stop_flag": "BOOLEAN DEFAULT 0",
            "event_latency_penalty": "REAL DEFAULT 0.0",
            "delayed_source_penalty": "REAL DEFAULT 0.0",
        },
        "tradeticketrecord": {
            "ticket_id": "TEXT",
            "signal_id": "TEXT",
            "risk_report_id": "TEXT",
            "trade_id": "TEXT",
            "strategy_id": "TEXT",
            "symbol": "TEXT DEFAULT ''",
            "side": "TEXT DEFAULT 'long'",
            "proposed_entry_zone_json": "TEXT DEFAULT '{}'",
            "planned_stop": "REAL DEFAULT 0.0",
            "planned_targets_json": "TEXT DEFAULT '{}'",
            "planned_size_json": "TEXT DEFAULT '{}'",
            "realism_summary_json": "TEXT DEFAULT '{}'",
            "freshness_summary_json": "TEXT DEFAULT '{}'",
            "checklist_status_json": "TEXT DEFAULT '{}'",
            "approval_status": "TEXT DEFAULT 'draft'",
            "status": "TEXT DEFAULT 'draft'",
            "shadow_status": "TEXT DEFAULT 'pending'",
            "shadow_summary_json": "TEXT DEFAULT '{}'",
            "approval_notes": "TEXT DEFAULT ''",
            "created_at": "TIMESTAMP",
            "expires_at": "TIMESTAMP",
            "notes": "TEXT DEFAULT ''",
            "updated_at": "TIMESTAMP",
        },
        "manualfillrecord": {
            "fill_id": "TEXT",
            "ticket_id": "TEXT",
            "trade_id": "TEXT",
            "source": "TEXT DEFAULT 'manual'",
            "symbol": "TEXT DEFAULT ''",
            "side": "TEXT DEFAULT 'long'",
            "filled_at": "TIMESTAMP",
            "fill_price": "REAL DEFAULT 0.0",
            "fill_size": "REAL DEFAULT 0.0",
            "fees": "REAL DEFAULT 0.0",
            "slippage_bps": "REAL DEFAULT 0.0",
            "notes": "TEXT DEFAULT ''",
            "import_batch_id": "TEXT",
            "reconciliation_json": "TEXT DEFAULT '{}'",
            "updated_at": "TIMESTAMP",
        },
        "pilotmetricsnapshotrecord": {
            "snapshot_id": "TEXT",
            "generated_at": "TIMESTAMP",
            "summary_json": "TEXT DEFAULT '{}'",
        },
        "adapterhealthrecord": {
            "health_id": "TEXT",
            "adapter_name": "TEXT DEFAULT ''",
            "status": "TEXT DEFAULT 'unknown'",
            "checked_at": "TIMESTAMP",
            "details_json": "TEXT DEFAULT '{}'",
        },
        "auditlogrecord": {
            "audit_id": "TEXT",
            "created_at": "TIMESTAMP",
            "event_type": "TEXT DEFAULT ''",
            "entity_type": "TEXT DEFAULT ''",
            "entity_id": "TEXT DEFAULT ''",
            "actor": "TEXT DEFAULT 'local_operator'",
            "details_json": "TEXT DEFAULT '{}'",
        },
        "opsactionrecord": {
            "action_id": "TEXT",
            "action_name": "TEXT DEFAULT ''",
            "category": "TEXT DEFAULT 'safe_common'",
            "status": "TEXT DEFAULT 'queued'",
            "started_at": "TIMESTAMP",
            "finished_at": "TIMESTAMP",
            "summary": "TEXT DEFAULT ''",
            "log_path": "TEXT",
            "details_json": "TEXT DEFAULT '{}'",
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
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_tradeticketrecord_ticket_id_unique ON tradeticketrecord (ticket_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_tradeticketrecord_status ON tradeticketrecord (status)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_tradeticketrecord_signal_id ON tradeticketrecord (signal_id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_manualfillrecord_fill_id_unique ON manualfillrecord (fill_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_manualfillrecord_ticket_id ON manualfillrecord (ticket_id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_pilotmetricsnapshotrecord_snapshot_id_unique ON pilotmetricsnapshotrecord (snapshot_id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_adapterhealthrecord_health_id_unique ON adapterhealthrecord (health_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_adapterhealthrecord_adapter_name ON adapterhealthrecord (adapter_name)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_auditlogrecord_audit_id_unique ON auditlogrecord (audit_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_auditlogrecord_entity_id ON auditlogrecord (entity_id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_opsactionrecord_action_id_unique ON opsactionrecord (action_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_opsactionrecord_action_name ON opsactionrecord (action_name)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_opsactionrecord_started_at ON opsactionrecord (started_at)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_reviewtaskrecord_task_id_unique ON reviewtaskrecord (task_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_reviewtaskrecord_state ON reviewtaskrecord (state)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_reviewtaskrecord_due_at ON reviewtaskrecord (due_at)"
        )


def init_db() -> None:
    from app.models.entities import ActiveTradeRecord, AdapterHealthRecord, AlertRecord, Asset, AuditLogRecord, BacktestResult, BacktestRun, CalibrationSnapshot, ForwardValidationRecord, JournalEntry, MacroEvent, ManualFillRecord, MarketBar, NewsItem, OpsActionRecord, PaperTradeRecord, PaperTradeReviewRecord, PilotMetricSnapshotRecord, PipelineRun, ReviewTaskRecord, RiskReport, SignalRecord, StrategyRegistryEntry, StrategyStateTransition, TradeTicketRecord, WatchlistItem

    SQLModel.metadata.create_all(engine)
    _ensure_contract_columns()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
