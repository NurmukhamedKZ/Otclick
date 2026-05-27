"""Persisted worker on/off intent (profiles.worker_enabled).

Dashboard Start/Stop flips the flag; the standalone worker container polls
`enabled_active_user_ids` and starts/stops a runner per user. This decouples
"user wants the worker running" from any single process's in-memory state, so
the worker no longer auto-applies for every connected user at container boot.
"""

from __future__ import annotations

import asyncio

from app.db.supabase import service_client


async def set_enabled(user_id: str, value: bool) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: service_client.table("profiles")
        .update({"worker_enabled": value})
        .eq("id", user_id)
        .execute(),
    )


async def is_enabled(user_id: str) -> bool:
    loop = asyncio.get_running_loop()
    res = await loop.run_in_executor(
        None,
        lambda: service_client.table("profiles")
        .select("worker_enabled")
        .eq("id", user_id)
        .maybe_single()
        .execute(),
    )
    data = res.data if res else None
    return bool(data and data.get("worker_enabled"))


def enabled_active_user_ids() -> list[str]:
    """Sync — user_ids with worker_enabled=true AND valid hh creds.

    Plan gating (filter_accessible) is applied separately by the caller.
    """
    creds = (
        service_client.table("hh_credentials")
        .select("user_id,invalid_at")
        .is_("invalid_at", None)
        .execute()
    )
    active = {r["user_id"] for r in (creds.data or []) if r.get("user_id")}
    if not active:
        return []
    prof = (
        service_client.table("profiles")
        .select("id,worker_enabled")
        .in_("id", list(active))
        .eq("worker_enabled", True)
        .execute()
    )
    return [r["id"] for r in (prof.data or []) if r.get("id")]
