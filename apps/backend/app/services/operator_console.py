from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import delete
from sqlmodel import Session, desc, select

from app.alerting import InAppAlertSink
from app.core.clock import naive_utc_now
from app.models.entities import AlertRecord, ActiveTradeRecord, JournalEntry, RiskReport, SignalRecord, WatchlistItem
from app.models.schemas import (
    ActiveTradeCreateRequest,
    ActiveTradeUpdateRequest,
    ActiveTradeView,
    AlertEnvelope,
    JournalEntryCreateRequest,
    JournalEntryUpdateRequest,
    JournalReviewView,
    OpportunityHunterView,
    OpportunityView,
    RiskDetailView,
    RiskExposureView,
    RiskView,
    SignalDetailView,
    SignalEvidenceView,
    SignalView,
)


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"


def _stable_id(prefix: str, *parts: object) -> str:
    key = "|".join(str(part) for part in parts)
    return f"{prefix}_{uuid5(NAMESPACE_URL, key).hex}"


def _freshness_minutes(value: datetime) -> int:
    return max(0, int((naive_utc_now() - value).total_seconds() // 60))


def _freshness_status(minutes: int) -> str:
    if minutes <= 240:
        return "fresh"
    if minutes <= 1440:
        return "delayed"
    return "stale"


def _coalesce_risk_notes(report: RiskView | None) -> list[str]:
    if not report:
        return ["No persisted risk report is linked yet."]
    notes = report.report.get("risk_notes", [])
    return [str(note) for note in notes] if isinstance(notes, list) else []


def _trade_view(row: ActiveTradeRecord) -> ActiveTradeView:
    return ActiveTradeView(
        trade_id=row.trade_id,
        symbol=row.symbol,
        strategy_name=row.strategy_name,
        side=row.side,
        entry_time=row.entry_time,
        entry_price=row.entry_price,
        current_price=row.current_price,
        stop_price=row.stop_price,
        target_price=row.target_price,
        pnl_pct=row.pnl_pct,
        size_band=row.size_band,
        status=row.status,
        thesis=row.thesis,
        data_quality=row.data_quality,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        notes=row.notes,
        updated_at=row.updated_at,
        freshness_minutes=_freshness_minutes(row.updated_at),
    )


def _journal_view(row: JournalEntry) -> JournalReviewView:
    return JournalReviewView(
        journal_id=row.journal_id,
        symbol=row.symbol,
        entered_at=row.entered_at,
        entry_type=row.entry_type,
        note=row.note,
        mood=row.mood,
        tags=row.tags_json,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        trade_id=row.trade_id,
        setup_quality=row.setup_quality,
        execution_quality=row.execution_quality,
        follow_through=row.follow_through,
        outcome=row.outcome,
        lessons=row.lessons,
        review_status=row.review_status,
        updated_at=row.updated_at,
        freshness_minutes=_freshness_minutes(row.updated_at),
    )


def _alert_view(row: AlertRecord) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=row.alert_id,
        created_at=row.created_at,
        category=row.category,
        severity=row.severity,
        title=row.title,
        message=row.message,
        symbol=row.symbol,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        trade_id=row.trade_id,
        freshness_minutes=row.freshness_minutes,
        data_quality=row.data_quality,
        tags=row.tags_json,
        status=row.status,
        metadata=row.metadata_json,
    )


def seed_console_records(session: Session) -> None:
    _seed_active_trades(session)
    _seed_journal_entries(session)


def _seed_active_trades(session: Session) -> None:
    if session.exec(select(ActiveTradeRecord)).first() is not None:
        return
    payload = json.loads((FIXTURES_DIR / "active_trades.json").read_text(encoding="utf-8"))
    now = naive_utc_now()
    for item in payload:
        entry_time = datetime.fromisoformat(item["entry_time"].replace("Z", "+00:00")).replace(tzinfo=None)
        session.add(
            ActiveTradeRecord(
                trade_id=_stable_id("trade", item["symbol"], item["strategy_name"], entry_time.isoformat()),
                symbol=item["symbol"],
                strategy_name=item["strategy_name"],
                side=item["side"],
                entry_time=entry_time,
                entry_price=float(item["entry_price"]),
                current_price=float(item["current_price"]),
                stop_price=float(item["stop_price"]),
                target_price=float(item["target_price"]),
                pnl_pct=float(item["pnl_pct"]),
                size_band=item["size_band"],
                status=item["status"],
                thesis=item["thesis"],
                data_quality=item.get("data_quality", "fixture"),
                updated_at=now,
            )
        )
    session.commit()


def _seed_journal_entries(session: Session) -> None:
    existing = session.exec(select(JournalEntry)).all()
    if not existing:
        payload = json.loads((FIXTURES_DIR / "journal_entries.json").read_text(encoding="utf-8"))
        for item in payload:
            entered_at = datetime.fromisoformat(item["entered_at"].replace("Z", "+00:00")).replace(tzinfo=None)
            session.add(
                JournalEntry(
                    journal_id=_stable_id("journal", item["symbol"], entered_at.isoformat(), item.get("review_status", "logged")),
                    symbol=item["symbol"],
                    entered_at=entered_at,
                    note=item["note"],
                    mood=item["mood"],
                    tags_json=item["tags"],
                    entry_type="review",
                    setup_quality=int(item.get("setup_quality", 0)),
                    execution_quality=int(item.get("execution_quality", 0)),
                    follow_through=item.get("follow_through", ""),
                    outcome=item.get("outcome", ""),
                    lessons=item.get("lessons", ""),
                    review_status=item.get("review_status", "logged"),
                    updated_at=entered_at,
                )
            )
        session.commit()
        return

    patched = False
    for row in existing:
        if not getattr(row, "journal_id", None):
            row.journal_id = _stable_id("journal", row.symbol, row.entered_at.isoformat(), row.review_status)
            patched = True
        if row.updated_at is None:
            row.updated_at = row.entered_at
            patched = True
        session.add(row)
    if patched:
        session.commit()


def sync_trade_links(session: Session) -> None:
    signals = session.exec(select(SignalRecord)).all()
    risks = session.exec(select(RiskReport)).all()
    signal_map = {row.symbol: row for row in signals}
    risk_map = {row.symbol: row for row in risks}
    changed = False
    for trade in session.exec(select(ActiveTradeRecord)).all():
        signal = signal_map.get(trade.symbol)
        risk = risk_map.get(trade.symbol)
        if signal and trade.signal_id != signal.signal_id:
            trade.signal_id = signal.signal_id
            changed = True
        if risk and trade.risk_report_id != risk.risk_report_id:
            trade.risk_report_id = risk.risk_report_id
            changed = True
        session.add(trade)
    if changed:
        session.commit()


def list_active_trades(session: Session) -> list[ActiveTradeView]:
    seed_console_records(session)
    sync_trade_links(session)
    rows = session.exec(select(ActiveTradeRecord).order_by(desc(ActiveTradeRecord.updated_at))).all()
    return [_trade_view(row) for row in rows]


def create_active_trade(session: Session, payload: ActiveTradeCreateRequest) -> ActiveTradeView:
    trade = ActiveTradeRecord(
        trade_id=_stable_id("trade", payload.symbol, payload.strategy_name, payload.entry_time.isoformat()),
        symbol=payload.symbol.upper(),
        strategy_name=payload.strategy_name,
        side=payload.side,
        entry_time=payload.entry_time,
        entry_price=payload.entry_price,
        current_price=payload.current_price,
        stop_price=payload.stop_price,
        target_price=payload.target_price,
        pnl_pct=round(((payload.current_price / payload.entry_price) - 1) * 100, 2),
        size_band=payload.size_band,
        status=payload.status,
        thesis=payload.thesis,
        data_quality=payload.data_quality,
        signal_id=payload.signal_id,
        risk_report_id=payload.risk_report_id,
        notes=payload.notes,
        updated_at=naive_utc_now(),
    )
    session.add(trade)
    session.commit()
    session.refresh(trade)
    return _trade_view(trade)


def update_active_trade(session: Session, trade_id: str, payload: ActiveTradeUpdateRequest) -> ActiveTradeView | None:
    trade = session.exec(select(ActiveTradeRecord).where(ActiveTradeRecord.trade_id == trade_id)).first()
    if trade is None:
        return None
    for field in ("current_price", "stop_price", "target_price", "status", "size_band", "thesis", "notes", "signal_id", "risk_report_id"):
        value = getattr(payload, field)
        if value is not None:
            setattr(trade, field, value)
    trade.pnl_pct = round(((trade.current_price / trade.entry_price) - 1) * 100, 2)
    trade.updated_at = naive_utc_now()
    session.add(trade)
    session.commit()
    session.refresh(trade)
    return _trade_view(trade)


def delete_active_trade(session: Session, trade_id: str) -> bool:
    trade = session.exec(select(ActiveTradeRecord).where(ActiveTradeRecord.trade_id == trade_id)).first()
    if trade is None:
        return False
    session.delete(trade)
    session.commit()
    return True


def list_journal_entries(session: Session) -> list[JournalReviewView]:
    seed_console_records(session)
    rows = session.exec(select(JournalEntry).order_by(desc(JournalEntry.updated_at), desc(JournalEntry.entered_at))).all()
    return [_journal_view(row) for row in rows]


def create_journal_entry(session: Session, payload: JournalEntryCreateRequest) -> JournalReviewView:
    journal = JournalEntry(
        journal_id=_stable_id("journal", payload.symbol, payload.entered_at.isoformat(), payload.entry_type),
        symbol=payload.symbol.upper(),
        entered_at=payload.entered_at,
        note=payload.note,
        mood=payload.mood,
        tags_json=payload.tags,
        entry_type=payload.entry_type,
        signal_id=payload.signal_id,
        risk_report_id=payload.risk_report_id,
        trade_id=payload.trade_id,
        setup_quality=payload.setup_quality,
        execution_quality=payload.execution_quality,
        follow_through=payload.follow_through,
        outcome=payload.outcome,
        lessons=payload.lessons,
        review_status=payload.review_status,
        updated_at=naive_utc_now(),
    )
    session.add(journal)
    session.commit()
    session.refresh(journal)
    return _journal_view(journal)


def update_journal_entry(session: Session, journal_id: str, payload: JournalEntryUpdateRequest) -> JournalReviewView | None:
    journal = session.exec(select(JournalEntry).where(JournalEntry.journal_id == journal_id)).first()
    if journal is None:
        return None
    for field in ("note", "mood", "tags", "signal_id", "risk_report_id", "trade_id", "setup_quality", "execution_quality", "follow_through", "outcome", "lessons", "review_status"):
        value = getattr(payload, field)
        if value is None:
            continue
        if field == "tags":
            journal.tags_json = value
        else:
            setattr(journal, field, value)
    journal.updated_at = naive_utc_now()
    session.add(journal)
    session.commit()
    session.refresh(journal)
    return _journal_view(journal)


def list_alerts(session: Session) -> list[AlertEnvelope]:
    rows = session.exec(select(AlertRecord).order_by(desc(AlertRecord.created_at))).all()
    return [_alert_view(row) for row in rows]


def list_opportunities(session: Session) -> OpportunityHunterView:
    from app.services.dashboard_data import list_research_views, list_risk_views, list_signal_views

    watchlist_rows = session.exec(select(WatchlistItem).order_by(desc(WatchlistItem.last_signal_score), WatchlistItem.priority.asc())).all()
    signal_map = {row.symbol: row for row in list_signal_views(session)}
    risk_map = {row.symbol: row for row in list_risk_views(session)}
    research_map = {row.symbol: row for row in list_research_views(session)}
    opportunities: list[OpportunityView] = []
    for item in watchlist_rows:
        signal = signal_map.get(item.symbol)
        risk = risk_map.get(item.symbol)
        research = research_map.get(item.symbol)
        signal_score = signal.score if signal else item.last_signal_score
        confidence_bonus = (signal.confidence * 15) if signal else 0.0
        noise_penalty = (signal.noise_probability * 18) if signal else 0.0
        freshness_source = signal.freshness_minutes if signal else max(0, int((naive_utc_now() - item.updated_at).total_seconds() // 60))
        freshness_penalty = min(freshness_source / 60, 12)
        trend_bonus = 6.0 if research and research.trend_state == "uptrend" else 0.0
        total_score = round(signal_score + confidence_bonus + trend_bonus - noise_penalty - freshness_penalty, 2)
        reasons: list[str] = []
        if signal and signal.score >= 55:
            reasons.append("signal_score_above_focus_threshold")
        if research and research.trend_state == "uptrend":
            reasons.append("trend_state_uptrend")
        if research and research.relative_volume >= 1:
            reasons.append("relative_volume_support")
        if risk and risk.max_portfolio_risk_pct <= 0.012:
            reasons.append("risk_budget_acceptable")
        if not reasons:
            reasons.append("awaiting_confirmation")
        queue = "focus" if signal and signal.score >= 55 and signal.noise_probability < 0.5 else "scout"
        opportunities.append(
            OpportunityView(
                symbol=item.symbol,
                label=item.label,
                queue=queue,
                score=total_score,
                score_decomposition={
                    "signal_score": round(signal_score, 2),
                    "confidence_bonus": round(confidence_bonus, 2),
                    "trend_bonus": round(trend_bonus, 2),
                    "noise_penalty": round(noise_penalty, 2),
                    "freshness_penalty": round(freshness_penalty, 2),
                },
                promotion_reasons=reasons,
                freshness_minutes=freshness_source,
                risk_notes=_coalesce_risk_notes(risk),
                signal_id=signal.signal_id if signal else None,
                risk_report_id=risk.risk_report_id if risk else None,
                status=item.status,
            )
        )
    focus_queue = sorted((row for row in opportunities if row.queue == "focus"), key=lambda row: row.score, reverse=True)
    scout_queue = sorted((row for row in opportunities if row.queue == "scout"), key=lambda row: row.score, reverse=True)
    return OpportunityHunterView(generated_at=naive_utc_now(), focus_queue=focus_queue, scout_queue=scout_queue)


def get_signal_detail(session: Session, signal_id: str) -> SignalDetailView | None:
    from app.services.dashboard_data import list_news_views, list_risk_views, list_signal_views

    signal = next((row for row in list_signal_views(session) if row.signal_id == signal_id), None)
    if signal is None:
        return None
    related_risk = next((row for row in list_risk_views(session) if row.signal_id == signal.signal_id), None)
    catalyst_news = list_news_views(session, symbol=signal.symbol)[:4]
    features = signal.features
    evidence = [
        SignalEvidenceView(
            label="Breakout distance",
            value=f"{round(float(features.get('breakout_distance') or 0.0) * 100, 2)}%",
            verdict="supportive" if float(features.get("breakout_distance") or 0.0) > 0 else "neutral",
            note="Distance above the recent breakout level.",
        ),
        SignalEvidenceView(
            label="Relative volume",
            value=f"{round(float(features.get('relative_volume') or 0.0), 2)}x",
            verdict="supportive" if float(features.get("relative_volume") or 0.0) >= 1 else "soft",
            note="Compares current volume to the 20-bar baseline.",
        ),
        SignalEvidenceView(
            label="Trend state",
            value=str(features.get("trend_state") or "unknown"),
            verdict="supportive" if str(features.get("trend_state")) == "uptrend" else "mixed",
            note="EMA and SMA stack state from the feature engine.",
        ),
        SignalEvidenceView(
            label="ATR percent",
            value=f"{round(float(features.get('atr_pct') or 0.0) * 100, 2)}%",
            verdict="acceptable" if float(features.get("atr_pct") or 0.0) <= 0.08 else "elevated",
            note="Volatility context used in breakout scoring.",
        ),
    ]
    return SignalDetailView(
        **signal.model_dump(),
        evidence=evidence,
        catalyst_news=catalyst_news,
        related_risk=related_risk,
        freshness_status=_freshness_status(signal.freshness_minutes),
    )


def get_risk_detail(session: Session, risk_report_id: str) -> RiskDetailView | None:
    from app.services.dashboard_data import list_risk_exposure_views, list_risk_views, list_signal_views

    risk = next((row for row in list_risk_views(session) if row.risk_report_id == risk_report_id), None)
    if risk is None:
        return None
    linked_signal = next((row for row in list_signal_views(session) if row.signal_id == risk.signal_id), None)
    cluster = next((row for row in list_risk_exposure_views(session) if row.cluster == risk.exposure_cluster), None)
    entry_reference = float(risk.report.get("entry_reference") or 0.0)
    stop_logic = {
        "method": "atr_multiple",
        "entry_reference": entry_reference,
        "atr_14": float(risk.report.get("atr_14") or 0.0),
        "stop_price": risk.stop_price,
        "distance": round(abs(entry_reference - risk.stop_price), 4),
    }
    return RiskDetailView(
        **risk.model_dump(),
        linked_signal=linked_signal,
        stop_logic=stop_logic,
        risk_notes=_coalesce_risk_notes(risk),
        cluster_exposure=cluster if isinstance(cluster, RiskExposureView) else cluster,
        freshness_status=_freshness_status(risk.freshness_minutes),
    )


def refresh_in_app_alerts(session: Session) -> None:
    from app.services.dashboard_data import dashboard_ribbon, list_high_risk_signal_views, list_signal_views

    session.execute(delete(AlertRecord))
    sink = InAppAlertSink(session)
    for signal in list_signal_views(session):
        sink.publish(
            AlertEnvelope(
                alert_id=_stable_id("alert", "signal_created", signal.signal_id),
                created_at=naive_utc_now(),
                category="signal_created",
                severity="info",
                title=f"{signal.symbol} signal created",
                message=signal.thesis,
                symbol=signal.symbol,
                signal_id=signal.signal_id,
                risk_report_id=None,
                trade_id=None,
                freshness_minutes=signal.freshness_minutes,
                data_quality=signal.data_quality,
                tags=[signal.signal_type, signal.direction, signal.symbol],
                status="open",
                metadata={"score": signal.score, "confidence": signal.confidence},
            )
        )
    for signal in list_high_risk_signal_views(session):
        sink.publish(
            AlertEnvelope(
                alert_id=_stable_id("alert", "high_risk", signal.signal_id),
                created_at=naive_utc_now(),
                category="high_risk_signal",
                severity="warning",
                title=f"{signal.symbol} marked high risk",
                message=f"Noise {round(signal.noise_probability * 100, 0):.0f}% with uncertainty {signal.uncertainty:.2f}.",
                symbol=signal.symbol,
                signal_id=signal.signal_id,
                risk_report_id=None,
                trade_id=None,
                freshness_minutes=signal.freshness_minutes,
                data_quality=signal.data_quality,
                tags=["high-risk", signal.signal_type, signal.symbol],
                status="open",
                metadata={"noise_probability": signal.noise_probability},
            )
        )
    opportunities = list_opportunities(session)
    for item in opportunities.focus_queue:
        sink.publish(
            AlertEnvelope(
                alert_id=_stable_id("alert", "opportunity", item.symbol, item.signal_id or item.symbol),
                created_at=naive_utc_now(),
                category="opportunity_promotion",
                severity="info",
                title=f"{item.symbol} promoted to focus queue",
                message=", ".join(item.promotion_reasons),
                symbol=item.symbol,
                signal_id=item.signal_id,
                risk_report_id=item.risk_report_id,
                trade_id=None,
                freshness_minutes=item.freshness_minutes,
                data_quality="fixture",
                tags=["opportunity", item.queue, item.symbol],
                status="open",
                metadata={"score_decomposition": item.score_decomposition},
            )
        )
    ribbon = dashboard_ribbon(session)
    if ribbon.freshness_status == "stale":
        sink.publish(
            AlertEnvelope(
                alert_id=_stable_id("alert", "stale_data", ribbon.last_refresh or "none"),
                created_at=naive_utc_now(),
                category="stale_data_warning",
                severity="warning",
                title="Data freshness warning",
                message=f"Pipeline freshness is {ribbon.data_freshness_minutes} minutes and currently {ribbon.freshness_status}.",
                symbol=None,
                signal_id=None,
                risk_report_id=None,
                trade_id=None,
                freshness_minutes=ribbon.data_freshness_minutes,
                data_quality=ribbon.source_mode,
                tags=["stale-data", ribbon.source_mode],
                status="open",
                metadata={"pipeline_status": ribbon.pipeline_status},
            )
        )
    session.commit()
