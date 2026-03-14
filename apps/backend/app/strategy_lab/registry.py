from __future__ import annotations

from sqlmodel import Session, select

from app.models.entities import StrategyRegistryEntry
from app.strategy_lab.spec_dsl import dump_strategy_spec
from app.strategy_lab.template_library import get_strategy_spec, list_strategy_specs


def seed_registry(session: Session) -> None:
    existing_names = {row.name for row in session.exec(select(StrategyRegistryEntry)).all()}
    for spec in list_strategy_specs():
        if spec.name in existing_names:
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
