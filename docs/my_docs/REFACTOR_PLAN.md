# Variant A Migration — Queue + Stateless Workers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-process in-memory `WorkerRegistry` + per-user infinite `_run_loop` with an Arq job queue: a scheduler enqueues bounded `apply_tick(user_id)` jobs, a horizontally-scalable pool of stateless workers consumes them, and a Redis per-user lock guarantees single-owner execution. State stays 100% in Postgres (already true).

**Architecture:**
- **API** (FastAPI, unchanged) flips `profiles.worker_enabled`, serves reads from `worker_runtime`.
- **Scheduler** (one Arq cron job) every `TICK_INTERVAL_S` enqueues `apply_tick(user_id)` per enabled + plan-valid user, deduped by `_job_id`.
- **Workers** (N Arq replicas, stateless) consume `apply_tick`. Each tick = acquire Redis lock → one bounded batch (`produce_jobs` → drain up to `TICK_BATCH` applies with throttle → recruiter poll) → heartbeat → release lock → exit.
- **Redis** = Arq broker + per-user lock. **Postgres (Supabase)** = sole source of truth.

**Tech Stack:** Python 3.13, FastAPI (unchanged), **Arq** (async Redis task queue), **redis-py** (lock), Supabase Postgres, existing services (`vacancy_producer`, `apply`, `limiter`, `throttle`, `recruiter_poll`, `captcha`, `worker_runtime`) reused as-is.

**What stays:** `ApplyJob` + `get_user_queue`/`drop_user_queue` (queue is now tick-local), `produce_jobs`, `apply_one`, `limiter`, `throttle.next_delay`, `recruiter_poll`, `captcha_service`, `worker_runtime.heartbeat`, the API + captcha endpoints (they already only flip flags / clear rows / rely on re-probe — zero change).

**What dies:** `WorkerRegistry`, `RunnerHandle`, `_run_loop` (infinite), `_probe_me`'s in-loop captcha pause, `SessionCluster` cross-tick breaks, the `worker_main.py` reconcile loop.

**Key behavior changes (decide before coding — see Task 0):**
- **Captcha:** no in-process pause. Tick that hits captcha records request + exits; subsequent ticks probe `GET /me` and skip the user until clear. (Existing captcha API already assumes this.)
- **SessionCluster breaks:** dropped (RAM-bound, meaningless across stateless ticks). Anti-bot spacing now comes from per-apply `throttle.next_delay` + scheduler interval jitter. Flagged risk below.
- **Recruiter agent memory:** langchain in-RAM per-chat memory is lost between ticks. The cursor (`last_handled_id`) still prevents double-replies. Decide: rebuild thread context per tick vs. accept single-turn answers (Task 8).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `backend/app/config.py` | add `REDIS_URL`, `TICK_INTERVAL_S`, `TICK_BATCH`, `USER_LOCK_TTL_S` | Modify |
| `backend/app/worker/lock.py` | Redis per-user lock (acquire NX EX / release via Lua) | Create |
| `backend/app/worker/tick.py` | `apply_tick(ctx, user_id)` — one bounded batch | Create |
| `backend/app/worker/scheduler.py` | `enqueue_ticks(ctx)` — cron fan-out to accessible users | Create |
| `backend/app/worker/settings.py` | Arq `WorkerSettings` (functions, cron, redis) | Create |
| `backend/app/worker/runner.py` | delete `WorkerRegistry`/`RunnerHandle`/`_run_loop`; keep reusable helpers (`_maybe_apply_with_retry`, `_probe_me`, `_is_transient`) moved into `tick.py` | Modify/shrink |
| `backend/worker_main.py` | thin shim → run Arq worker (or delete in favor of `arq` CLI) | Modify |
| `backend/pyproject.toml` (root `pyproject.toml`) | add `arq`, `redis` deps | Modify |
| `backend/tests/test_user_lock.py` | lock acquire/release/contention | Create |
| `backend/tests/test_apply_tick.py` | bounded batch, captcha exit, limit exit | Create |
| `backend/tests/test_scheduler.py` | fan-out only to accessible, dedup `_job_id` | Create |

---

## Task 0: Lock the three behavior decisions

**No code.** Confirm with the owner before building, because they change task scope:

- [ ] **Captcha model:** confirm "exit + re-probe on next tick" (vs. holding a worker). Plan assumes exit. The existing `/api/captcha/{id}/solve` already just clears the row and relies on re-probe → this is consistent.
- [ ] **SessionCluster:** confirm dropping cross-tick human-break simulation. If anti-bot needs it, it must be persisted (Postgres `worker_runtime` extra column) — adds a task. Plan assumes drop.
- [ ] **Recruiter memory:** confirm acceptable to rebuild context per tick from the hh thread (Task 8) vs. accept single-turn. Plan assumes rebuild-from-thread.

---

## Task 1: Add dependencies

**Files:**
- Modify: `pyproject.toml` (root — deps managed by `uv` per CLAUDE.md)

- [ ] **Step 1: Add deps**

In `[project].dependencies` add:

```toml
    "arq>=0.26",
    "redis>=5.0",
```

- [ ] **Step 2: Sync**

Run: `uv sync`
Expected: `arq` and `redis` resolved into `uv.lock`, no conflicts.

- [ ] **Step 3: Verify import**

Run: `uv run python -c "import arq, redis; print(arq.__version__)"`
Expected: prints a version, no `ModuleNotFoundError`.

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "build: add arq + redis for queue-based worker"
```

---

## Task 2: Config — Redis URL + tick knobs

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add settings**

In the `Settings` class (alongside existing fields), add:

```python
    REDIS_URL: str = "redis://localhost:6379/0"
    TICK_INTERVAL_S: int = 15          # scheduler fan-out cadence
    TICK_BATCH: int = 8                # max applies per tick before yielding
    USER_LOCK_TTL_S: int = 90          # redis per-user lock TTL (> worst-case tick)
```

- [ ] **Step 2: Verify load**

Run: `cd backend && uv run python -c "from app.config import settings; print(settings.REDIS_URL, settings.TICK_BATCH)"`
Expected: `redis://localhost:6379/0 8`

- [ ] **Step 3: Document env**

In `CLAUDE.md` "Required `.env`" section, append under config:

```
REDIS_URL=redis://localhost:6379/0   # Arq broker + per-user lock
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py CLAUDE.md
git commit -m "feat: add REDIS_URL + tick config"
```

---

## Task 3: Redis per-user lock

Guarantees no two workers run the same user concurrently — replaces the implicit single-owner guarantee `WorkerRegistry` gave for free.

**Files:**
- Create: `backend/app/worker/lock.py`
- Test: `backend/tests/test_user_lock.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_user_lock.py
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "x")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "x")
os.environ.setdefault("FERNET_KEY", "x" * 44)

import pytest
from unittest.mock import AsyncMock

from app.worker import lock


@pytest.mark.asyncio
async def test_acquire_then_contended():
    redis = AsyncMock()
    # first acquire succeeds (SET NX returns True), second fails (None)
    redis.set.side_effect = [True, None]
    got1 = await lock.acquire(redis, "user-1", token="t1", ttl_s=90)
    got2 = await lock.acquire(redis, "user-1", token="t2", ttl_s=90)
    assert got1 is True
    assert got2 is False
    assert redis.set.await_args_list[0].kwargs == {"nx": True, "ex": 90}


@pytest.mark.asyncio
async def test_release_only_own_token():
    redis = AsyncMock()
    redis.eval.return_value = 1
    released = await lock.release(redis, "user-1", token="t1")
    assert released is True
    # Lua compare-and-del invoked with our key + token
    args = redis.eval.await_args
    assert args.args[2] == "t1"  # ARGV[1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run python -m pytest tests/test_user_lock.py -v`
Expected: FAIL — `ModuleNotFoundError: app.worker.lock`.

- [ ] **Step 3: Implement**

```python
# backend/app/worker/lock.py
"""Redis per-user lock — one runner per user across the worker pool.

SET key token NX EX ttl  → atomic acquire.
Release = compare-and-delete via Lua so a worker only frees its own lock
(prevents releasing a lock a slower worker re-acquired after our TTL lapsed).
"""

from __future__ import annotations

from redis.asyncio import Redis

_KEY = "worker:lock:{user_id}"

_RELEASE_LUA = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


async def acquire(redis: Redis, user_id: str, *, token: str, ttl_s: int) -> bool:
    ok = await redis.set(_KEY.format(user_id=user_id), token, nx=True, ex=ttl_s)
    return bool(ok)


async def release(redis: Redis, user_id: str, *, token: str) -> bool:
    res = await redis.eval(_RELEASE_LUA, 1, _KEY.format(user_id=user_id), token)
    return bool(res)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run python -m pytest tests/test_user_lock.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/worker/lock.py backend/tests/test_user_lock.py
git commit -m "feat: redis per-user worker lock"
```

---

## Task 4: Move reusable apply helpers out of runner.py

`_is_transient`, `_maybe_apply_with_retry`, `_probe_me` are pure and reused by the tick. Move them into `tick.py` (created next task) — but first extract them cleanly so deleting `WorkerRegistry` later is a clean removal.

**Files:**
- Modify: `backend/app/worker/runner.py:62-130` (the three helpers)

- [ ] **Step 1: Confirm callers**

Run: `cd backend && grep -rn "_probe_me\|_maybe_apply_with_retry\|_is_transient" app/ tests/`
Expected: only references inside `runner.py`. (If tests reference them, note for Task 9.)

- [ ] **Step 2: No edit yet — these move verbatim into `tick.py` in Task 5.**

Mark this task done once callers are confirmed internal. No commit (bookkeeping only).

---

## Task 5: The bounded tick

Converts the infinite `_run_loop` into one bounded batch. This is the core of the migration.

**Files:**
- Create: `backend/app/worker/tick.py`
- Test: `backend/tests/test_apply_tick.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_apply_tick.py
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "x")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "x")
os.environ.setdefault("FERNET_KEY", "x" * 44)

import pytest
from unittest.mock import AsyncMock, patch

from app.worker import tick
from app.worker.queue import ApplyJob, get_user_queue, reset_queues


@pytest.fixture(autouse=True)
def _clean():
    reset_queues()
    yield
    reset_queues()


@pytest.mark.asyncio
async def test_tick_skips_when_lock_held():
    redis = AsyncMock()
    with patch("app.worker.lock.acquire", AsyncMock(return_value=False)) as acq:
        result = await tick.run_tick(redis, "user-1")
    assert result == "locked"
    acq.assert_awaited_once()


@pytest.mark.asyncio
async def test_tick_exits_on_daily_limit():
    redis = AsyncMock()
    with patch("app.worker.lock.acquire", AsyncMock(return_value=True)), \
         patch("app.worker.lock.release", AsyncMock(return_value=True)) as rel, \
         patch("app.worker.limiter.check", AsyncMock(return_value="limit_day")), \
         patch("app.worker.tick.heartbeat", AsyncMock()), \
         patch("app.worker.tick._probe_me", AsyncMock(return_value="ok")), \
         patch("app.services.captcha.get_pending", AsyncMock(return_value=[])):
        result = await tick.run_tick(redis, "user-1")
    assert result == "limit_day"
    rel.assert_awaited_once()  # lock always released


@pytest.mark.asyncio
async def test_tick_applies_bounded_batch():
    redis = AsyncMock()

    async def _fake_produce(uid, agent):
        q = get_user_queue(uid)
        for v in ("v1", "v2", "v3"):
            q.put_nowait(ApplyJob(user_id=uid, resume_id="r1", vacancy_id=v))
        return 3, 0

    with patch("app.worker.lock.acquire", AsyncMock(return_value=True)), \
         patch("app.worker.lock.release", AsyncMock(return_value=True)), \
         patch("app.worker.limiter.check", AsyncMock(return_value="ok")), \
         patch("app.worker.limiter.increment", AsyncMock(return_value=1)), \
         patch("app.worker.tick.heartbeat", AsyncMock()), \
         patch("app.worker.tick._probe_me", AsyncMock(return_value="ok")), \
         patch("app.services.captcha.get_pending", AsyncMock(return_value=[])), \
         patch("app.worker.tick.poll_recruiter_chats", AsyncMock()), \
         patch("app.worker.tick.produce_jobs", _fake_produce), \
         patch("app.worker.tick.throttle.next_delay", lambda rng: 0.0), \
         patch("app.worker.tick._maybe_apply_with_retry",
               AsyncMock(return_value="sent")) as ap, \
         patch("app.config.settings") as st:
        st.TICK_BATCH = 2
        result = await tick.run_tick(redis, "user-1")

    assert result == "done"
    assert ap.await_count == 2  # bounded by TICK_BATCH, not the 3 queued
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run python -m pytest tests/test_apply_tick.py -v`
Expected: FAIL — `ModuleNotFoundError: app.worker.tick`.

- [ ] **Step 3: Implement the tick**

```python
# backend/app/worker/tick.py
"""Bounded per-user apply tick — the unit of work an Arq worker runs.

One tick = acquire user lock → (captcha gate) → (limit gate) → refill via
producer → drain up to TICK_BATCH applies with throttle → recruiter poll →
heartbeat → release lock → exit. No infinite loop, no in-RAM state across
ticks. The scheduler re-enqueues per user every TICK_INTERVAL_S.
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import requests as _requests
from redis.asyncio import Redis

from app.ai.agent import HHAgent
from app.config import settings
from app.hh import errors as hh_errors
from app.services import apply as apply_service
from app.services import captcha as captcha_service
from app.services.hh_credentials import (
    load_api_client,
    mark_invalid,
    persist_if_refreshed,
)
from app.services.notifications import notify
from app.services.vacancy_producer import produce_jobs
from app.services.worker_runtime import heartbeat
from app.worker import limiter, lock, throttle
from app.worker.queue import ApplyJob, drop_user_queue, get_user_queue
from app.worker.recruiter_poll import poll_recruiter_chats

logger = logging.getLogger(__name__)

TickResult = Literal[
    "locked", "captcha", "limit_day", "limit_hour", "token_dead",
    "banned", "idle", "done",
]


def _is_transient(ex: BaseException) -> bool:
    if isinstance(ex, hh_errors.InternalServerError):  # also catches BadGateway
        return True
    if isinstance(ex, (_requests.ConnectionError, _requests.Timeout)):
        return True
    return False


async def _maybe_apply_with_retry(
    job: ApplyJob, agent: HHAgent
) -> apply_service.ApplyStatus:
    try:
        return await apply_service.apply_one(
            job.user_id, job.resume_id, job.vacancy_id, agent
        )
    except Exception as ex:
        if not _is_transient(ex):
            logger.exception("apply_one fatal for %s/%s", job.user_id, job.vacancy_id)
            return "failed"
        logger.warning(
            "apply_one transient (%s) for %s/%s — retry once",
            type(ex).__name__, job.user_id, job.vacancy_id,
        )
    try:
        return await apply_service.apply_one(
            job.user_id, job.resume_id, job.vacancy_id, agent
        )
    except Exception:
        logger.exception("apply_one retry failed for %s/%s", job.user_id, job.vacancy_id)
        return "failed"


async def _probe_me(user_id: str) -> str:
    """GET /me → 'ok' | 'captcha' | 'token_dead' | 'banned'."""
    loop = asyncio.get_running_loop()
    try:
        client = await load_api_client(user_id)
    except Exception:
        logger.warning("probe_me: cannot load creds for %s", user_id, exc_info=True)
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
        logger.warning("probe_me: transient for %s — treat as captcha", user_id, exc_info=True)
        return "captcha"
    finally:
        await persist_if_refreshed(user_id, client, original)


async def _hb(user_id: str, state: str, queued: int, today: int,
              next_run_at: datetime | None, last_error) -> None:
    await heartbeat(
        user_id, state=state, queued=queued, today_count=today,
        next_run_at=next_run_at, last_error=last_error,
    )


async def run_tick(redis: Redis, user_id: str) -> TickResult:
    token = uuid.uuid4().hex
    if not await lock.acquire(
        redis, user_id, token=token, ttl_s=settings.USER_LOCK_TTL_S
    ):
        logger.debug("tick: user=%s lock held — skip", user_id)
        return "locked"

    next_run_at = datetime.now(timezone.utc) + timedelta(seconds=settings.TICK_INTERVAL_S)
    try:
        # --- Captcha gate: if a request is pending, probe and skip until clear.
        pending = await captcha_service.get_pending(user_id)
        if pending:
            probe = await _probe_me(user_id)
            if probe == "ok":
                await captcha_service.mark_solved(user_id)
                await notify(user_id, "captcha", {"resolved": True})
            elif probe == "token_dead":
                await _stop_user(user_id, "token_dead")
                return "token_dead"
            elif probe == "banned":
                await _stop_user(user_id, "account_banned")
                return "banned"
            else:  # still captcha
                await _hb(user_id, "paused_captcha", 0, await _today(user_id), None,
                          "captcha pending")
                return "captcha"

        # --- Limit gate.
        check = await limiter.check(user_id)
        if check == "limit_day":
            await _hb(user_id, "paused_limit", 0, await _today(user_id),
                      next_run_at, "daily limit")
            return "limit_day"
        if check == "limit_hour":
            await _hb(user_id, "paused_limit", 0, await _today(user_id),
                      next_run_at, "hourly limit")
            return "limit_hour"

        agent = HHAgent(user_id)

        # --- Refill queue (tick-local lifetime).
        queue = get_user_queue(user_id)
        try:
            pushed, _skipped = await produce_jobs(user_id, agent)
        except Exception:
            logger.exception("producer failed for %s", user_id)
            pushed = 0

        # --- Recruiter chats (best-effort, never crash the tick).
        try:
            await poll_recruiter_chats(user_id, agent)
        except Exception:
            logger.exception("recruiter poll failed for %s", user_id)

        if pushed == 0 and queue.empty():
            await _hb(user_id, "running", 0, await _today(user_id), next_run_at, None)
            return "idle"

        # --- Drain a bounded batch with throttle.
        rng = random.Random()
        today = await _today(user_id)
        applied = 0
        result: TickResult = "done"
        while applied < settings.TICK_BATCH and not queue.empty():
            job = queue.get_nowait()
            await asyncio.sleep(throttle.next_delay(rng))
            status = await _maybe_apply_with_retry(job, agent)
            logger.info("tick: user=%s vacancy=%s status=%s", user_id, job.vacancy_id, status)

            if status in ("sent", "form_sent"):
                today = await limiter.increment(user_id)
                applied += 1
            elif status == "captcha":
                await captcha_service.create_request(user_id, "")  # records pending row
                await notify(user_id, "captcha", {"vacancy_id": job.vacancy_id})
                result = "captcha"
                break
            elif status == "limit_day":
                await notify(user_id, "limit_reached", {"source": "hh"})
                result = "limit_day"
                break
            elif status == "token_dead":
                await _stop_user(user_id, "token_dead", job.vacancy_id)
                return "token_dead"
            elif status == "account_banned":
                await _stop_user(user_id, "account_banned", job.vacancy_id)
                return "banned"
            elif status == "resume_missing":
                await notify(user_id, "resume_missing",
                             {"resume_id": job.resume_id, "vacancy_id": job.vacancy_id})
            # form_required / form_pending / vacancy_gone / failed → continue

        state = "paused_captcha" if result == "captcha" else "running"
        await _hb(user_id, state, queue.qsize(), today, next_run_at, None)
        return result
    finally:
        drop_user_queue(user_id)
        await lock.release(redis, user_id, token=token)


async def _today(user_id: str) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: limiter._read_day_count(user_id, limiter._today_local(limiter._tz_for_user(user_id))),
    )


async def _stop_user(user_id: str, reason: str, vacancy_id: str | None = None) -> None:
    from app.services import worker_control
    await worker_control.set_enabled(user_id, False)  # stop re-enqueue
    await notify(user_id, reason, {"vacancy_id": vacancy_id} if vacancy_id else {})
    await notify(user_id, "worker_stop", {"reason": reason})
    await _hb(user_id, "stopped", 0, await _today(user_id), None,
              f"hh {reason} — reconnect required")
    logger.error("tick: user=%s stopped (%s)", user_id, reason)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run python -m pytest tests/test_apply_tick.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/worker/tick.py backend/tests/test_apply_tick.py
git commit -m "feat: bounded apply_tick (replaces infinite run_loop)"
```

> **Note on `captcha_service.create_request(user_id, "")`:** verify the signature accepts an empty/placeholder URL (current code: `create_request(user_id, captcha_url)`). If it requires a real screenshot URL, pass through the URL `apply_one` surfaced, or add a no-URL overload. Confirm in `backend/app/services/captcha.py:63` during implementation.

---

## Task 6: Scheduler fan-out

**Files:**
- Create: `backend/app/worker/scheduler.py`
- Test: `backend/tests/test_scheduler.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_scheduler.py
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "x")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "x")
os.environ.setdefault("FERNET_KEY", "x" * 44)

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.worker import scheduler


@pytest.mark.asyncio
async def test_enqueue_only_accessible_users():
    arq = AsyncMock()
    ctx = {"redis": arq}
    with patch("app.worker.scheduler.enabled_active_user_ids",
               return_value=["u1", "u2", "u3"]), \
         patch("app.worker.scheduler.filter_accessible",
               return_value=["u1", "u3"]):
        n = await scheduler.enqueue_ticks(ctx)
    assert n == 2
    enqueued = {c.args[1] for c in arq.enqueue_job.await_args_list}
    assert enqueued == {"u1", "u3"}
    # deduped per user via _job_id
    for c in arq.enqueue_job.await_args_list:
        assert c.kwargs["_job_id"].startswith("tick:")


@pytest.mark.asyncio
async def test_enqueue_none_when_empty():
    arq = AsyncMock()
    with patch("app.worker.scheduler.enabled_active_user_ids", return_value=[]), \
         patch("app.worker.scheduler.filter_accessible", return_value=[]):
        n = await scheduler.enqueue_ticks({"redis": arq})
    assert n == 0
    arq.enqueue_job.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run python -m pytest tests/test_scheduler.py -v`
Expected: FAIL — `ModuleNotFoundError: app.worker.scheduler`.

- [ ] **Step 3: Implement**

```python
# backend/app/worker/scheduler.py
"""Arq cron job — fan out apply_tick jobs to every enabled + plan-valid user.

Runs every TICK_INTERVAL_S. Dedup: `_job_id="tick:{user_id}"` means a user
whose previous tick is still queued/running is NOT enqueued again (arq rejects
duplicate job ids), so a slow user can't pile up a backlog.
"""

from __future__ import annotations

import asyncio
import logging

from app.services.plan import filter_accessible
from app.services.worker_control import enabled_active_user_ids

logger = logging.getLogger(__name__)


async def enqueue_ticks(ctx: dict) -> int:
    arq = ctx["redis"]  # arq passes its ArqRedis pool as ctx["redis"]
    loop = asyncio.get_running_loop()
    users = await loop.run_in_executor(None, enabled_active_user_ids)
    users = await loop.run_in_executor(None, filter_accessible, users)
    for user_id in users:
        await arq.enqueue_job("apply_tick", user_id, _job_id=f"tick:{user_id}")
    if users:
        logger.info("scheduler: enqueued %d ticks", len(users))
    return len(users)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run python -m pytest tests/test_scheduler.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/worker/scheduler.py backend/tests/test_scheduler.py
git commit -m "feat: scheduler fan-out enqueue_ticks with per-user dedup"
```

---

## Task 7: Arq worker settings + entrypoint

Wires `apply_tick` as an Arq task and `enqueue_ticks` as a cron job.

**Files:**
- Create: `backend/app/worker/settings.py`
- Modify: `backend/worker_main.py`

- [ ] **Step 1: Implement WorkerSettings**

```python
# backend/app/worker/settings.py
"""Arq worker config — entrypoint via `arq app.worker.settings.WorkerSettings`.

functions: apply_tick (consumed by the worker pool).
cron_jobs: enqueue_ticks every TICK_INTERVAL_S (the scheduler fan-out).
Run >=1 worker replica for throughput; cron runs on whichever worker owns it
(arq cron is singleton-safe across the pool).
"""

from __future__ import annotations

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.worker.scheduler import enqueue_ticks
from app.worker.tick import run_tick


async def apply_tick(ctx: dict, user_id: str) -> str:
    return await run_tick(ctx["redis"], user_id)


def _second_marks(interval_s: int) -> set[int]:
    # cron triggers on these second-of-minute marks → ~every interval_s
    step = max(1, min(60, interval_s))
    return {s for s in range(0, 60, step)}


class WorkerSettings:
    functions = [apply_tick]
    cron_jobs = [
        cron(enqueue_ticks, second=_second_marks(settings.TICK_INTERVAL_S),
             run_at_startup=True),
    ]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 20            # concurrent ticks per worker replica
    job_timeout = settings.USER_LOCK_TTL_S  # tick must finish within lock TTL
    keep_result = 5
```

> **Note:** `cron(second=...)` granularity is per-second-of-minute, so `TICK_INTERVAL_S` must divide 60 cleanly (5/10/15/20/30). For intervals > 60s, switch to a single `cron(minute=...)` or a self-rescheduling job. Default 15 is fine.

- [ ] **Step 2: Repurpose worker_main.py as a documented shim**

Replace the entire body of `backend/worker_main.py` with:

```python
"""Worker entrypoint.

Run with arq:  arq app.worker.settings.WorkerSettings
This shim exists for `python worker_main.py` parity (systemd/docker).
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from arq import run_worker  # noqa: E402

from app.worker.settings import WorkerSettings  # noqa: E402

if __name__ == "__main__":
    run_worker(WorkerSettings)
```

- [ ] **Step 3: Verify it imports + arg-parses**

Run: `cd backend && uv run python -c "from app.worker.settings import WorkerSettings; print([f.__name__ for f in WorkerSettings.functions])"`
Expected: `['apply_tick']`

- [ ] **Step 4: Commit**

```bash
git add backend/app/worker/settings.py backend/worker_main.py
git commit -m "feat: arq WorkerSettings + cron scheduler; worker_main runs arq"
```

---

## Task 8: Recruiter memory — rebuild per tick (decision from Task 0)

Stateless ticks lose in-RAM langchain memory. `last_handled_id` prevents double-replies, but the agent loses conversational context. Seed memory from the hh thread each tick.

**Files:**
- Modify: `backend/app/worker/recruiter_poll.py`
- Modify: `backend/app/ai/agent.py` (`answer_recruiter` — accept prior-turns context)

- [ ] **Step 1: Inspect current memory handling**

Run: `cd backend && grep -n "memory\|history\|answer_recruiter\|ConversationBuffer" app/ai/agent.py app/worker/recruiter_poll.py`
Expected: identify where per-chat memory is stored (RAM dict keyed by chat id).

- [ ] **Step 2: Decision branch**
  - **If `answer_recruiter` already fetches the full thread from hh per call** → no change needed; mark task done, note in commit.
  - **If it relies on accumulated RAM memory** → pass the fetched message thread (already pulled by `poll_recruiter_chats`) into `answer_recruiter(chat, messages, ...)` and seed a fresh memory from `messages` each call. Remove the module-level RAM memory dict.

- [ ] **Step 3: Implement the seeding** (only if Step 2 second branch). Show the exact diff in the implementing session — wire `messages` (employer + our prior replies) into the agent's memory at construction, drop the persistent dict.

- [ ] **Step 4: Run recruiter tests**

Run: `cd backend && uv run python -m pytest tests/ -k recruiter -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/worker/recruiter_poll.py backend/app/ai/agent.py
git commit -m "fix: rebuild recruiter agent context per tick (stateless workers)"
```

---

## Task 9: Delete WorkerRegistry / RunnerHandle / _run_loop

Remove the dead in-memory machinery now that the tick + Arq replace it.

**Files:**
- Modify: `backend/app/worker/runner.py`
- Search: any importer of `get_registry`, `WorkerRegistry`, `reset_registry`, `RunnerHandle`

- [ ] **Step 1: Find all importers**

Run: `cd backend && grep -rn "get_registry\|WorkerRegistry\|reset_registry\|RunnerHandle\|_run_loop\|resume_captcha" app/ tests/`
Expected: list every reference. Known: `worker_main.py` (already rewritten Task 7). Check API/tests.

- [ ] **Step 2: Delete the classes/loop**

Remove `WorkerRegistry`, `RunnerHandle`, `_run_loop`, `_seconds_until_next_local_midnight`, the module-level `_registry`/`get_registry`/`reset_registry`, and the now-duplicated helpers (moved to `tick.py`). If nothing remains in `runner.py`, delete the file:

Run: `cd backend && git rm app/worker/runner.py`  *(only if no symbol still imported)*

- [ ] **Step 3: Fix orphaned imports**

Update/remove any test that imported the registry (e.g. a `test_runner.py`). Convert registry-level tests to `test_apply_tick.py` coverage where still meaningful.

- [ ] **Step 4: Full test suite**

Run: `cd backend && uv run python -m pytest tests/ -v`
Expected: PASS (no import errors, no references to deleted symbols).

- [ ] **Step 5: Commit**

```bash
git add -A backend/app/worker backend/tests
git commit -m "refactor: remove in-memory WorkerRegistry/run_loop (replaced by arq tick)"
```

---

## Task 10: Local end-to-end smoke

**Files:** none (manual verification).

- [ ] **Step 1: Start Redis**

Run: `docker run -d --rm -p 6379:6379 --name aiac-redis redis:7-alpine`
Expected: container id printed.

- [ ] **Step 2: Start the worker**

Run: `cd backend && uv run arq app.worker.settings.WorkerSettings`
Expected: logs `Starting worker`, cron `enqueue_ticks` fires at startup, `scheduler: enqueued N ticks` (N=0 if no enabled users — fine).

- [ ] **Step 3: Enable a test user**

In a second shell, flip a known test user's flag (psql or Supabase SQL):
`update profiles set worker_enabled = true where id = '<test-user-id>';`
Expected: within `TICK_INTERVAL_S`, worker logs `apply_tick` for that user; `worker_runtime` row updates.

- [ ] **Step 4: Verify API status reads heartbeat**

Run: `curl -H "Authorization: Bearer <jwt>" localhost:8000/api/worker/status`
Expected: `state` reflects tick activity, `queued`/`today_count` populated from `worker_runtime` (API code unchanged — proves DB contract intact).

- [ ] **Step 5: Verify lock contention**

Start a second worker (`uv run arq app.worker.settings.WorkerSettings`). Confirm logs show `lock held — skip` for the same user on the non-owning worker — no double-apply (also guaranteed by `applications` unique `(user_id, vacancy_id)`).

- [ ] **Step 6: Teardown**

Run: `docker stop aiac-redis`

---

## Task 11: Ops / deploy docs

**Files:**
- Modify: `CLAUDE.md` (Commands + Worker model sections)

- [ ] **Step 1: Update Commands**

Replace the standalone-worker command with:

```bash
# Worker pool (Arq) — scale by running N of these
cd backend && arq app.worker.settings.WorkerSettings

# Local Redis for the queue/lock
docker run -d -p 6379:6379 redis:7-alpine
```

- [ ] **Step 2: Update the "Worker model" architecture paragraph**

Rewrite to describe: scheduler cron fan-out → Arq queue → stateless worker pool consuming `apply_tick` → Redis per-user lock → heartbeat to `worker_runtime`. Note the API contract is unchanged (still reads `worker_runtime`, still flips `worker_enabled`).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document arq worker pool + redis in architecture"
```

---

## Self-Review

**Spec coverage:**
- Horizontal scale → Task 3 (lock) + 5 (stateless tick) + 6/7 (queue/pool). ✅
- Cookies-in-DB stateless model → unchanged (`load_api_client` per tick). ✅
- Single-owner per user → Redis lock (Task 3) + `applications` unique constraint. ✅
- Captcha without holding a worker → Task 5 gate + re-probe; API unchanged. ✅
- Idempotent / crash-safe → lock TTL re-arm + unique apply constraint (Task 10 step 5). ✅
- API/worker DB contract preserved → `worker_runtime` heartbeat + `worker_enabled` flag untouched (Task 10 step 4). ✅

**Open items flagged, not hidden:**
1. `captcha_service.create_request` URL arg — verify empty-URL acceptable (Task 5 note).
2. Recruiter RAM memory loss — handled in Task 8, branch on actual code.
3. `SessionCluster` anti-bot breaks dropped — Task 0 decision; spacing now from throttle + interval. If hh detection worsens, persist cluster state (new task).
4. `cron(second=...)` requires `TICK_INTERVAL_S` to divide 60 (Task 7 note).

**Type consistency:** `run_tick(redis, user_id) -> TickResult` used identically in Task 5 (def), Task 7 (`apply_tick` wrapper), Task 5 tests. `lock.acquire/release` signatures match across Task 3 + Task 5. `enqueue_ticks(ctx) -> int` matches Task 6 def + test. ✅
