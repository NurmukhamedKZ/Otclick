"""Captcha handoff endpoints (plan B).

The worker operates one captcha at a time per user; `{request_id}` is accepted for
REST shape but the service operates per-user.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.services import captcha as captcha_service
from app.worker.runner import get_registry

router = APIRouter(prefix="/api/captcha", tags=["captcha"])


class RecheckResponse(BaseModel):
    rechecking: bool


class DismissResponse(BaseModel):
    stopped: bool


@router.get("/pending")
async def pending(user_id: str = Depends(get_current_user)) -> list[dict]:
    return await captcha_service.get_pending(user_id)


@router.post("/{request_id}/solve", response_model=RecheckResponse)
async def solve(
    request_id: str, user_id: str = Depends(get_current_user)
) -> RecheckResponse:
    rechecking = get_registry().resume_captcha(user_id)
    return RecheckResponse(rechecking=rechecking)


@router.post("/{request_id}/dismiss", response_model=DismissResponse)
async def dismiss(
    request_id: str, user_id: str = Depends(get_current_user)
) -> DismissResponse:
    await captcha_service.mark_solved(user_id)
    stopped = await get_registry().stop(user_id)
    return DismissResponse(stopped=stopped)
