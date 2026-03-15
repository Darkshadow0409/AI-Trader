from __future__ import annotations

from app.core.clock import naive_utc_now
from sqlmodel import Session, select

from app.models.entities import StrategyRegistryEntry
from app.strategy_lab.spec_dsl import dump_strategy_spec
from app.strategy_lab.template_library import get_strategy_spec, list_strategy_specs


DEFAULT_LIFECYCLE: dict[str, tuple[str, str]] = {
    "trend_breakout_v1": ("paper_validating", "Forward paper validation is underway."),
    "vol_expansion_v1": ("experimental", "Awaiting stronger validation and sample growth."),
    "event_continuation_v1": ("demoted", "Event-driven continuation degraded in prior validation."),
}


def seed_registry(session: Session) -> None:
    existing_rows = {row.name: row for row in session.exec(select(StrategyRegistryEntry)).all()}
    existing_names = set(existing_rows)
    for spec in list_strategy_specs():
        lifecycle_state, lifecycle_note = DEFAULT_LIFECYCLE.get(spec.name, ("experimental", "Seeded strategy template."))
        if spec.name in existing_names:
            row = existing_rows[spec.name]
            if not getattr(row, "lifecycle_state", None):
                row.lifecycle_state = lifecycle_state
            if not getattr(row, "lifecycle_updated_at", None):
                row.lifecycle_updated_at = naive_utc_now()
            if not getattr(row, "lifecycle_note", None):
                row.lifecycle_note = lifecycle_note
            session.add(row)
            continue
        session.add(
            StrategyRegistryEntry(
                name=spec.name,
                version=spec.version,
                template=spec.template,
                description=spec.description,
                underlying_symbol=spec.underlying_symbol,
                tradable_symbol=spec.tradable_symbol,
                timeframe=spec.timeframe,
                warmup_bars=spec.validation.warmup_bars,
                fees_bps=spec.execution.fees_bps,
                slippage_bps=spec.execution.slippage_bps,
                proxy_grade=spec.proxy_grade,
                promoted=False,
                lifecycle_state=lifecycle_state,
                lifecycle_note=lifecycle_note,
                tags_json=spec.tags,
                validation_json=spec.validation.model_dump(mode="json"),
                search_space_json={key: value.model_dump(mode="json") for key, value in spec.search_space.items()},
                spec_json=dump_strategy_spec(spec),
            )
        )
    session.commit()


def get_registry_entry(session: Session, strategy_name: str) -> StrategyRegistryEntry:
    row = session.exec(select(StrategyRegistryEntry).where(StrategyRegistryEntry.name == strategy_name)).first()
    if row is None:
        spec = get_strategy_spec(strategy_name)
        seed_registry(session)
        row = session.exec(select(StrategyRegistryEntry).where(StrategyRegistryEntry.name == spec.name)).one()
    return row
