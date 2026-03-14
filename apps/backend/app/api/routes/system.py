from __future__ import annotations

from fastapi import APIRouter

from app.models.domain import PipelineSummary
from app.services.pipeline import refresh_pipeline


router = APIRouter(prefix="/system", tags=["system"])


@router.post("/refresh", response_model=PipelineSummary)
def refresh() -> PipelineSummary:
    return refresh_pipeline(force_live=False)
