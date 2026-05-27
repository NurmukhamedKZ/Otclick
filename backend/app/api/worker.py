"""Auto-apply worker control endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user, require_active_plan
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
    skipped_has_test: int = 0


@router.post("/start", response_model=StartResponse)
async def start_worker(user_id: str = Depends(require_active_plan)) -> StartResponse:
    handle = await get_registry().start(user_id)
    return StartResponse(state=handle.state, queued=get_user_queue(user_id).qsize())


@router.post("/stop", response_model=StopResponse)
async def stop_worker(user_id: str = Depends(get_current_user)) -> StopResponse:
    stopped = await get_registry().stop(user_id)
    return StopResponse(stopped=stopped)


@router.get("/status", response_model=StatusResponse)
async def worker_status(user_id: str = Depends(get_current_user)) -> StatusResponse:
    import asyncio

    from app.worker.limiter import DAILY_LIMIT, _read_day_count, _today_local, _tz_for_user

    loop = asyncio.get_running_loop()

    def _today_count_db() -> int:
        tz = _tz_for_user(user_id)
        return _read_day_count(user_id, _today_local(tz))

    db_today = await loop.run_in_executor(None, _today_count_db)
    queued = get_user_queue(user_id).qsize()

    handle = get_registry().get(user_id)
    if handle is None:
        return StatusResponse(
            state="stopped",
            today_count=db_today,
            daily_limit=DAILY_LIMIT,
            queued=queued,
            next_run_at=None,
            last_error=None,
        )
    return StatusResponse(
        state=handle.state,
        today_count=max(handle.today_count, db_today),
        daily_limit=DAILY_LIMIT,
        queued=queued,
        next_run_at=handle.next_run_at.isoformat() if handle.next_run_at else None,
        last_error=handle.last_error,
        skipped_has_test=handle.skipped_has_test,
    )
