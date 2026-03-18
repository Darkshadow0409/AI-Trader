from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session, desc, select

from app.alerting import choose_channel_targets, dispatch_alert, stable_alert_id
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
from app.services.data_reality import asset_reality
from app.services.polymarket import crowd_implied_narrative, related_polymarket_markets
from app.services.paper_trading import refresh_paper_trade_alerts


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"


def _stable_id(prefix: str, *parts: object) -> str:
    key = "|".join(str(part) for part in parts)
    return f"{prefix}_{uuid5(NAMESPACE_URL, key).hex}"

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
        freshness_minutes=max(0, int((naive_utc_now() - row.updated_at).total_seconds() // 60)),
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
        freshness_minutes=max(0, int((naive_utc_now() - row.updated_at).total_seconds() // 60)),
    )


def _alert_view(row: AlertRecord) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=row.alert_id,
        created_at=row.created_at,
        signal_id=row.signal_id,
        risk_report_id=row.risk_report_id,
        asset_ids=row.asset_ids_json,
        severity=row.severity,
        category=row.category,
        channel_targets=row.channel_targets_json,
        title=row.title,
        body=row.body,
        tags=row.tags_json,
        dedupe_key=row.dedupe_key,
        status=row.status,
        delivery_metadata=row.delivery_metadata_json,
        data_quality=row.data_quality,
        suppressed_reason=row.suppressed_reason,
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
    deduped: list[AlertRecord] = []
    seen_keys: set[tuple[str, str, str | None, str | None, str]] = set()
    for row in rows:
        if row.status == "suppressed" and row.suppressed_reason in {"dedupe_window", "cooldown_window"}:
            continue
        semantic_key = (
            row.category,
            row.title,
            row.signal_id,
            row.risk_report_id,
            row.dedupe_key,
        )
        if semantic_key in seen_keys:
            continue
        seen_keys.add(semantic_key)
        deduped.append(row)
    return [_alert_view(row) for row in deduped]


def _compose_signal_alert(signal: SignalView) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=stable_alert_id("signal_ranked", signal.signal_id),
        created_at=naive_utc_now(),
        signal_id=signal.signal_id,
        risk_report_id=None,
        asset_ids=signal.affected_assets or [signal.symbol],
        severity="info",
        category="signal_ranked",
        channel_targets=choose_channel_targets("info"),
        title=f"{signal.symbol} ranked signal",
        body=f"Score {signal.score:.1f}, confidence {signal.confidence:.2f}, noise {signal.noise_probability:.2f}. {signal.thesis}",
        tags=[signal.signal_type, signal.direction, signal.symbol],
        dedupe_key=f"signal_ranked:{signal.signal_id}",
        data_quality=signal.data_quality,
    )


def _compose_high_risk_alert(signal: SignalView) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=stable_alert_id("high_risk_signal", signal.signal_id),
        created_at=naive_utc_now(),
        signal_id=signal.signal_id,
        risk_report_id=None,
        asset_ids=signal.affected_assets or [signal.symbol],
        severity="warning",
        category="high_risk_signal",
        channel_targets=choose_channel_targets("warning"),
        title=f"{signal.symbol} high-risk signal",
        body=f"Noise probability {signal.noise_probability:.2f} with uncertainty {signal.uncertainty:.2f}. Invalidation {signal.invalidation:.2f}.",
        tags=["high-risk", signal.signal_type, signal.symbol],
        dedupe_key=f"high_risk_signal:{signal.signal_id}",
        data_quality=signal.data_quality,
    )


def _compose_focus_promotion_alert(item: OpportunityView) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=stable_alert_id("focus_promotion", item.symbol, item.signal_id or item.symbol),
        created_at=naive_utc_now(),
        signal_id=item.signal_id,
        risk_report_id=item.risk_report_id,
        asset_ids=[item.symbol],
        severity="info",
        category="scout_to_focus_promotion",
        channel_targets=choose_channel_targets("info"),
        title=f"{item.symbol} promoted to focus",
        body=f"Opportunity score {item.score:.1f}. Reasons: {', '.join(item.promotion_reasons)}. Risk notes: {' | '.join(item.risk_notes)}",
        tags=["opportunity", item.queue, item.symbol],
        dedupe_key=f"focus_promotion:{item.symbol}:{item.signal_id or item.symbol}",
        data_quality="fixture",
    )


def _compose_stale_data_alert(ribbon: Any) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=stable_alert_id("stale_data", ribbon.last_refresh or "none", ribbon.data_freshness_minutes),
        created_at=naive_utc_now(),
        signal_id=None,
        risk_report_id=None,
        asset_ids=[],
        severity="warning",
        category="stale_data_warning",
        channel_targets=choose_channel_targets("warning"),
        title="Data freshness warning",
        body=f"Pipeline freshness is {ribbon.data_freshness_minutes} minutes and status is {ribbon.freshness_status}.",
        tags=["stale-data", ribbon.source_mode],
        dedupe_key=f"stale_data:{ribbon.freshness_status}:{ribbon.data_freshness_minutes}",
        data_quality=ribbon.source_mode,
    )


def _compose_risk_budget_alert(ribbon: Any) -> AlertEnvelope:
    return AlertEnvelope(
        alert_id=stable_alert_id("risk_budget_breach", ribbon.last_refresh or "none", ribbon.risk_budget_used_pct),
        created_at=naive_utc_now(),
        signal_id=None,
        risk_report_id=None,
        asset_ids=[],
        severity="critical",
        category="risk_budget_breach",
        channel_targets=choose_channel_targets("critical"),
        title="Risk budget breached",
        body=f"Used {ribbon.risk_budget_used_pct:.3f}% against total {ribbon.risk_budget_total_pct:.3f}%.",
        tags=["risk-budget", ribbon.source_mode],
        dedupe_key=f"risk_budget_breach:{ribbon.risk_budget_used_pct:.3f}:{ribbon.risk_budget_total_pct:.3f}",
        data_quality=ribbon.source_mode,
    )


def _compose_daily_digest(signals: list[SignalView], opportunities: OpportunityHunterView, ribbon: Any) -> AlertEnvelope:
    lead_signal = signals[0] if signals else None
    title = "Daily operator digest"
    body = (
        f"Signals {len(signals)}, focus queue {len(opportunities.focus_queue)}, "
        f"risk budget {ribbon.risk_budget_used_pct:.3f}/{ribbon.risk_budget_total_pct:.3f}."
    )
    if lead_signal is not None:
        body += f" Lead signal: {lead_signal.symbol} {lead_signal.signal_type} score {lead_signal.score:.1f}."
    return AlertEnvelope(
        alert_id=stable_alert_id("daily_digest", naive_utc_now().date().isoformat()),
        created_at=naive_utc_now(),
        signal_id=lead_signal.signal_id if lead_signal else None,
        risk_report_id=None,
        asset_ids=[lead_signal.symbol] if lead_signal else [],
        severity="info",
        category="daily_digest_summary",
        channel_targets=choose_channel_targets("info"),
        title=title,
        body=body,
        tags=["daily-digest", ribbon.source_mode],
        dedupe_key=f"daily_digest:{naive_utc_now().date().isoformat()}",
        data_quality=ribbon.source_mode,
    )


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
        data_reality = asset_reality(
            session,
            item.symbol,
            as_of=signal.timestamp if signal else item.updated_at,
            data_quality=signal.data_quality if signal else "fixture",
            features=signal.features if signal else None,
        )
        freshness_penalty = min(freshness_source / 60, 12)
        realism_penalty = data_reality.ranking_penalty
        trend_bonus = 6.0 if research and research.trend_state == "uptrend" else 0.0
        total_score = round(signal_score + confidence_bonus + trend_bonus - noise_penalty - freshness_penalty - realism_penalty, 2)
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
                    "realism_penalty": round(realism_penalty, 2),
                },
                promotion_reasons=reasons,
                freshness_minutes=freshness_source,
                risk_notes=_coalesce_risk_notes(risk),
                signal_id=signal.signal_id if signal else None,
                risk_report_id=risk.risk_report_id if risk else None,
                status=item.status,
                data_reality=data_reality,
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
    related_markets = related_polymarket_markets(signal.symbol, signal.thesis, *(item.title for item in catalyst_news[:2]))
    return SignalDetailView(
        **signal.model_dump(),
        evidence=evidence,
        catalyst_news=catalyst_news,
        related_risk=related_risk,
        freshness_status=signal.data_reality.freshness_state if signal.data_reality else "fresh",
        related_polymarket_markets=related_markets,
        crowd_implied_narrative=crowd_implied_narrative(signal.symbol, signal.thesis, *(item.title for item in catalyst_news[:2])),
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
        freshness_status=risk.data_reality.freshness_state if risk.data_reality else "fresh",
    )


def refresh_alerts(session: Session) -> None:
    from app.services.dashboard_data import dashboard_ribbon, list_high_risk_signal_views, list_signal_views

    signals = list_signal_views(session)
    high_risk = list_high_risk_signal_views(session)
    opportunities = list_opportunities(session)
    ribbon = dashboard_ribbon(session)

    for signal in signals:
        if signal.data_reality is None or signal.data_reality.alert_allowed:
            dispatch_alert(session, _compose_signal_alert(signal))
    for signal in high_risk:
        if signal.data_reality is None or signal.data_reality.alert_allowed:
            dispatch_alert(session, _compose_high_risk_alert(signal))
    for item in opportunities.focus_queue:
        if item.data_reality is None or item.data_reality.alert_allowed:
            dispatch_alert(session, _compose_focus_promotion_alert(item))
    if ribbon.freshness_status in {"stale", "degraded", "unusable"}:
        dispatch_alert(session, _compose_stale_data_alert(ribbon))
    if ribbon.risk_budget_used_pct > ribbon.risk_budget_total_pct:
        dispatch_alert(session, _compose_risk_budget_alert(ribbon))
    dispatch_alert(session, _compose_daily_digest(signals, opportunities, ribbon))
    refresh_paper_trade_alerts(session)
