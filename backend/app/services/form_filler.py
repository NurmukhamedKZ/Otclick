"""Load full resume content for AI form-filling agent."""

from __future__ import annotations

import asyncio
import logging

from app.db.supabase import service_client
from app.services.hh_credentials import load_api_client, persist_if_refreshed

logger = logging.getLogger(__name__)


async def _get_hh_resume_id(user_id: str, resume_row_id: str | None) -> str:
    """Pick hh_resume_id: explicit row id, else most recent synced resume."""
    loop = asyncio.get_running_loop()

    def _q():
        q = (
            service_client.table("resumes")
            .select("hh_resume_id")
            .eq("user_id", user_id)
        )
        if resume_row_id:
            q = q.eq("id", resume_row_id)
        else:
            q = q.order("synced_at", desc=True).limit(1)
        return q.execute()

    res = await loop.run_in_executor(None, _q)
    rows = res.data or []
    if not rows:
        raise ValueError(f"no resume found for user {user_id}")
    return rows[0]["hh_resume_id"]


async def load_resume(user_id: str, resume_row_id: str | None = None) -> dict:
    """Fetch full resume from hh API. Returns raw resume payload.

    resume_row_id: optional id of row in `resumes` table.
                   If None, picks most recently synced resume.
    """
    hh_resume_id = await _get_hh_resume_id(user_id, resume_row_id)

    client = await load_api_client(user_id)
    original_access = client.access_token
    loop = asyncio.get_running_loop()
    try:
        payload = await loop.run_in_executor(
            None, client.get, f"resumes/{hh_resume_id}"
        )
    finally:
        await persist_if_refreshed(user_id, client, original_access)

    if not isinstance(payload, dict):
        raise RuntimeError(f"unexpected hh resume payload: {type(payload)}")
    return payload
