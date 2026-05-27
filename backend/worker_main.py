"""Standalone worker entrypoint for systemd / docker.

Polls profiles.worker_enabled every POLL_INTERVAL_S and reconciles runners:
start one for each enabled user with valid creds + plan, stop runners whose
user disabled the worker (or whose plan/creds lapsed). No auto-start at boot —
a user only gets a runner after pressing Start in the dashboard.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from app.services.plan import filter_accessible
from app.services.worker_control import enabled_active_user_ids
from app.worker.runner import get_registry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("worker_main")

POLL_INTERVAL_S = 15


async def _reconcile(registry) -> None:
    loop = asyncio.get_running_loop()
    users = await loop.run_in_executor(None, enabled_active_user_ids)
    users = await loop.run_in_executor(None, filter_accessible, users)
    desired = set(users)
    running = set(registry.running_user_ids())

    for user_id in desired - running:
        logger.info("reconcile: starting runner for user=%s", user_id)
        await registry.start(user_id)
    for user_id in running - desired:
        logger.info("reconcile: stopping runner for user=%s", user_id)
        await registry.stop(user_id)


async def main() -> None:
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _request_stop(signame: str) -> None:
        logger.info("received %s — initiating shutdown", signame)
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _request_stop, sig.name)

    registry = get_registry()
    logger.info("worker_main: reconcile loop start (every %ds)", POLL_INTERVAL_S)
    while not stop_event.is_set():
        try:
            await _reconcile(registry)
        except Exception:
            logger.exception("reconcile failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=POLL_INTERVAL_S)
        except asyncio.TimeoutError:
            pass

    logger.info("stopping all runners")
    await registry.stop_all()
    logger.info("worker_main shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
