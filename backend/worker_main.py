"""Standalone worker entrypoint for systemd.

Loads all users with valid hh_credentials, spawns a runner per user, and
hangs around until SIGTERM/SIGINT triggers a graceful shutdown.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from app.db.supabase import service_client
from app.services.plan import filter_accessible
from app.worker.runner import get_registry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("worker_main")


def _load_active_users() -> list[str]:
    res = (
        service_client.table("hh_credentials")
        .select("user_id,invalid_at")
        .is_("invalid_at", None)
        .execute()
    )
    return [r["user_id"] for r in (res.data or []) if r.get("user_id")]


async def main() -> None:
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _request_stop(signame: str) -> None:
        logger.info("received %s — initiating shutdown", signame)
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _request_stop, sig.name)

    registry = get_registry()
    users = await loop.run_in_executor(None, _load_active_users)
    # Plan gating: skip users whose trial expired without an active subscription.
    users = await loop.run_in_executor(None, filter_accessible, users)
    logger.info("spawning runners for %d users", len(users))
    for user_id in users:
        await registry.start(user_id)

    await stop_event.wait()
    logger.info("stopping all runners")
    await registry.stop_all()
    logger.info("worker_main shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
