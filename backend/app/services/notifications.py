"""Insert notifications rows. UI picks up via Supabase Realtime (day 14)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from app.db.supabase import service_client

logger = logging.getLogger(__name__)

NotificationType = Literal[
    "apply_success",
    "captcha",
    "worker_stop",
    "limit_reached",
    "token_dead",
    "resume_missing",
]


def _insert_sync(user_id: str, type_: str, payload: dict[str, Any]) -> None:
    try:
        service_client.table("notifications").insert(
            {"user_id": user_id, "type": type_, "payload": payload}
        ).execute()
    except Exception:
        logger.exception("failed to insert notification %s for %s", type_, user_id)


async def notify(
    user_id: str, type_: NotificationType, payload: dict[str, Any] | None = None
) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _insert_sync, user_id, type_, payload or {})
