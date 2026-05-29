"""Per-user daily cap on free manual cover-letter generations (5/day, local TZ).

Pro users (plan.has_access) bypass this entirely — the caller only invokes these
helpers for free users. Cache hits are not counted (handled by the caller).
"""

from __future__ import annotations

import asyncio

from app.db.supabase import service_client
from app.worker.limiter import _today_local, _tz_for_user

FREE_DAILY_GEN_LIMIT = 5


def _read_count(user_id: str, local_date: str) -> int:
    res = (
        service_client.table("cover_letter_gen_counters")
        .select("count")
        .eq("user_id", user_id)
        .eq("date", local_date)
        .maybe_single()
        .execute()
    )
    return ((res.data or {}).get("count") if res else 0) or 0


def _write_count(user_id: str, local_date: str, new_count: int) -> None:
    service_client.table("cover_letter_gen_counters").upsert(
        {"user_id": user_id, "date": local_date, "count": new_count},
        on_conflict="user_id,date",
    ).execute()


def _remaining_sync(user_id: str) -> int:
    tz = _tz_for_user(user_id)
    used = _read_count(user_id, _today_local(tz))
    return max(0, FREE_DAILY_GEN_LIMIT - used)


def _consume_sync(user_id: str) -> int:
    """Bump today's counter; returns new value. Caller checks remaining first."""
    tz = _tz_for_user(user_id)
    local_date = _today_local(tz)
    new_count = _read_count(user_id, local_date) + 1
    _write_count(user_id, local_date, new_count)
    return new_count


async def remaining(user_id: str) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _remaining_sync, user_id)


async def consume(user_id: str) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _consume_sync, user_id)
