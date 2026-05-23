"""Sync user's hh resumes → Supabase `resumes` table."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.db.supabase import service_client
from app.services.hh_credentials import load_api_client, persist_if_refreshed

logger = logging.getLogger(__name__)


def _extract_status(item: dict) -> str | None:
    s = item.get("status")
    if isinstance(s, dict):
        return s.get("id") or s.get("name")
    if isinstance(s, str):
        return s
    return None


def _upsert_resumes(user_id: str, items: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "user_id": user_id,
            "hh_resume_id": str(item["id"]),
            "title": item.get("title"),
            "status": _extract_status(item),
            "synced_at": now,
        }
        for item in items
        if item.get("id")
    ]
    if not rows:
        return []
    res = (
        service_client.table("resumes")
        .upsert(rows, on_conflict="user_id,hh_resume_id")
        .execute()
    )
    return res.data or []


async def sync_resumes(user_id: str) -> list[dict]:
    """Pull /resumes/mine → upsert rows. Returns stored rows."""
    client = await load_api_client(user_id)
    original_access = client.access_token
    loop = asyncio.get_running_loop()
    try:
        payload = await loop.run_in_executor(None, client.get, "resumes/mine")
    finally:
        await persist_if_refreshed(user_id, client, original_access)
    items = payload.get("items", []) if isinstance(payload, dict) else []
    return await loop.run_in_executor(None, _upsert_resumes, user_id, items)


async def list_resumes(user_id: str) -> list[dict]:
    loop = asyncio.get_running_loop()
    def _q():
        return (
            service_client.table("resumes")
            .select("id,hh_resume_id,title,status,synced_at")
            .eq("user_id", user_id)
            .order("synced_at", desc=True)
            .execute()
        )
    res = await loop.run_in_executor(None, _q)
    return res.data or []
