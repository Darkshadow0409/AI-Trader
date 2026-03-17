from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.database import get_session
from app.models.domain import PipelineSummary
from app.models.schemas import CommandCenterStatusView, OpsActionRequest, OpsActionView, OpsSummaryView, PilotExportResponse
from app.services.ops_runtime import list_recent_actions, ops_summary, trigger_action
from app.services.pipeline import refresh_pipeline
from app.services.operator_desk import command_center_status, trigger_pilot_export


router = APIRouter(prefix="/system", tags=["system"])


@router.post("/refresh", response_model=PipelineSummary)
def refresh() -> PipelineSummary:
    return refresh_pipeline(force_live=False)


@router.get("/control-center", response_model=CommandCenterStatusView)
def control_center(session: Session = Depends(get_session)) -> CommandCenterStatusView:
    return command_center_status(session)


@router.get("/ops-summary", response_model=OpsSummaryView)
def system_ops_summary(session: Session = Depends(get_session)) -> OpsSummaryView:
    return ops_summary(session)


@router.get("/action-history", response_model=list[OpsActionView])
def action_history(session: Session = Depends(get_session)) -> list[OpsActionView]:
    return list_recent_actions(session)


@router.post("/actions/{action_name}", response_model=OpsActionView)
def run_action(action_name: str, payload: OpsActionRequest | None = None, session: Session = Depends(get_session)) -> OpsActionView:
    try:
        return trigger_action(session, action_name, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pilot-export", response_model=PilotExportResponse)
def pilot_export(session: Session = Depends(get_session)) -> PilotExportResponse:
    return trigger_pilot_export(session)
