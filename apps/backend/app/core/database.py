from __future__ import annotations

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.settings import get_settings


settings = get_settings()
settings.sqlite_full_path.parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(f"sqlite:///{settings.sqlite_full_path}", echo=False, connect_args={"check_same_thread": False})


def init_db() -> None:
    from app.models.entities import Asset, BacktestResult, BacktestRun, JournalEntry, MacroEvent, MarketBar, NewsItem, PipelineRun, RiskReport, SignalRecord, StrategyRegistryEntry, WatchlistItem

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
