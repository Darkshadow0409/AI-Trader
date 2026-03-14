from __future__ import annotations

import json
from datetime import UTC, datetime
from math import isnan
from pathlib import Path
from typing import Any, cast

import duckdb
import polars as pl
from sqlalchemy import delete
from sqlmodel import Session, select

from app.connectors.binance_market_data import BinanceMarketData
from app.connectors.coinbase_market_data import CoinbaseMarketData
from app.connectors.eia_client import EIAClient
from app.connectors.fred_client import FredClient
from app.core.database import engine, init_db
from app.core.settings import get_settings
from app.models.domain import DataQuality, PipelineSummary
from app.models.entities import (
    Asset,
    BacktestRun,
    JournalEntry,
    MacroEvent,
    MarketBar,
    NewsItem,
    PipelineRun,
    RiskReport,
    SignalRecord,
    WatchlistItem,
)
from app.services.feature_pipeline import build_feature_frame
from app.services.risk_pipeline import generate_risk_reports
from app.services.sample_data import generate_sample_ohlcv, seed_watchlist
from app.services.signal_pipeline import generate_signals
from app.strategy_lab.service import seed_strategy_lab


settings = get_settings()
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC).replace(tzinfo=None)


def _bars_from_ccxt(symbol: str, payload: list[list[float]], source: str) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row in payload:
        rows.append(
            {
                "symbol": symbol,
                "timeframe": "1d",
                "timestamp": datetime.fromtimestamp(row[0] / 1000, tz=UTC).replace(tzinfo=None),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
                "source": source,
                "data_quality": "live",
                "uncertainty": 0.14,
            }
        )
    return rows


def _normalize_json(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, float) and isnan(value):
        return None
    return value


def _collect_market_data(force_live: bool = False) -> tuple[list[dict[str, object]], str]:
    use_live = force_live or not settings.use_sample_only
    bars: list[dict[str, object]] = []
    source_mode = "sample"
    if use_live:
        for connector_cls, source in ((BinanceMarketData, "binance"), (CoinbaseMarketData, "coinbase")):
            try:
                connector = connector_cls()
                live_rows: list[dict[str, object]] = []
                for symbol in ("BTC", "ETH"):
                    live_rows.extend(_bars_from_ccxt(symbol, connector.fetch_daily_bars(symbol), source))
                if live_rows:
                    bars.extend(live_rows)
                    source_mode = "live"
                    break
            except Exception:
                continue
    if not bars:
        for symbol in ("BTC", "ETH", "WTI", "GOLD", "DXY", "US10Y"):
            bars.extend(generate_sample_ohlcv(symbol))
    return bars, source_mode


def _seed_static_records(session: Session) -> None:
    if session.exec(select(Asset)).first() is None:
        session.add_all(
            [
                Asset(symbol="BTC", name="Bitcoin", asset_class="crypto", venue="binance"),
                Asset(symbol="ETH", name="Ethereum", asset_class="crypto", venue="binance"),
                Asset(symbol="WTI", name="WTI crude proxy", asset_class="commodity", venue="macro"),
                Asset(symbol="GOLD", name="Gold", asset_class="commodity", venue="macro"),
                Asset(symbol="SILVER", name="Silver", asset_class="commodity", venue="macro"),
                Asset(symbol="DXY", name="US Dollar Index", asset_class="macro", venue="macro"),
                Asset(symbol="US10Y", name="US 10Y Treasury", asset_class="macro", venue="macro"),
                Asset(symbol="VIX", name="CBOE Volatility Index", asset_class="macro", venue="macro"),
            ]
        )
        session.commit()

    if session.exec(select(WatchlistItem)).first() is None:
        session.add_all([WatchlistItem(**item) for item in seed_watchlist()])
        session.commit()

    if session.exec(select(JournalEntry)).first() is None:
        journal_entries = json.loads((FIXTURES_DIR / "journal_entries.json").read_text(encoding="utf-8"))
        session.add_all(
            [
                JournalEntry(
                    symbol=item["symbol"],
                    entered_at=_parse_iso(item["entered_at"]),
                    note=item["note"],
                    mood=item["mood"],
                    tags_json=item["tags"],
                )
                for item in journal_entries
            ]
        )
        session.commit()

    if session.exec(select(BacktestRun)).first() is None:
        backtests = json.loads((FIXTURES_DIR / "backtests.json").read_text(encoding="utf-8"))
        session.add_all(
            [
                BacktestRun(
                    name=item["name"],
                    engine="fixture",
                    started_at=datetime.now(UTC).replace(tzinfo=None),
                    metadata_json=item["metadata"],
                )
                for item in backtests
            ]
        )
        session.commit()

    seed_strategy_lab(session)


def _upsert_macro_and_news(session: Session) -> tuple[list[MacroEvent], list[NewsItem]]:
    eia_client = EIAClient(FIXTURES_DIR)
    fred_client = FredClient(FIXTURES_DIR, settings.fred_api_key)

    session.execute(delete(NewsItem))
    session.execute(delete(MacroEvent))

    news_records = [
        NewsItem(
            source=str(item["source"]),
            title=str(item["title"]),
            summary=str(item["summary"]),
            url=str(item.get("url", item.get("link", ""))),
            published_at=_parse_iso(str(item["published_at"])),
            tags_json=cast(list[str], item["tags"]),
            data_quality=str(item.get("data_quality", "fixture")),
        )
        for item in eia_client.fetch_news()
    ]
    event_records = [
        MacroEvent(
            source=str(item["source"]),
            event_time=_parse_iso(str(item["event_time"])),
            event_name=str(item.get("event_name", item.get("title", "Macro event"))),
            category=str(item.get("category", item.get("country", "macro"))),
            impact=str(item["impact"]),
            previous_value=str(item.get("previous_value", "")),
            expected_value=str(item.get("expected_value", "")),
            actual_value=str(item.get("actual_value", "")),
            data_quality=str(item.get("data_quality", "fixture")),
        )
        for item in fred_client.fetch_release_calendar()
    ]
    session.add_all(news_records)
    session.add_all(event_records)
    session.commit()
    return event_records, news_records


def _persist_bars(session: Session, bars: list[dict[str, object]]) -> None:
    session.execute(delete(MarketBar))
    session.add_all([MarketBar(**row) for row in bars])
    session.commit()


def _persist_signals_and_risk(
    session: Session,
    run: PipelineRun,
    signals: list[dict[str, Any]],
    risk_reports: list[dict[str, Any]],
) -> None:
    session.execute(delete(SignalRecord))
    session.execute(delete(RiskReport))
    session.add_all(
        [
            SignalRecord(
                symbol=str(signal["symbol"]),
                signal_type=str(signal["signal_type"]),
                timestamp=signal["timestamp"],
                direction=str(signal["direction"]),
                score=float(signal["score"]),
                thesis=str(signal["thesis"]),
                uncertainty=float(signal["uncertainty"]),
                data_quality=str(signal["data_quality"]),
                features_json={key: _normalize_json(value) for key, value in signal["feature_snapshot"].items()},
            )
            for signal in signals
        ]
    )
    session.add_all(
        [
            RiskReport(
                symbol=str(report["symbol"]),
                as_of=report["as_of"],
                stop_price=float(report["stop_price"]),
                size_band=str(report["size_band"]),
                max_portfolio_risk_pct=float(report["max_portfolio_risk_pct"]),
                exposure_cluster=str(report["exposure_cluster"]),
                uncertainty=float(report["uncertainty"]),
                data_quality=str(report["data_quality"]),
                report_json=report["report_json"],
            )
            for report in risk_reports
        ]
    )

    signal_scores = {str(signal["symbol"]): float(signal["score"]) for signal in signals}
    for item in session.exec(select(WatchlistItem)).all():
        item.last_signal_score = signal_scores.get(item.symbol, item.last_signal_score)
        item.updated_at = datetime.now(tz=UTC)
        item.status = "active" if item.last_signal_score >= 50 else item.status
        session.add(item)
    session.commit()


def _write_parquet(bars: list[dict[str, object]]) -> None:
    settings.parquet_path.mkdir(parents=True, exist_ok=True)
    frame = pl.DataFrame(bars).sort(["symbol", "timestamp"])
    frame.write_parquet(settings.parquet_path / "market_bars.parquet")
    for symbol in frame["symbol"].unique().to_list():
        frame.filter(pl.col("symbol") == symbol).write_parquet(settings.parquet_path / f"{str(symbol).lower()}_1d.parquet")


def _refresh_duckdb() -> None:
    settings.duckdb_file.parent.mkdir(parents=True, exist_ok=True)
    parquet_glob = (settings.parquet_path / "*.parquet").as_posix()
    with duckdb.connect(str(settings.duckdb_file)) as conn:
        conn.execute(f"create or replace view market_bars as select * from read_parquet('{parquet_glob}')")


def _next_event(events: list[MacroEvent]) -> MacroEvent | None:
    now = datetime.utcnow()
    future = sorted((event for event in events if event.event_time >= now), key=lambda item: item.event_time)
    return future[0] if future else None


def seed_and_refresh() -> PipelineSummary:
    init_db()
    with Session(engine) as session:
        _seed_static_records(session)
    return refresh_pipeline(force_live=False)


def refresh_pipeline(force_live: bool = False) -> PipelineSummary:
    init_db()
    with Session(engine) as session:
        _seed_static_records(session)
        bars, source_mode = _collect_market_data(force_live=force_live)
        run = PipelineRun(started_at=datetime.now(UTC), source_mode=source_mode, status="running")
        session.add(run)
        session.commit()
        session.refresh(run)

        events, news = _upsert_macro_and_news(session)
        _persist_bars(session, bars)
        _write_parquet(bars)
        _refresh_duckdb()

        next_event = _next_event(events)
        feature_frame, correlations = build_feature_frame(bars, next_event.event_time if next_event else None)
        latest_rows = (
            feature_frame.sort(["symbol", "timestamp"]).group_by("symbol", maintain_order=True).tail(1).to_dicts()
        )
        latest_tradeables = [
            {
                **{key: _normalize_json(value) for key, value in row.items()},
                "data_quality": str(row.get("data_quality", "fixture")),
            }
            for row in latest_rows
            if row["symbol"] in {"BTC", "ETH"}
        ]
        next_event_payload = (
            {
                "title": next_event.event_name,
                "impact": next_event.impact,
                "event_time": next_event.event_time.isoformat(),
            }
            if next_event
            else None
        )
        signals = generate_signals(latest_tradeables, correlations, next_event_payload)
        risk_reports = generate_risk_reports(signals)
        _persist_signals_and_risk(session, run, signals, risk_reports)

        run.completed_at = datetime.now(UTC)
        run.bars_ingested = len(bars)
        run.signals_emitted = len(signals)
        run.status = "completed"
        run.notes = json.dumps(
            {
                "news_items": len(news),
                "macro_events": len(events),
                "correlations": correlations,
            }
        )
        session.add(run)
        session.commit()

        return PipelineSummary(
            source_mode=source_mode,
            bars_ingested=len(bars),
            signals_emitted=len(signals),
            risk_reports_built=len(risk_reports),
            data_quality=DataQuality.FIXTURE if source_mode == "sample" else DataQuality.LIVE,
        )
