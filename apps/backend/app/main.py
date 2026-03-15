from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import alerts, backtests, dashboard, health, journal, market, news, portfolio, research, risk, signals, strategies, system, watchlist
from app.core.settings import get_settings
from app.services.pipeline import seed_and_refresh
from app.websocket.manager import manager


settings = get_settings()
scheduler = AsyncIOScheduler(timezone="UTC")


def _scheduled_refresh() -> None:
    seed_and_refresh()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    seed_and_refresh()
    if settings.enable_scheduler:
        scheduler.add_job(
            _scheduled_refresh,
            "interval",
            minutes=settings.pipeline_refresh_minutes,
            id="pipeline-refresh",
            replace_existing=True,
        )
        scheduler.start()
    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)


app = FastAPI(title="AI Trader", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(signals.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(research.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(journal.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(risk.router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(strategies.router, prefix="/api")
app.include_router(backtests.router, prefix="/api")


@app.websocket("/ws/updates")
async def updates(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
