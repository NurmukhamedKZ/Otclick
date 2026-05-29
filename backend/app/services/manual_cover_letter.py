"""On-demand cover-letter generation for the in-app manual generator.

Free users: capped at gen_limiter.FREE_DAILY_GEN_LIMIT/day; cache hits are free
and uncounted. Pro users (plan.has_access): unlimited, never counted.

Reuses the worker's HHAgent.write_cover_letter (PG cache → LLM → fallback). No
worker is started — this is the synchronous "preview" path.
"""

from __future__ import annotations

import asyncio

from fastapi import HTTPException, status

from app.ai.agent import HHAgent
from app.db.supabase import service_client
from app.services import gen_limiter, plan
from app.services.cover_letter import _cache_get
from app.services.hh_credentials import load_api_client, persist_if_refreshed


def _resume_row(user_id: str, resume_id: str) -> dict | None:
    res = (
        service_client.table("resumes")
        .select("id,title")
        .eq("user_id", user_id)
        .eq("id", resume_id)
        .maybe_single()
        .execute()
    )
    return res.data if res else None


async def _fetch_vacancy(user_id: str, vacancy_id: str) -> dict:
    client = await load_api_client(user_id)
    original_access = client.access_token
    loop = asyncio.get_running_loop()
    try:
        payload = await loop.run_in_executor(
            None, client.get, f"vacancies/{vacancy_id}"
        )
    finally:
        await persist_if_refreshed(user_id, client, original_access)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="unexpected hh vacancy payload")
    return payload


async def generate_for_vacancy(
    user_id: str, vacancy_id: str, resume_id: str
) -> dict:
    """Generate (or return cached) cover letter. See module docstring for rules."""
    loop = asyncio.get_running_loop()
    resume = await loop.run_in_executor(None, _resume_row, user_id, resume_id)
    if not resume:
        raise HTTPException(status_code=400, detail="resume_id not found for this user")

    is_pro = await plan.check_access(user_id)

    # Cache hit → free, no counter consumed (no inference cost).
    cached = await loop.run_in_executor(None, _cache_get, vacancy_id, resume_id)
    if cached:
        rem = None if is_pro else await gen_limiter.remaining(user_id)
        return {"text": cached, "cached": True, "remaining": rem}

    if not is_pro and await gen_limiter.remaining(user_id) <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="free_limit_reached: daily cover-letter limit reached, upgrade to Pro",
        )

    vacancy = await _fetch_vacancy(user_id, vacancy_id)
    agent = HHAgent(user_id)
    text = await agent.write_cover_letter(user_id, vacancy, resume, resume_id)

    rem = None
    if not is_pro:
        await gen_limiter.consume(user_id)
        rem = await gen_limiter.remaining(user_id)
    return {"text": text, "cached": False, "remaining": rem}
