"""Per-user auto-apply runner.

Loop: ensure queue has jobs (via producer) → check limits → throttle sleep →
apply_one → record. Captcha pauses indefinitely until external resume.
Retry: 1 on transient network/5xx, 0 on 4xx.
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Literal

import requests as _requests

from app.hh import errors as hh_errors
from app.services import apply as apply_service
from app.services import captcha as captcha_service
from app.services.hh_credentials import (
    load_api_client,
    mark_invalid,
    persist_if_refreshed,
)
from app.services.notifications import notify
from app.worker import limiter, throttle
from app.worker.queue import ApplyJob, drop_user_queue, get_user_queue

logger = logging.getLogger(__name__)

State = Literal["runningы", "paused_captcha", "paused_limit", "stopped"]

# Hour-limit cooldown when limiter says limit_hour.
HOUR_COOLDOWN_S = 60 * 60 + 30

# Sleep when producer found 0 jobs and we're idle.
IDLE_REFILL_SLEEP_S = 10

# Plan-B captcha poll interval (seconds) — re-probe GET /me while paused.
CAPTCHA_POLL_S = 5


@dataclass
class RunnerHandle:
    user_id: str
    state: State = "running"
    today_count: int = 0
    next_run_at: datetime | None = None
    task: asyncio.Task | None = None
    captcha_event: asyncio.Event = field(default_factory=asyncio.Event)
    cluster: throttle.SessionCluster = field(default_factory=throttle.SessionCluster)
    last_error: str | None = None
    skipped_has_test: int = 0


def _is_transient(ex: BaseException) -> bool:
    if isinstance(ex, hh_errors.InternalServerError):  # also catches BadGateway
        return True
    if isinstance(ex, (_requests.ConnectionError, _requests.Timeout)):
        return True
    return False


async def _maybe_apply_with_retry(job: ApplyJob) -> apply_service.ApplyStatus:
    try:
        return await apply_service.apply_one(
            job.user_id, job.resume_id, job.vacancy_id
        )
    except Exception as ex:
        if not _is_transient(ex):
            logger.exception("apply_one fatal for %s/%s", job.user_id, job.vacancy_id)
            return "failed"
        logger.warning(
            "apply_one transient (%s) for %s/%s — retry once",
            type(ex).__name__,
            job.user_id,
            job.vacancy_id,
        )
    try:
        return await apply_service.apply_one(
            job.user_id, job.resume_id, job.vacancy_id
        )
    except Exception:
        logger.exception(
            "apply_one retry failed for %s/%s", job.user_id, job.vacancy_id
        )
        return "failed"


async def _probe_me(user_id: str) -> str:
    """Probe GET /me to detect whether the hh captcha lifted.

    Returns 'ok' (clear), 'captcha' (still blocked / transient — keep polling),
    'token_dead' (creds unusable — stop), or 'banned' (account blocked — stop).
    """
    loop = asyncio.get_running_loop()
    try:
        client = await load_api_client(user_id)
    except Exception:
        logger.warning(
            "probe_me: cannot load creds for %s — token_dead", user_id, exc_info=True
        )
        return "token_dead"
    original = client.access_token
    try:
        await loop.run_in_executor(None, lambda: client.get("me"))
        return "ok"
    except hh_errors.CaptchaRequired:
        return "captcha"
    except hh_errors.Forbidden as ex:
        if apply_service.is_ban_error(ex):
            await mark_invalid(user_id, f"account banned (/me probe): {ex}")
            return "banned"
        await mark_invalid(user_id, f"Forbidden on /me probe: {ex}")
        return "token_dead"
    except Exception:
        logger.warning(
            "probe_me: transient error for %s — keep polling", user_id, exc_info=True
        )
        return "captcha"
    finally:
        await persist_if_refreshed(user_id, client, original)


def _seconds_until_next_local_midnight(user_id: str) -> float:
    tz = limiter._tz_for_user(user_id)  # ok — both worker module
    now = datetime.now(tz)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=10, microsecond=0)
    return max(60.0, (tomorrow - now).total_seconds())


async def _run_loop(handle: RunnerHandle) -> None:
    from app.services.vacancy_producer import produce_jobs  # local import: avoid cycle

    user_id = handle.user_id
    queue = get_user_queue(user_id)
    rng = random.Random()
    logger.info("runner: user=%s loop START", user_id)

    while True:
        logger.debug(
            "runner: user=%s tick state=%s queue=%d today=%d",
            user_id, handle.state, queue.qsize(), handle.today_count,
        )
        # Captcha pause — wait until external resume sets event.
        if handle.state == "paused_captcha":
            handle.next_run_at = None
            while handle.state == "paused_captcha":
                try:
                    await asyncio.wait_for(
                        handle.captcha_event.wait(), timeout=CAPTCHA_POLL_S
                    )
                except asyncio.TimeoutError:
                    pass
                handle.captcha_event.clear()
                if handle.state != "paused_captcha":
                    break
                result = await _probe_me(user_id)
                if result == "ok":
                    await captcha_service.mark_solved(user_id)
                    await notify(user_id, "captcha", {"resolved": True})
                    handle.state = "running"
                    logger.info("user %s: captcha cleared — resuming", user_id)
                elif result == "token_dead":
                    handle.state = "stopped"
                    handle.last_error = "hh token dead — reconnect required"
                    await notify(user_id, "token_dead", {})
                    await notify(user_id, "worker_stop", {"reason": "token_dead"})
                    logger.error(
                        "user %s: token dead during captcha probe — stopping", user_id
                    )
                    return
                elif result == "banned":
                    handle.state = "stopped"
                    handle.last_error = "hh account banned"
                    await notify(user_id, "account_banned", {})
                    await notify(user_id, "worker_stop", {"reason": "account_banned"})
                    logger.error(
                        "user %s: account banned during captcha probe — stopping", user_id
                    )
                    return
                # "captcha" → keep polling
            if handle.state == "stopped":
                return

        # Limits.
        check = await limiter.check(user_id)
        if check == "limit_day":
            handle.state = "paused_limit"
            sleep_s = await asyncio.get_running_loop().run_in_executor(
                None, _seconds_until_next_local_midnight, user_id
            )
            handle.next_run_at = datetime.now(timezone.utc) + timedelta(seconds=sleep_s)
            await notify(
                user_id, "limit_reached", {"source": "local_day", "sleep_s": int(sleep_s)}
            )
            logger.info("user %s: daily limit, sleeping %.0fs", user_id, sleep_s)
            await asyncio.sleep(sleep_s)
            handle.state = "running"
            continue
        if check == "limit_hour":
            handle.state = "paused_limit"
            handle.next_run_at = datetime.now(timezone.utc) + timedelta(seconds=HOUR_COOLDOWN_S)
            logger.info("user %s: hourly limit, sleeping %ds", user_id, HOUR_COOLDOWN_S)
            await asyncio.sleep(HOUR_COOLDOWN_S)
            handle.state = "running"
            continue

        # Refill queue when empty.
        if queue.empty():
            try:
                pushed, skipped_has_test = await produce_jobs(user_id)
            except Exception:
                logger.exception("producer failed for %s", user_id)
                pushed, skipped_has_test = 0, 0
            handle.skipped_has_test += skipped_has_test
            if pushed == 0:
                handle.next_run_at = datetime.now(timezone.utc) + timedelta(
                    seconds=IDLE_REFILL_SLEEP_S
                )
                logger.info(
                    "user %s: no new vacancies, sleeping %ds",
                    user_id,
                    IDLE_REFILL_SLEEP_S,
                )
                await asyncio.sleep(IDLE_REFILL_SLEEP_S)
                continue

        # Session cluster break.
        if handle.cluster.should_break():
            break_s = handle.cluster.next_break_seconds()
            handle.next_run_at = datetime.now(timezone.utc) + timedelta(seconds=break_s)
            logger.info("user %s: cluster break %.0fs", user_id, break_s)
            await asyncio.sleep(break_s)

        # Pull next job.
        try:
            job = await asyncio.wait_for(queue.get(), timeout=30.0)
        except asyncio.TimeoutError:
            logger.debug("runner: user=%s queue.get() timeout — re-loop", user_id)
            continue

        # Throttle pre-apply.
        delay = throttle.next_delay(rng)
        handle.next_run_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
        logger.info(
            "runner: user=%s applying vacancy=%s (resume=%s) after %.1fs delay",
            user_id, job.vacancy_id, job.resume_id, delay,
        )
        await asyncio.sleep(delay)

        status = await _maybe_apply_with_retry(job)
        logger.info(
            "runner: user=%s vacancy=%s status=%s", user_id, job.vacancy_id, status
        )

        if status in ("sent", "form_sent"):
            handle.today_count = await limiter.increment(user_id)
            handle.cluster.record_apply()
            await notify(
                user_id,
                "apply_success",
                {
                    "vacancy_id": job.vacancy_id,
                    "today_count": handle.today_count,
                    "via": "form" if status == "form_sent" else "auto",
                },
            )
        elif status == "captcha":
            handle.state = "paused_captcha"
            handle.captcha_event.clear()
            handle.last_error = f"captcha on vacancy {job.vacancy_id}"
            logger.warning("user %s: captcha — pausing", user_id)
            await notify(user_id, "captcha", {"vacancy_id": job.vacancy_id})
        elif status == "limit_day":
            # hh told us we're done for the day — bump local to cap, then pause.
            handle.state = "paused_limit"
            sleep_s = await asyncio.get_running_loop().run_in_executor(
                None, _seconds_until_next_local_midnight, user_id
            )
            handle.next_run_at = datetime.now(timezone.utc) + timedelta(seconds=sleep_s)
            await notify(
                user_id, "limit_reached", {"source": "hh", "sleep_s": int(sleep_s)}
            )
            logger.info(
                "user %s: hh LimitExceeded, sleeping %.0fs", user_id, sleep_s
            )
            await asyncio.sleep(sleep_s)
            handle.state = "running"
        elif status == "token_dead":
            handle.state = "stopped"
            handle.last_error = "hh token dead — reconnect required"
            await notify(user_id, "token_dead", {"vacancy_id": job.vacancy_id})
            await notify(user_id, "worker_stop", {"reason": "token_dead"})
            logger.error("user %s: token dead — stopping runner", user_id)
            return
        elif status == "account_banned":
            handle.state = "stopped"
            handle.last_error = "hh account banned"
            await notify(user_id, "account_banned", {"vacancy_id": job.vacancy_id})
            await notify(user_id, "worker_stop", {"reason": "account_banned"})
            logger.error("user %s: account banned — stopping runner", user_id)
            return
        elif status == "form_required":
            handle.skipped_has_test += 1
        elif status == "vacancy_gone":
            pass
        elif status == "resume_missing":
            handle.last_error = f"resume {job.resume_id} missing"
            await notify(
                user_id,
                "resume_missing",
                {"resume_id": job.resume_id, "vacancy_id": job.vacancy_id},
            )
        elif status == "failed":
            handle.last_error = f"failed on vacancy {job.vacancy_id}"


class WorkerRegistry:
    def __init__(self) -> None:
        self._handles: dict[str, RunnerHandle] = {}
        self._lock = asyncio.Lock()

    async def start(self, user_id: str) -> RunnerHandle:
        async with self._lock:
            existing = self._handles.get(user_id)
            if existing and existing.task and not existing.task.done():
                logger.info("registry: user=%s already running — returning existing", user_id)
                return existing
            logger.info("registry: spawning runner for user=%s", user_id)
            handle = RunnerHandle(user_id=user_id)
            handle.task = asyncio.create_task(
                _run_loop(handle), name=f"worker:{user_id}"
            )

            def _on_done(t: asyncio.Task, uid: str = user_id) -> None:
                if t.cancelled():
                    logger.info("runner: user=%s task cancelled", uid)
                    return
                exc = t.exception()
                if exc is not None:
                    logger.error("runner: user=%s task crashed: %r", uid, exc, exc_info=exc)
                else:
                    logger.info("runner: user=%s task ended cleanly", uid)

            handle.task.add_done_callback(_on_done)
            self._handles[user_id] = handle
            return handle

    async def stop(self, user_id: str) -> bool:
        async with self._lock:
            handle = self._handles.pop(user_id, None)
        if not handle or not handle.task:
            drop_user_queue(user_id)
            return False
        handle.state = "stopped"
        handle.task.cancel()
        try:
            await handle.task
        except (asyncio.CancelledError, Exception):
            pass
        drop_user_queue(user_id)
        return True

    def get(self, user_id: str) -> RunnerHandle | None:
        handle = self._handles.get(user_id)
        if handle and handle.task and handle.task.done():
            handle.state = "stopped"
        return handle

    def resume_captcha(self, user_id: str) -> bool:
        handle = self._handles.get(user_id)
        if not handle or handle.state != "paused_captcha":
            return False
        handle.captcha_event.set()
        return True

    async def stop_all(self) -> None:
        for user_id in list(self._handles.keys()):
            await self.stop(user_id)


_registry: WorkerRegistry | None = None


def get_registry() -> WorkerRegistry:
    global _registry
    if _registry is None:
        _registry = WorkerRegistry()
    return _registry


def reset_registry() -> None:
    """Test hook."""
    global _registry
    _registry = None
