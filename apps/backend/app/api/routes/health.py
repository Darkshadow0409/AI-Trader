from __future__ import annotations

from fastapi import APIRouter

from app.core.settings import get_settings
from app.models.schemas import HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        sqlite_path=str(settings.sqlite_full_path),
        duckdb_path=str(settings.duckdb_full_path),
        parquet_dir=str(settings.parquet_full_path),
    )
