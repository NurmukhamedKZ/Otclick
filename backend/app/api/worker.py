"""Auto-apply worker control endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.worker.queue import get_user_queue
from app.worker.runner import get_registry

router = APIRouter(prefix="/api/worker", tags=["worker"])


class StartResponse(BaseModel):
    state: str
    queued: int


class StopResponse(BaseModel):
    stopped: bool


class StatusResponse(BaseModel):
    state: str
    today_count: int
    daily_limit: int
    queued: int
    next_run_at: str | None
    last_error: str | None


@router.post("/start", response_model=StartResponse)
async def start_worker(user_id: str = Depends(get_current_user)) -> StartResponse:
    handle = await get_registry().start(user_id)
    return StartResponse(state=handle.state, queued=get_user_queue(user_id).qsize())


@router.post("/stop", response_model=StopResponse)
async def stop_worker(user_id: str = Depends(get_current_user)) -> StopResponse:
    stopped = await get_registry().stop(user_id)
    return StopResponse(stopped=stopped)


@router.get("/status", response_model=StatusResponse)
async def worker_status(user_id: str = Depends(get_current_user)) -> StatusResponse:
    from app.worker.limiter import DAILY_LIMIT

    handle = get_registry().get(user_id)
    if handle is None:
        return StatusResponse(
            state="stopped",
            today_count=0,
            daily_limit=DAILY_LIMIT,
            queued=0,
            next_run_at=None,
            last_error=None,
        )
    return StatusResponse(
        state=handle.state,
        today_count=handle.today_count,
        daily_limit=DAILY_LIMIT,
        queued=get_user_queue(user_id).qsize(),
        next_run_at=handle.next_run_at.isoformat() if handle.next_run_at else None,
        last_error=handle.last_error,
    )
