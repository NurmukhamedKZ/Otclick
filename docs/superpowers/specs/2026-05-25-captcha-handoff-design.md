# Captcha handoff (plan B) — Day 15-16

## Problem

The auto-apply worker hits an hh captcha during `POST /negotiations`. Today `apply.py`
returns `"captcha"`, the runner sets `state="paused_captcha"` and waits on
`captcha_event.wait()` — but **nothing ever sets that event** (no `resume_captcha` caller
exists) and **no `captcha_requests` row is inserted**, so the Day-14 `CaptchaModal` (which
reads `captcha_requests` via Realtime) never shows. The flow dead-ends: the worker is stuck
paused forever and the user is never told.

## Goal

Plan B captcha handoff (per MVP_PLAN §7): detect captcha → surface to UI (modal + stored
screenshot) → user solves on hh.ru in a new tab → worker polls `GET /me` every 5s and
auto-resumes once the request passes. Manual "I solved it" button triggers an immediate
re-check. Dismiss stops the worker.

Success criteria:
1. Worker captcha during apply inserts a `captcha_requests` row and uploads the captcha
   image to Supabase Storage.
2. The Day-14 modal shows the captcha (image inline + "open on hh" link).
3. Worker auto-detects resolution by polling `/me` and resumes applying.
4. "Я решил, проверить" forces an immediate re-check; "Закрыть" dismisses and stops the worker.

## Out of scope

- AI captcha solving (future — storing the screenshot is the only groundwork done now).
- Plan A iframe (`X-Frame-Options` blocks it — already decided in MVP).
- Email/TG fallback channel (separate day).
- Onboarding-flow captcha — already handled in `services/hh_auth.py`.

## Decisions (from brainstorming)

- **Screenshot:** fetch the captcha image from hh's `captcha_url` and upload to the
  `captcha-screenshots` bucket. Enables a future AI solver. If the fetch fails, still insert
  the row with `storage_path=null` (modal falls back to the new-tab link).
- **Solve flow:** worker auto-polls `/me` every 5s; `POST /api/captcha/{id}/solve` is a manual
  "re-check now" that wakes the poll early. The poll — not the endpoint — decides solved.
- **Dismiss:** `POST /api/captcha/{id}/dismiss` marks the row solved (closes the modal) and
  stops the worker. User restarts manually.

## Architecture

### 1. `backend/app/services/captcha.py` (currently empty)

`captcha_requests` lifecycle. All sync Supabase/requests calls run via `run_in_executor`
(never block the event loop), matching `notifications.py` / `hh_credentials.py`.

- `async create_request(user_id, captcha_url) -> dict`
  - Fetch the captcha image from `captcha_url` with `requests.get` (short timeout). On any
    error, log and continue with `image=None`.
  - If image present: upload to `captcha-screenshots` at `{user_id}/{uuid}.png`
    (`content-type: image/png`, `upsert: true`); `storage_path = that path`. Else
    `storage_path = None`.
  - Insert `captcha_requests` row `{user_id, storage_path, captcha_url, solved=false}`.
    Return the inserted row.
- `async mark_solved(user_id) -> None` — update all of the user's `solved=false` rows to
  `solved=true, solved_at=now()`. (User has at most one active captcha; mark-all is safe and
  avoids threading the row id through the runner.)
- `async get_pending(user_id) -> list[dict]` — select `solved=false`, newest first.

No new migration: `captcha_requests` table, RLS, Realtime publication, and the
`captcha-screenshots` bucket all already exist (migrations 001, 005).

### 2. `backend/app/services/apply.py` — captcha branch

In the existing `except hh_errors.CaptchaRequired as ex:` block, keep the `applications`
row write (`status="captcha"`), and **add** `await captcha.create_request(user_id, ex.captcha_url)`
before returning `"captcha"`. Wrap the `create_request` call so a failure there cannot mask
the `"captcha"` return (log + continue).

### 3. `backend/app/worker/runner.py` — plan-B poll loop

Replace the blind wait in the `paused_captcha` branch:

```python
# before
await handle.captcha_event.wait()
handle.captcha_event.clear()
handle.state = "running"
```

with a poll loop:

```python
while handle.state == "paused_captcha":
    try:
        await asyncio.wait_for(handle.captcha_event.wait(), timeout=CAPTCHA_POLL_S)  # 5s
    except asyncio.TimeoutError:
        pass
    handle.captcha_event.clear()
    if handle.state != "paused_captcha":   # dismissed/stopped externally
        break
    result = await _probe_me(user_id)       # "ok" | "captcha" | "token_dead"
    if result == "ok":
        await captcha.mark_solved(user_id)
        await notify(user_id, "captcha", {"resolved": True})
        handle.state = "running"
    elif result == "token_dead":
        handle.state = "stopped"
        await notify(user_id, "token_dead", {})
        await notify(user_id, "worker_stop", {"reason": "token_dead"})
        return
    # "captcha" → keep polling
```

`_probe_me(user_id)`:
- `client = await load_api_client(user_id)`; `original = client.access_token`.
- `GET /me` in executor → return `"ok"`.
- `except CaptchaRequired` → `"captcha"`.
- `except Forbidden` → `mark_invalid` → `"token_dead"`.
- `except HHCredentialsInvalid` → `"token_dead"`.
- `finally: persist_if_refreshed`.

`resume_captcha()` semantics shift from "force resume" to "probe now" — it just sets the
event to wake the 5s sleep early; the `/me` probe still decides.

Add `CAPTCHA_POLL_S = 5` constant.

### 4. `backend/app/api/captcha.py` (new), registered in `router.py`

- `GET /api/captcha/pending` → `captcha.get_pending(user_id)`.
- `POST /api/captcha/{id}/solve` → `get_registry().resume_captcha(user_id)` → `{rechecking: bool}`
  (the bool is whether a paused runner was found).
- `POST /api/captcha/{id}/dismiss` → `await captcha.mark_solved(user_id)` +
  `await get_registry().stop(user_id)` → `{stopped: bool}`.

All routes use `get_current_user`. The `{id}` is accepted for REST shape but the service
operates per-user (one active captcha at a time); `mark_solved`/`resume` are user-scoped.

### 5. `frontend/src/components/captcha-modal.tsx`

- Keep the existing Realtime subscription (auto-closes on `solved=true` UPDATE).
- Add a "Я решил, проверить" button → `apiFetch('/api/captcha/${id}/solve', {method:'POST'})`.
- Change "Закрыть" → `apiFetch('/api/captcha/${id}/dismiss', {method:'POST'})` then clear local
  state. (Today it only hides locally.)
- Use the existing `apiFetch` from `@/lib/api`.

## Testing

`backend/tests/test_captcha.py`:
- `create_request` with mocked `requests.get` (returns image) + mocked storage upload + insert
  → asserts `storage_path` set, row inserted.
- `create_request` when image fetch raises → `storage_path=None`, row still inserted.
- `mark_solved` issues the expected update.

`backend/tests/test_runner.py` (extend):
- `_probe_me` → `"ok"` resumes, marks solved.
- `_probe_me` → `"captcha"` stays `paused_captcha`.
- `_probe_me` → `Forbidden`/`HHCredentialsInvalid` → `"token_dead"`, runner stops.

Unit-level, no real Supabase/hh — mock the Supabase chain (`_fluent` helper) and the hh client,
following existing test patterns.

## Risk

Plan-B assumes a clear `/me` means the account-level captcha lifted and the next
`/negotiations` will pass. Whether an hh browser solve actually clears the API captcha is a
runtime-validation item, not a design unknown. If it doesn't hold, the fallback is to re-probe
`/negotiations` instead of `/me` — a one-line change to `_probe_me`'s target.
