from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


class Asset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    name: str
    asset_class: str
    venue: str
    underlying_asset: str = Field(default="")
    research_symbol: str = Field(default="")
    tradable_symbol: str = Field(default="")
    intended_venue: str = Field(default="")
    intended_instrument: str = Field(default="")
    source_name: str = Field(default="fixture")
    source_type: str = Field(default="fixture")
    source_timing: str = Field(default="fixture")
    freshness_sla_minutes: int = 240
    realism_grade: str = Field(default="C")
    proxy_mapping_notes: str = ""
    is_active: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class MarketBar(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("symbol", "timeframe", "timestamp", name="uq_market_bar"),)

    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True)
    timeframe: str = Field(index=True)
    timestamp: datetime = Field(index=True)
    open: float
    high: float
    low: float
    close: float
    volume: float
    source: str
    uncertainty: float
    data_quality: str


class NewsItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)
    published_at: datetime = Field(index=True)
    title: str
    summary: str
    url: str
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    data_quality: str


class MacroEvent(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)
    event_time: datetime = Field(index=True)
    event_name: str
    category: str
    impact: str
    previous_value: str = ""
    expected_value: str = ""
    actual_value: str = ""
    data_quality: str


class SignalRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    signal_id: str = Field(index=True, unique=True)
    symbol: str = Field(index=True)
    signal_type: str = Field(index=True)
    timestamp: datetime = Field(index=True)
    direction: str
    score: float
    thesis: str
    uncertainty: float
    data_quality: str
    features_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class RiskReport(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    risk_report_id: str = Field(index=True, unique=True)
    signal_id: str = Field(index=True)
    symbol: str = Field(index=True)
    as_of: datetime = Field(index=True)
    stop_price: float
    size_band: str
    max_portfolio_risk_pct: float
    exposure_cluster: str
    uncertainty: float
    data_quality: str
    report_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class WatchlistItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, unique=True)
    label: str
    thesis: str
    priority: int
    status: str
    last_signal_score: float = 0.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class JournalEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    journal_id: str = Field(index=True, unique=True)
    symbol: str = Field(index=True)
    entered_at: datetime = Field(index=True)
    note: str
    mood: str
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    entry_type: str = "review"
    signal_id: str | None = Field(default=None, index=True)
    risk_report_id: str | None = Field(default=None, index=True)
    trade_id: str | None = Field(default=None, index=True)
    setup_quality: int = 0
    execution_quality: int = 0
    follow_through: str = ""
    outcome: str = ""
    lessons: str = ""
    review_status: str = "logged"
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class ActiveTradeRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    trade_id: str = Field(index=True, unique=True)
    symbol: str = Field(index=True)
    strategy_name: str
    side: str
    entry_time: datetime = Field(index=True)
    entry_price: float
    current_price: float
    stop_price: float
    target_price: float
    pnl_pct: float
    size_band: str
    status: str = Field(index=True)
    thesis: str
    data_quality: str
    signal_id: str | None = Field(default=None, index=True)
    risk_report_id: str | None = Field(default=None, index=True)
    notes: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PaperTradeRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    trade_id: str = Field(index=True, unique=True)
    signal_id: str | None = Field(default=None, index=True)
    risk_report_id: str | None = Field(default=None, index=True)
    strategy_id: str | None = Field(default=None, index=True)
    symbol: str = Field(index=True)
    side: str
    proposed_entry_zone_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    actual_entry: float | None = None
    stop_price: float
    targets_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    size_plan_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    actual_size: float = 0.0
    entry_slippage_bps: float = 0.0
    stop_slippage_bps: float = 0.0
    target_fill_mode: str = "touch"
    gap_through_stop_flag: bool = False
    event_latency_penalty: float = 0.0
    delayed_source_penalty: float = 0.0
    status: str = Field(default="proposed", index=True)
    opened_at: datetime | None = Field(default=None, index=True)
    closed_at: datetime | None = Field(default=None, index=True)
    close_reason: str = ""
    close_price: float | None = None
    notes: str = ""
    lifecycle_events_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    outcome_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    data_quality: str = "fixture"
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PaperWalletRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    wallet_id: str = Field(index=True, unique=True)
    account_label: str = Field(default="Default paper wallet")
    currency: str = Field(default="USD")
    starting_balance: float = 10000.0
    cash_balance: float = 10000.0
    reserved_cash: float = 0.0
    realized_pnl: float = 0.0
    unrealized_pnl: float = 0.0
    equity: float = 10000.0
    status: str = Field(default="active", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PaperLedgerTransactionRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    transaction_id: str = Field(index=True, unique=True)
    wallet_id: str = Field(index=True)
    sequence_number: int = Field(index=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
    transaction_type: str = Field(index=True)
    symbol: str | None = Field(default=None, index=True)
    strategy_key: str | None = Field(default=None, index=True)
    backtest_run_id: str | None = Field(default=None, index=True)
    paper_trade_id: str | None = Field(default=None, index=True)
    simulated_order_id: str | None = Field(default=None, index=True)
    quantity: float = 0.0
    price: float = 0.0
    notional: float = 0.0
    fee: float = 0.0
    cash_delta: float = 0.0
    reserved_delta: float = 0.0
    realized_pnl_delta: float = 0.0
    resulting_cash_balance: float = 0.0
    resulting_reserved_cash: float = 0.0
    resulting_equity: float = 0.0
    reason: str = ""
    assumption_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    audit_ref: str = ""
    immutable: bool = True


class SimulatedOrderRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    simulated_order_id: str = Field(index=True, unique=True)
    wallet_id: str = Field(index=True)
    strategy_key: str | None = Field(default=None, index=True)
    symbol: str = Field(index=True)
    side: str = Field(index=True)
    order_type: str = Field(index=True)
    quantity: float
    requested_price: float
    limit_price: float | None = None
    status: str = Field(default="created", index=True)
    rejection_reason: str = ""
    fill_price: float | None = None
    fill_quantity: float = 0.0
    fee: float = 0.0
    slippage_bps: float = 0.0
    spread_bps: float = 0.0
    candle_fill_rule: str = "manual_price_immediate"
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    filled_at: datetime | None = Field(default=None, index=True)
    assumption_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    source: str = Field(default="manual_simulation", index=True)
    paper_only: bool = True


class PaperRiskPolicyRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    policy_id: str = Field(index=True, unique=True)
    policy_schema_version: str = "phase9e.v1"
    wallet_id: str = Field(index=True)
    max_order_notional: float = 15000.0
    max_position_notional_per_symbol: float = 25000.0
    max_open_orders: int = 5
    max_daily_loss: float = 500.0
    max_drawdown_pct: float = 20.0
    max_strategy_allocation_pct: float = 200.0
    max_symbol_allocation_pct: float = 200.0
    allowed_symbols_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    research_only_symbols_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    min_cash_buffer: float = 100.0
    require_assumption_snapshot: bool = True
    require_strategy_contract: bool = True
    status: str = Field(default="active", index=True)
    pause_reason: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PaperRiskDecisionRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    decision_id: str = Field(index=True, unique=True)
    wallet_id: str = Field(index=True)
    simulated_order_id: str | None = Field(default=None, index=True)
    accepted: bool = Field(index=True)
    action: str = Field(index=True)
    reason_code: str = Field(index=True)
    reason: str
    checked_rules_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    breached_rules_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    wallet_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    order_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    policy_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    paper_only: bool = True


class AiBrainQueryRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    audit_id: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    question: str
    answer_summary: str = ""
    mode: str = Field(default="deterministic_local", index=True)
    paper_only: bool = True
    evidence_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    market_evidence_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    availability_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    wallet_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    risk_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    performance_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    review_snapshot_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    uncertainty_notes_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    degraded_notes_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_order_count: int = 0
    created_ledger_count: int = 0
    created_risk_decision_count: int = 0
    source_route: str = Field(default="/api/ai-brain/query", index=True)
    operator_label: str | None = Field(default=None, index=True)
    archived: bool = Field(default=False, index=True)


class AiBrainOperatorNoteRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    note_id: str = Field(index=True, unique=True)
    ai_brain_query_id: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    note: str
    status: str = Field(default="observation", index=True)
    paper_only: bool = True
    created_by: str = Field(default="local_operator", index=True)
    archived: bool = Field(default=False, index=True)


class PaperTradeReviewRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    review_id: str = Field(index=True, unique=True)
    trade_id: str = Field(index=True, unique=True)
    thesis_respected: bool | None = None
    invalidation_respected: bool | None = None
    entered_inside_suggested_zone: bool | None = None
    time_stop_respected: bool | None = None
    entered_too_early: bool | None = None
    entered_too_late: bool | None = None
    oversized: bool | None = None
    undersized: bool | None = None
    realism_warning_ignored: bool | None = None
    size_plan_respected: bool | None = None
    exited_per_plan: bool | None = None
    catalyst_mattered: bool | None = None
    failure_category: str = ""
    failure_categories_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    operator_notes: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class TradeTicketRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ticket_id: str = Field(index=True, unique=True)
    signal_id: str | None = Field(default=None, index=True)
    risk_report_id: str | None = Field(default=None, index=True)
    trade_id: str | None = Field(default=None, index=True)
    strategy_id: str | None = Field(default=None, index=True)
    symbol: str = Field(index=True)
    side: str
    proposed_entry_zone_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    planned_stop: float = 0.0
    planned_targets_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    planned_size_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    realism_summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    freshness_summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    checklist_status_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    approval_status: str = Field(default="draft", index=True)
    status: str = Field(default="draft", index=True)
    shadow_status: str = Field(default="pending", index=True)
    shadow_summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    approval_notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    expires_at: datetime | None = Field(default=None, index=True)
    notes: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class ManualFillRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    fill_id: str = Field(index=True, unique=True)
    ticket_id: str = Field(index=True)
    trade_id: str | None = Field(default=None, index=True)
    source: str = Field(default="manual", index=True)
    symbol: str = Field(index=True)
    side: str
    filled_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    fill_price: float
    fill_size: float
    fees: float = 0.0
    slippage_bps: float = 0.0
    notes: str = ""
    import_batch_id: str | None = Field(default=None, index=True)
    reconciliation_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PilotMetricSnapshotRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    snapshot_id: str = Field(index=True, unique=True)
    generated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class AdapterHealthRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    health_id: str = Field(index=True, unique=True)
    adapter_name: str = Field(index=True)
    status: str = Field(index=True)
    checked_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    details_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class AuditLogRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    audit_id: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    event_type: str = Field(index=True)
    entity_type: str = Field(index=True)
    entity_id: str = Field(index=True)
    actor: str = Field(default="local_operator", index=True)
    details_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class OpsActionRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    action_id: str = Field(index=True, unique=True)
    action_name: str = Field(index=True)
    category: str = Field(default="safe_common", index=True)
    status: str = Field(default="queued", index=True)
    started_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    finished_at: datetime | None = Field(default=None, index=True)
    summary: str = ""
    log_path: str | None = None
    details_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class AlertRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    alert_id: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    symbol: str | None = Field(default=None, index=True)
    signal_id: str | None = Field(default=None, index=True)
    risk_report_id: str | None = Field(default=None, index=True)
    trade_id: str | None = Field(default=None, index=True)
    asset_ids_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    severity: str = Field(index=True)
    category: str = Field(index=True)
    channel_targets_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    title: str
    message: str = ""
    body: str
    dedupe_key: str = Field(index=True)
    freshness_minutes: int = 0
    data_quality: str = "fixture"
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    status: str = Field(default="queued", index=True)
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    delivery_metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    suppressed_reason: str | None = None
    last_attempted_at: datetime | None = Field(default=None, index=True)


class ReviewTaskRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    task_id: str = Field(index=True, unique=True)
    task_type: str = Field(index=True)
    title: str
    summary: str
    state: str = Field(default="open", index=True)
    priority: str = Field(default="medium", index=True)
    session_state: str = Field(default="live_session", index=True)
    linked_entity_type: str = ""
    linked_entity_id: str = Field(default="", index=True)
    linked_symbol: str = Field(default="", index=True)
    signal_id: str | None = Field(default=None, index=True)
    risk_report_id: str | None = Field(default=None, index=True)
    trade_id: str | None = Field(default=None, index=True)
    strategy_name: str | None = Field(default=None, index=True)
    due_at: datetime = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    completed_at: datetime | None = Field(default=None, index=True)
    notes: str = ""
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class BacktestRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    engine: str
    started_at: datetime = Field(default_factory=datetime.utcnow)
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class StrategyRegistryEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    version: str
    template: str
    description: str
    underlying_symbol: str
    tradable_symbol: str
    timeframe: str
    warmup_bars: int
    fees_bps: float
    slippage_bps: float
    proxy_grade: bool = False
    promoted: bool = False
    lifecycle_state: str = Field(default="experimental", index=True)
    lifecycle_updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    lifecycle_note: str = ""
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    validation_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    search_space_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    spec_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class StrategyStateTransition(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    strategy_name: str = Field(index=True)
    from_state: str
    to_state: str = Field(index=True)
    changed_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    note: str = ""


class ForwardValidationRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    validation_id: str = Field(index=True, unique=True)
    strategy_name: str = Field(index=True)
    mode: str = Field(index=True)
    signal_id: str | None = Field(default=None, index=True)
    risk_report_id: str | None = Field(default=None, index=True)
    trade_id: str | None = Field(default=None, index=True)
    opened_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    closed_at: datetime | None = Field(default=None, index=True)
    entry_price: float = 0.0
    exit_price: float = 0.0
    pnl_pct: float = 0.0
    drawdown_pct: float = 0.0
    target_attained: bool = False
    invalidated: bool = False
    time_stopped: bool = False
    data_quality: str = "fixture"
    notes: str = ""


class CalibrationSnapshot(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    strategy_name: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    bucket_kind: str = Field(index=True)
    summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class BacktestResult(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    strategy_name: str = Field(index=True)
    engine: str
    status: str = Field(index=True)
    symbol: str = Field(index=True)
    timeframe: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    completed_at: datetime | None = None
    proxy_grade: bool = False
    promoted_candidate: bool = False
    fees_bps: float
    slippage_bps: float
    warmup_bars: int
    search_method: str
    robustness_score: float
    net_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    trade_count: int
    validation_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    equity_curve_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    trades_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    stability_heatmap_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    regime_summary_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class PipelineRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    source_mode: str
    bars_ingested: int = 0
    signals_emitted: int = 0
    status: str = "running"
    notes: str = ""
