# Captcha Handoff (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the auto-apply worker hits an hh captcha, surface it to the UI (modal + stored screenshot) and auto-resume by polling `GET /me` until the user solves it on hh.ru.

**Architecture:** `apply.py` inserts a `captcha_requests` row + uploads the captcha image to Supabase Storage. The runner's `paused_captcha` branch becomes a 5s poll loop over `GET /me` (wakeable early by a manual "re-check"). New `/api/captcha/*` endpoints drive list/solve/dismiss; the Day-14 modal gets solve/dismiss buttons.

**Tech Stack:** FastAPI, asyncio, Supabase (Postgres + Storage + Realtime), `requests`, pytest/pytest-asyncio, Next.js (frontend modal).

**Spec:** `docs/superpowers/specs/2026-05-25-captcha-handoff-design.md`

---

## File Structure

- **Create** `backend/app/services/captcha.py` — `captcha_requests` lifecycle: `create_request`, `mark_solved`, `get_pending`.
- **Modify** `backend/app/services/apply.py` — captcha branch also calls `captcha.create_request`.
- **Modify** `backend/app/worker/runner.py` — add `_probe_me` + `CAPTCHA_POLL_S`; replace blind `captcha_event.wait()` with poll loop.
- **Create** `backend/app/api/captcha.py` — `GET /pending`, `POST /{id}/solve`, `POST /{id}/dismiss`.
- **Modify** `backend/app/api/router.py` — register captcha router.
- **Modify** `frontend/src/components/captcha-modal.tsx` — wire solve/dismiss to the API.
- **Create** `backend/tests/test_captcha.py` — service unit tests.
- **Modify** `backend/tests/test_runner.py` — `_probe_me` tests.
- **Modify** `backend/tests/test_apply.py` — captcha branch creates a request.

No DB migration: `captcha_requests` table, RLS, Realtime publication, and the `captcha-screenshots` bucket already exist (migrations 001, 005).

All test commands run from `backend/` with `.venv` active: `cd backend && source ../.venv/bin/activate`.

---

### Task 1: `services/captcha.py` — captcha_requests lifecycle

**Files:**
- Create: `backend/app/services/captcha.py`
- Test: `backend/tests/test_captcha.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_captcha.py`:

```python
import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def _insert_mock(returned_row):
    chain = MagicMock()
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.execute.return_value = SimpleNamespace(data=[returned_row] if returned_row else [])
    return chain


async def test_create_request_uploads_image_and_inserts_row():
    from app.services import captcha as captcha_mod

    table_chain = _insert_mock({"id": "c1", "storage_path": "u1/abc.png"})
    storage_bucket = MagicMock()
    sb = MagicMock()
    sb.table.return_value = table_chain
    sb.storage.from_.return_value = storage_bucket

    resp = MagicMock()
    resp.content = b"PNGDATA"
    resp.raise_for_status.return_value = None

    with (
        patch.object(captcha_mod, "service_client", sb),
        patch.object(captcha_mod.requests, "get", return_value=resp),
    ):
        row = await captcha_mod.create_request("u1", "https://hh.ru/captcha.png")

    storage_bucket.upload.assert_called_once()
    insert_arg = table_chain.insert.call_args[0][0]
    assert insert_arg["user_id"] == "u1"
    assert insert_arg["captcha_url"] == "https://hh.ru/captcha.png"
    assert insert_arg["storage_path"] is not None
    assert insert_arg["solved"] is False
    assert row["id"] == "c1"


async def test_create_request_image_fetch_fails_storage_path_none():
    from app.services import captcha as captcha_mod

    table_chain = _insert_mock({"id": "c2", "storage_path": None})
    storage_bucket = MagicMock()
    sb = MagicMock()
    sb.table.return_value = table_chain
    sb.storage.from_.return_value = storage_bucket

    with (
        patch.object(captcha_mod, "service_client", sb),
        patch.object(captcha_mod.requests, "get", side_effect=Exception("boom")),
    ):
        await captcha_mod.create_request("u1", "https://hh.ru/captcha.png")

    storage_bucket.upload.assert_not_called()
    insert_arg = table_chain.insert.call_args[0][0]
    assert insert_arg["storage_path"] is None


async def test_mark_solved_updates_unsolved_rows():
    from app.services import captcha as captcha_mod

    chain = _insert_mock(None)
    sb = MagicMock()
    sb.table.return_value = chain

    with patch.object(captcha_mod, "service_client", sb):
        await captcha_mod.mark_solved("u1")

    update_arg = chain.update.call_args[0][0]
    assert update_arg["solved"] is True
    assert "solved_at" in update_arg
    # scoped to user + unsolved
    eq_calls = [c.args for c in chain.eq.call_args_list]
    assert ("user_id", "u1") in eq_calls
    assert ("solved", False) in eq_calls
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_captcha.py -v`
Expected: FAIL — `ModuleNotFoundError` / `AttributeError: module 'app.services.captcha' has no attribute 'create_request'` (file is currently empty).

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/captcha.py`:

```python
"""captcha_requests lifecycle: fetch screenshot → Storage → row, mark solved, list pending.

All sync Supabase/HTTP calls run in run_in_executor — never block the event loop.
Storing the screenshot is groundwork for a future AI captcha solver.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

import requests

from app.db.supabase import service_client

logger = logging.getLogger(__name__)

SCREENSHOT_BUCKET = "captcha-screenshots"
IMAGE_FETCH_TIMEOUT = 10


def _fetch_image(captcha_url: str) -> bytes | None:
    try:
        resp = requests.get(captcha_url, timeout=IMAGE_FETCH_TIMEOUT)
        resp.raise_for_status()
        return resp.content
    except Exception:
        logger.warning("captcha: image fetch failed for %s", captcha_url, exc_info=True)
        return None


def _create_request_sync(user_id: str, captcha_url: str) -> dict:
    storage_path: str | None = None
    image = _fetch_image(captcha_url)
    if image:
        path = f"{user_id}/{uuid.uuid4()}.png"
        try:
            service_client.storage.from_(SCREENSHOT_BUCKET).upload(
                path, image, {"content-type": "image/png", "upsert": "true"}
            )
            storage_path = path
        except Exception:
            logger.warning("captcha: screenshot upload failed", exc_info=True)

    res = (
        service_client.table("captcha_requests")
        .insert(
            {
                "user_id": user_id,
                "storage_path": storage_path,
                "captcha_url": captcha_url,
                "solved": False,
            }
        )
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else {}


async def create_request(user_id: str, captcha_url: str) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _create_request_sync, user_id, captcha_url)


def _mark_solved_sync(user_id: str) -> None:
    (
        service_client.table("captcha_requests")
        .update(
            {"solved": True, "solved_at": datetime.now(timezone.utc).isoformat()}
        )
        .eq("user_id", user_id)
        .eq("solved", False)
        .execute()
    )


async def mark_solved(user_id: str) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _mark_solved_sync, user_id)


def _get_pending_sync(user_id: str) -> list[dict]:
    res = (
        service_client.table("captcha_requests")
        .select("*")
        .eq("user_id", user_id)
        .eq("solved", False)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


async def get_pending(user_id: str) -> list[dict]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _get_pending_sync, user_id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_captcha.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/captcha.py backend/tests/test_captcha.py
git commit -m "feat: captcha_requests service — screenshot upload + lifecycle"
```

---

### Task 2: `apply.py` — captcha branch creates a captcha_request

**Files:**
- Modify: `backend/app/services/apply.py` (imports + `except hh_errors.CaptchaRequired` branch, ~line 256)
- Test: `backend/tests/test_apply.py` (existing `test_apply_one_captcha`)

- [ ] **Step 1: Update the existing captcha test to assert request creation**

In `backend/tests/test_apply.py`, find `test_apply_one_captcha`. It raises `CaptchaRequired` from `client.post`. Patch `captcha_service.create_request` and assert it's called. Replace that test body with:

```python
async def test_apply_one_captcha():
    from app.hh import errors as hh_errors
    from app.services import apply as apply_mod

    sb, _, _ = _supabase_mock({"id": "r-uuid", "hh_resume_id": "hh-r1"})
    client = MagicMock()
    client.access_token = "tok"
    client.get.return_value = {
        "id": "v1", "employer": {"id": "42"},
        "has_test": False, "response_letter_required": False,
    }
    resp = type("R", (), {"status_code": 403, "request": None, "headers": {}})()
    data = {"errors": [{"value": "captcha_required", "captcha_url": "https://hh.ru/cap.png"}]}
    client.post.side_effect = hh_errors.CaptchaRequired(resp, data)

    from unittest.mock import AsyncMock
    with (
        patch.object(apply_mod, "service_client", sb),
        patch.object(apply_mod, "load_api_client", return_value=client),
        patch.object(apply_mod, "persist_if_refreshed"),
        patch.object(apply_mod.captcha_service, "create_request", new=AsyncMock()) as create_req,
    ):
        result = await apply_mod.apply_one("u1", "r-uuid", "v1")

    assert result == "captcha"
    create_req.assert_awaited_once_with("u1", "https://hh.ru/cap.png")
```

> Note: if the existing `test_apply_one_captcha` does not already provide `client.get` returning a vacancy dict, the version above supersedes it — keep only this one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_apply.py::test_apply_one_captcha -v`
Expected: FAIL — `AttributeError: module 'app.services.apply' has no attribute 'captcha_service'`.

- [ ] **Step 3: Wire `create_request` into the captcha branch**

In `backend/app/services/apply.py`, add the import near the other service imports (after line 22 `from app.services import cover_letter as cover_letter_service`):

```python
from app.services import captcha as captcha_service
```

Then in the `except hh_errors.CaptchaRequired as ex:` block (currently records the application and returns `"captcha"`), add the `create_request` call after the existing `_record_application` executor call and before `return "captcha"`:

```python
        except hh_errors.CaptchaRequired as ex:
            await loop.run_in_executor(
                None,
                lambda: _record_application(
                    user_id=user_id,
                    resume_uuid=resume_uuid,
                    vacancy_id=vacancy_id,
                    status="captcha",
                    cover_letter=cover_letter or None,
                    error=ex.captcha_url,
                    employer_id=employer_id,
                ),
            )
            try:
                await captcha_service.create_request(user_id, ex.captcha_url)
            except Exception:
                logger.exception("apply: failed to create captcha_request")
            return "captcha"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_apply.py -v`
Expected: PASS (all apply tests green).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/apply.py backend/tests/test_apply.py
git commit -m "feat: apply captcha branch inserts captcha_request"
```

---

### Task 3: `runner.py` — plan-B `/me` poll loop

**Files:**
- Modify: `backend/app/worker/runner.py` (imports, constant, `_probe_me`, `paused_captcha` branch ~line 104)
- Test: `backend/tests/test_runner.py`

- [ ] **Step 1: Write the failing `_probe_me` tests**

Append to `backend/tests/test_runner.py`:

```python
async def test_probe_me_ok():
    from unittest.mock import MagicMock
    from app.worker import runner

    client = MagicMock()
    client.access_token = "tok"
    client.get.return_value = {"id": "me1"}

    with (
        patch.object(runner, "load_api_client", return_value=client),
        patch.object(runner, "persist_if_refreshed"),
    ):
        result = await runner._probe_me("u1")
    assert result == "ok"


async def test_probe_me_captcha():
    from unittest.mock import MagicMock
    from app.hh import errors as hh_errors
    from app.worker import runner

    client = MagicMock()
    client.access_token = "tok"
    resp = type("R", (), {"status_code": 403, "request": None, "headers": {}})()
    data = {"errors": [{"value": "captcha_required", "captcha_url": "https://x"}]}
    client.get.side_effect = hh_errors.CaptchaRequired(resp, data)

    with (
        patch.object(runner, "load_api_client", return_value=client),
        patch.object(runner, "persist_if_refreshed"),
    ):
        result = await runner._probe_me("u1")
    assert result == "captcha"


async def test_probe_me_forbidden_token_dead():
    from unittest.mock import AsyncMock, MagicMock
    from app.hh import errors as hh_errors
    from app.worker import runner

    client = MagicMock()
    client.access_token = "tok"
    resp = type("R", (), {"status_code": 403, "request": None, "headers": {}})()
    client.get.side_effect = hh_errors.Forbidden(resp, {"description": "nope"})

    with (
        patch.object(runner, "load_api_client", return_value=client),
        patch.object(runner, "persist_if_refreshed"),
        patch.object(runner, "mark_invalid", new=AsyncMock()) as mi,
    ):
        result = await runner._probe_me("u1")
    assert result == "token_dead"
    mi.assert_awaited_once()


async def test_probe_me_load_fails_token_dead():
    from app.worker import runner

    def _boom(_uid):
        raise RuntimeError("no creds")

    with patch.object(runner, "load_api_client", side_effect=_boom):
        result = await runner._probe_me("u1")
    assert result == "token_dead"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_runner.py -k probe_me -v`
Expected: FAIL — `AttributeError: module 'app.worker.runner' has no attribute '_probe_me'`.

- [ ] **Step 3: Add imports, constant, and `_probe_me`**

In `backend/app/worker/runner.py`, add to the imports block (after line 21 `from app.services.notifications import notify`):

```python
from app.services import captcha as captcha_service
from app.services.hh_credentials import (
    load_api_client,
    mark_invalid,
    persist_if_refreshed,
)
```

Add a constant near `IDLE_REFILL_SLEEP_S` (line ~33):

```python
# Plan-B captcha poll interval (seconds) — re-probe GET /me while paused.
CAPTCHA_POLL_S = 5
```

Add `_probe_me` after `_maybe_apply_with_retry` (before `_seconds_until_next_local_midnight`):

```python
async def _probe_me(user_id: str) -> str:
    """Probe GET /me to detect whether the hh captcha lifted.

    Returns 'ok' (clear), 'captcha' (still blocked / transient — keep polling),
    or 'token_dead' (creds unusable — stop).
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
        await mark_invalid(user_id, f"Forbidden on /me probe: {ex}")
        return "token_dead"
    except Exception:
        logger.warning(
            "probe_me: transient error for %s — keep polling", user_id, exc_info=True
        )
        return "captcha"
    finally:
        await persist_if_refreshed(user_id, client, original)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_runner.py -k probe_me -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Replace the `paused_captcha` branch with the poll loop**

In `_run_loop`, replace the current branch (lines ~104-108):

```python
        if handle.state == "paused_captcha":
            handle.next_run_at = None
            await handle.captcha_event.wait()
            handle.captcha_event.clear()
            handle.state = "running"
```

with:

```python
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
                # "captcha" → keep polling
            if handle.state == "stopped":
                return
```

> The existing `elif status == "captcha":` handler later in the loop (sets `state="paused_captcha"`, `captcha_event.clear()`, notifies) is unchanged — it's what enters this branch on the next iteration.

- [ ] **Step 6: Run the full runner + apply suite**

Run: `python -m pytest tests/test_runner.py tests/test_apply.py -v`
Expected: PASS (existing tests still green, including `test_registry_resume_captcha`).

- [ ] **Step 7: Commit**

```bash
git add backend/app/worker/runner.py backend/tests/test_runner.py
git commit -m "feat: plan-B captcha poll loop in worker runner"
```

---

### Task 4: `api/captcha.py` — endpoints + router registration

**Files:**
- Create: `backend/app/api/captcha.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Create the router**

Create `backend/app/api/captcha.py`:

```python
"""Captcha handoff endpoints (plan B).

The worker operates one captcha at a time per user; `{request_id}` is accepted for
REST shape but the service operates per-user.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.services import captcha as captcha_service
from app.worker.runner import get_registry

router = APIRouter(prefix="/api/captcha", tags=["captcha"])


class RecheckResponse(BaseModel):
    rechecking: bool


class DismissResponse(BaseModel):
    stopped: bool


@router.get("/pending")
async def pending(user_id: str = Depends(get_current_user)) -> list[dict]:
    return await captcha_service.get_pending(user_id)


@router.post("/{request_id}/solve", response_model=RecheckResponse)
async def solve(
    request_id: str, user_id: str = Depends(get_current_user)
) -> RecheckResponse:
    rechecking = get_registry().resume_captcha(user_id)
    return RecheckResponse(rechecking=rechecking)


@router.post("/{request_id}/dismiss", response_model=DismissResponse)
async def dismiss(
    request_id: str, user_id: str = Depends(get_current_user)
) -> DismissResponse:
    await captcha_service.mark_solved(user_id)
    stopped = await get_registry().stop(user_id)
    return DismissResponse(stopped=stopped)
```

- [ ] **Step 2: Register the router**

In `backend/app/api/router.py`, add `captcha` to the import and include it:

```python
from app.api import auth, captcha, filters, resumes, worker
from app.api import _debug
from app.config import settings

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(resumes.router)
api_router.include_router(filters.router)
api_router.include_router(worker.router)
api_router.include_router(captcha.router)
```

- [ ] **Step 3: Verify the app imports and routes register**

Run: `python -c "from app.main import app; print([r.path for r in app.routes if 'captcha' in r.path])"`
Expected: prints `['/api/captcha/pending', '/api/captcha/{request_id}/solve', '/api/captcha/{request_id}/dismiss']`.

- [ ] **Step 4: Run the full backend suite**

Run: `python -m pytest tests/ -v`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/captcha.py backend/app/api/router.py
git commit -m "feat: /api/captcha pending/solve/dismiss endpoints"
```

---

### Task 5: Frontend — wire modal solve/dismiss to the API

**Files:**
- Modify: `frontend/src/components/captcha-modal.tsx`

- [ ] **Step 1: Add the API import**

At the top of `frontend/src/components/captcha-modal.tsx`, add after the existing imports:

```tsx
import { apiFetch } from "@/lib/api";
```

- [ ] **Step 2: Add solve/dismiss handlers**

Inside the component, after the `useEffect`, before `if (!pending) return null;`, add:

```tsx
  async function handleSolve() {
    if (!pending) return;
    try {
      await apiFetch(`/api/captcha/${pending.id}/solve`, { method: "POST" });
    } catch {
      /* re-check is best-effort; the 5s auto-poll will still fire */
    }
  }

  async function handleDismiss() {
    const id = pending?.id;
    setPending(null);
    setImageUrl(null);
    if (!id) return;
    try {
      await apiFetch(`/api/captcha/${id}/dismiss`, { method: "POST" });
    } catch {
      /* worker stop is best-effort */
    }
  }
```

- [ ] **Step 3: Replace the button row**

Replace the existing `<div className="flex gap-2">…</div>` block (the "Открыть на hh" link + "Закрыть" button) with:

```tsx
        <div className="flex flex-col gap-2">
          {pending.captcha_url && (
            <a
              href={pending.captcha_url}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-black px-3 py-2 text-center text-sm text-white hover:bg-gray-800"
            >
              Открыть на hh
            </a>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSolve}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Я решил, проверить
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Закрыть
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/captcha-modal.tsx
git commit -m "feat: captcha modal solve/dismiss wired to API"
```

---

## Self-Review

**Spec coverage:**
- Screenshot fetch + Storage upload → Task 1 (`create_request`). ✓
- `captcha_requests` row on apply captcha → Task 2. ✓
- Modal shows captcha (image + new-tab link) → already Day-14; image now populated via Task 1. ✓
- Worker `/me` poll auto-resume → Task 3. ✓
- Manual re-check (`/solve`) + dismiss-stops-worker (`/dismiss`) → Task 4 + Task 5. ✓
- `GET /api/captcha/pending` Realtime fallback → Task 4. ✓
- No migration → confirmed (table/bucket/Realtime exist). ✓

**Placeholder scan:** none — every code step has full code; every test step has full test bodies.

**Type/name consistency:** `create_request(user_id, captcha_url)`, `mark_solved(user_id)`, `get_pending(user_id)` used identically across service, apply.py, runner.py, api/captcha.py. `resume_captcha`/`stop` are existing `WorkerRegistry` methods. `CAPTCHA_POLL_S` defined in Task 3 and used in the same task. `RecheckResponse.rechecking` / `DismissResponse.stopped` defined and returned in Task 4.

**Risk (from spec):** plan-B assumes a clear `/me` implies the negotiations captcha lifted. If runtime shows otherwise, change `_probe_me`'s probe target — single-function change.
