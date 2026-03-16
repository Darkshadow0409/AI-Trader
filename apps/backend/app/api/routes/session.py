from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import (
    AdapterHealthView,
    DailyBriefingView,
    AuditLogView,
    ExecutionGateView,
    OperationalBacklogView,
    PilotDashboardView,
    PilotMetricSummaryView,
    ReviewTaskUpdateRequest,
    ReviewTaskView,
    SessionOverviewView,
    WeeklyReviewView,
)
from app.services.session_workflow import (
    daily_briefing,
    operational_backlog,
    refresh_review_tasks,
    session_overview,
    update_review_task,
    weekly_review,
)
from app.services.pilot_ops import adapter_health_summary, execution_gate_status, pilot_dashboard, pilot_metric_summary, recent_audit_logs


router = APIRouter(prefix="/session", tags=["session"])


@router.get("/overview", response_model=SessionOverviewView)
def get_session_overview(session: Session = Depends(get_session)) -> SessionOverviewView:
    return session_overview(session)


@router.get("/review-tasks", response_model=list[ReviewTaskView])
def get_review_tasks(session: Session = Depends(get_session)) -> list[ReviewTaskView]:
    return refresh_review_tasks(session)


@router.patch("/review-tasks/{task_id}", response_model=ReviewTaskView)
def patch_review_task(
    task_id: str,
    payload: ReviewTaskUpdateRequest,
    session: Session = Depends(get_session),
) -> ReviewTaskView:
    updated = update_review_task(session, task_id, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Review task not found.")
    return updated


@router.get("/daily-briefing", response_model=DailyBriefingView)
def get_daily_briefing(session: Session = Depends(get_session)) -> DailyBriefingView:
    return daily_briefing(session)


@router.get("/weekly-review", response_model=WeeklyReviewView)
def get_weekly_review(session: Session = Depends(get_session)) -> WeeklyReviewView:
    return weekly_review(session)


@router.get("/operational-backlog", response_model=OperationalBacklogView)
def get_operational_backlog(session: Session = Depends(get_session)) -> OperationalBacklogView:
    return operational_backlog(session)


@router.get("/pilot-metrics", response_model=PilotMetricSummaryView)
def get_pilot_metrics(session: Session = Depends(get_session)) -> PilotMetricSummaryView:
    return pilot_metric_summary(session)


@router.get("/execution-gate", response_model=ExecutionGateView)
def get_execution_gate(session: Session = Depends(get_session)) -> ExecutionGateView:
    return execution_gate_status(session)


@router.get("/pilot-dashboard", response_model=PilotDashboardView)
def get_pilot_dashboard(session: Session = Depends(get_session)) -> PilotDashboardView:
    return pilot_dashboard(session)


@router.get("/adapter-health", response_model=list[AdapterHealthView])
def get_adapter_health(session: Session = Depends(get_session)) -> list[AdapterHealthView]:
    return adapter_health_summary(session)


@router.get("/audit-logs", response_model=list[AuditLogView])
def get_audit_logs(session: Session = Depends(get_session)) -> list[AuditLogView]:
    return recent_audit_logs(session)
