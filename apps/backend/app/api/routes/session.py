from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.schemas import (
    DailyBriefingView,
    OperationalBacklogView,
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
