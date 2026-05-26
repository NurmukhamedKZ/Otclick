"""Plan gating: does a user's plan currently grant worker access?

Access windows by plan:
- ``trial``     — until ``trial_ends`` (set on signup, see migration 007)
- ``active``    — until ``plan_expires_at`` (set by the paid webhook)
- ``cancelled`` — kept until ``plan_expires_at`` (period already paid; billing.cancel
                  only flips local state, real CP stop is manual — see day 19)

Anything else (or a missing/expired window) = no access. Worker start and the
standalone worker_main both gate on this.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.db.supabase import service_client

_SELECT = "plan,trial_ends,plan_expires_at"


def _parse_ts(raw) -> datetime | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        dt = raw
    else:
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def has_access(profile: dict) -> bool:
    """True if this profile's plan grants worker access right now."""
    now = datetime.now(timezone.utc)
    plan = (profile.get("plan") or "trial").strip()

    if plan == "trial":
        ends = _parse_ts(profile.get("trial_ends"))
        return ends is not None and ends > now
    if plan in ("active", "cancelled"):
        exp = _parse_ts(profile.get("plan_expires_at"))
        return exp is not None and exp > now
    return False


async def check_access(user_id: str) -> bool:
    loop = asyncio.get_running_loop()

    def _q():
        return (
            service_client.table("profiles")
            .select(_SELECT)
            .eq("id", user_id)
            .single()
            .execute()
        )

    res = await loop.run_in_executor(None, _q)
    return has_access(res.data or {})


def filter_accessible(user_ids: list[str]) -> list[str]:
    """Sync — keep only user_ids whose plan grants access (for worker_main)."""
    if not user_ids:
        return []
    res = (
        service_client.table("profiles")
        .select(f"id,{_SELECT}")
        .in_("id", user_ids)
        .execute()
    )
    by_id = {r["id"]: r for r in (res.data or [])}
    return [uid for uid in user_ids if has_access(by_id.get(uid, {}))]
