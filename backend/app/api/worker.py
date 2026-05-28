"""Auto-apply worker control endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user, require_active_plan
from app.services import worker_control

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


# The runners live in the standalone worker container, not this process — the
# dashboard only flips the persisted worker_enabled flag (worker_main reconciles
# within its poll interval). Status is derived from the flag + DB counters.
@router.post("/start", response_model=StartResponse)
async def start_worker(user_id: str = Depends(require_active_plan)) -> StartResponse:
    await worker_control.set_enabled(user_id, True)
    return StartResponse(state="running", queued=0)


@router.post("/stop", response_model=StopResponse)
async def stop_worker(user_id: str = Depends(get_current_user)) -> StopResponse:
    await worker_control.set_enabled(user_id, False)
    return StopResponse(stopped=True)


@router.get("/status", response_model=StatusResponse)
async def worker_status(user_id: str = Depends(get_current_user)) -> StatusResponse:
    import asyncio

    from app.services import worker_runtime
    from app.worker.limiter import DAILY_LIMIT, _read_day_count, _today_local, _tz_for_user

    loop = asyncio.get_running_loop()

    def _today_count_db() -> int:
        tz = _tz_for_user(user_id)
        return _read_day_count(user_id, _today_local(tz))

    db_today, enabled, rt = await asyncio.gather(
        loop.run_in_executor(None, _today_count_db),
        worker_control.is_enabled(user_id),
        worker_runtime.get(user_id),
    )

    if enabled:
        state = (rt or {}).get("state") or "running"
        if state == "stopped":
            state = "running"
    else:
        state = "stopped"

    queued = int((rt or {}).get("queued") or 0) if enabled else 0
    next_run_at = (rt or {}).get("next_run_at") if enabled else None
    last_error = (rt or {}).get("last_error") if enabled else None

    return StatusResponse(
        state=state,
        today_count=db_today,
        daily_limit=DAILY_LIMIT,
        queued=queued,
        next_run_at=next_run_at,
        last_error=last_error,
    )
