# Recruiter Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An AI agent that reads recruiter messages in hh.ru chats inside the worker loop and per message either replies directly, drafts a reply for user approval, creates an out-of-hh todo, or stays silent.

**Architecture:** A new poller step in the per-user runner loop fetches negotiations with unread messages, picks the latest employer message after a stored cursor, and invokes a per-user `HHAgent` recruiter agent grounded in the user's resume. The agent has three side-effecting tools (`send_message_recruiter`, `escalate_to_human`, `make_todo`) that read per-chat context via LangChain `ToolRuntime`; calling no tool = skip. Drafts and todos persist to two new tables surfaced through a JWT-protected API and a frontend inbox.

**Tech Stack:** Python 3.13, FastAPI, langchain 1.3.x (`create_agent`, `ToolRuntime`), langgraph `InMemorySaver`, Supabase (service_role), Next.js/React frontend.

---

## File Structure

**Create:**
- `infra/supabase/migrations/010_recruiter_chats.sql` — `recruiter_chats`, `recruiter_drafts`, `recruiter_todos` tables + RLS.
- `backend/app/services/recruiter.py` — persistence + hh helpers (cursor, drafts, todos, message selection). Shared by tools, poller, API.
- `backend/app/ai/recruiter_tools.py` — `RecruiterContext` dataclass + 3 `@tool` functions + `RECRUITER_TOOLS` list.
- `backend/app/worker/recruiter_poll.py` — `poll_recruiter_chats(handle)` orchestrator.
- `backend/app/schemas/recruiter.py` — Pydantic request/response models.
- `backend/app/api/recruiter.py` — `/api/recruiter/*` endpoints.
- `backend/tests/test_recruiter_service.py`, `test_recruiter_tools.py`, `test_recruiter_poll.py`, `test_recruiter_api.py`, `test_agent_recruiter.py`.
- `frontend/src/hooks/useRecruiter.ts` — data hook.
- `frontend/src/app/(app)/recruiter/page.tsx` — drafts + todos inbox.

**Modify:**
- `backend/app/ai/prompt.py` — fill `RECRUITER_SYSTEM_PROMPT` + `build_recruiter_prompt(resume_summary)`.
- `backend/app/ai/agent.py` — `HHAgent(user_id)`, lazy recruiter agent, new `answer_recruiter` signature.
- `backend/app/worker/runner.py` — build agent with `user_id` in `__post_init__`; call poller in loop.
- `backend/app/services/notifications.py` — add `recruiter_draft`, `recruiter_todo` literals.
- `backend/app/api/router.py` — include recruiter router.

---

## hh API reference (confirmed against `hh-applicant-tool/docs/hhapi/openapi.yml`)

- `GET negotiations?order_by=updated&order=desc&per_page=50` → `{items: [{id, counters:{unread_messages}, has_updates, vacancy:{id, employer:{name}}, ...}]}`.
- `GET negotiations/{nid}/messages?with_text_only=true` → `{items: [{id, author:{participant_type: "employer"|"applicant"}, text, created_at, state:{id,name}}], ...}` in chronological order.
- `POST negotiations/{nid}/messages` body `{"message": text}` (form-urlencoded — `ApiClient.post` sends `data=` when `as_json` is falsy). Returns 201 JSON.

`ApiClient` is sync + rate-limited; always call it inside `loop.run_in_executor`. Wrap usage with `original = client.access_token` … `persist_if_refreshed(user_id, client, original)` (see `worker/runner.py::_probe_me`).

---

## Task 1: Database migration

**Files:**
- Create: `infra/supabase/migrations/010_recruiter_chats.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 010_recruiter_chats.sql — recruiter-chat AI agent state.
--   recruiter_chats: per-negotiation dedup cursor.
--   recruiter_drafts: AI-suggested replies awaiting user approval.
--   recruiter_todos:  out-of-hh actions for the user (form/telegram/call).
-- Run AFTER 009_form_answers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS recruiter_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  vacancy_id text,
  employer_name text,
  last_handled_message_id text,
  last_polled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, negotiation_id)
);

CREATE TABLE IF NOT EXISTS recruiter_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  message_id text,
  draft_text text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',   -- 'pending'|'sent'|'discarded'
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS recruiter_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  message_id text,
  title text NOT NULL,
  detail text,
  link text,
  status text NOT NULL DEFAULT 'open',       -- 'open'|'done'|'dismissed'
  created_at timestamptz DEFAULT now(),
  done_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_recruiter_drafts_user_status
  ON recruiter_drafts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_recruiter_todos_user_status
  ON recruiter_todos (user_id, status);

ALTER TABLE recruiter_chats  ENABLE ROW LEVEL SECURITY;  -- service_role only, no policies
ALTER TABLE recruiter_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiter_todos  ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Commit**

```bash
git add infra/supabase/migrations/010_recruiter_chats.sql
git commit -m "feat(db): recruiter chat agent tables"
```

> Apply to Supabase manually (or via the project's migration runner) before running the worker against a real account. No automated DB test covers SQL.

---

## Task 2: Notification types

**Files:**
- Modify: `backend/app/services/notifications.py:13-21`

- [ ] **Step 1: Add the two literals**

In `NotificationType`, add the new members:

```python
NotificationType = Literal[
    "apply_success",
    "captcha",
    "worker_stop",
    "limit_reached",
    "token_dead",
    "account_banned",
    "resume_missing",
    "recruiter_draft",
    "recruiter_todo",
]
```

- [ ] **Step 2: Verify import still loads**

Run: `cd backend && .venv/bin/python -c "from app.services.notifications import notify, NotificationType; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/notifications.py
git commit -m "feat: recruiter_draft/recruiter_todo notification types"
```

---

## Task 3: Recruiter service — message selection helpers

Pure functions first (no I/O), so they're trivially testable.

**Files:**
- Create: `backend/app/services/recruiter.py`
- Test: `backend/tests/test_recruiter_service.py`

- [ ] **Step 1: Write the failing test**

```python
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from app.services.recruiter import new_employer_message, to_lc_messages


def _msgs():
    return [
        {"id": "1", "author": {"participant_type": "applicant"}, "text": "cover letter"},
        {"id": "2", "author": {"participant_type": "employer"}, "text": "Какая зарплата?"},
        {"id": "3", "author": {"participant_type": "applicant"}, "text": "300к"},
        {"id": "4", "author": {"participant_type": "employer"}, "text": "Готовы к офферу?"},
    ]


def test_new_employer_message_after_cursor():
    msg = new_employer_message(_msgs(), last_handled_id="2")
    assert msg["id"] == "4"


def test_new_employer_message_none_when_last_is_applicant():
    msgs = _msgs()[:3]  # last is applicant
    assert new_employer_message(msgs, last_handled_id="2") is None


def test_new_employer_message_no_cursor_takes_latest_employer():
    assert new_employer_message(_msgs(), last_handled_id=None)["id"] == "4"


def test_new_employer_message_skips_empty_text():
    msgs = [{"id": "5", "author": {"participant_type": "employer"}, "text": ""}]
    assert new_employer_message(msgs, last_handled_id=None) is None


def test_to_lc_messages_maps_roles():
    out = to_lc_messages(_msgs())
    assert out == [
        ("assistant", "cover letter"),
        ("user", "Какая зарплата?"),
        ("assistant", "300к"),
        ("user", "Готовы к офферу?"),
    ]
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_service.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.recruiter`

- [ ] **Step 3: Implement the helpers**

Create `backend/app/services/recruiter.py`:

```python
"""Recruiter-chat agent persistence + message helpers.

Shared by the chat tools (ai/recruiter_tools.py), the poller
(worker/recruiter_poll.py), and the API (api/recruiter.py). All DB writes use
the service_role client and run in an executor — never block the event loop.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.db.supabase import service_client
from app.services.hh_credentials import load_api_client, persist_if_refreshed

logger = logging.getLogger(__name__)


def new_employer_message(items: list[dict], last_handled_id: str | None) -> dict | None:
    """Latest employer-authored message with text that appears AFTER last_handled_id.

    `items` are chronological (hh order). Returns None when the newest employer
    message is not new (already handled) or there is no employer text message.
    """
    start = 0
    if last_handled_id is not None:
        for i, m in enumerate(items):
            if str(m.get("id")) == str(last_handled_id):
                start = i + 1
                break
    latest = None
    for m in items[start:]:
        if m.get("author", {}).get("participant_type") == "employer" and (m.get("text") or "").strip():
            latest = m
    return latest


def to_lc_messages(items: list[dict]) -> list[tuple[str, str]]:
    """Map hh messages to LangChain (role, content) tuples for agent context."""
    out: list[tuple[str, str]] = []
    for m in items:
        text = (m.get("text") or "").strip()
        if not text:
            continue
        role = "user" if m.get("author", {}).get("participant_type") == "employer" else "assistant"
        out.append((role, text))
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_service.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/recruiter.py backend/tests/test_recruiter_service.py
git commit -m "feat: recruiter message selection helpers"
```

---

## Task 4: Recruiter service — persistence helpers

**Files:**
- Modify: `backend/app/services/recruiter.py`
- Test: `backend/tests/test_recruiter_service.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_recruiter_service.py`:

```python
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import pytest


def _fluent(final_data=None):
    chain = MagicMock()
    for m in ("select", "insert", "update", "delete", "eq", "order", "maybe_single", "limit"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = SimpleNamespace(data=final_data)
    return chain


@pytest.mark.asyncio
async def test_get_cursor_returns_last_handled():
    from app.services import recruiter
    chain = _fluent({"last_handled_message_id": "42"})
    with patch.object(recruiter.service_client, "table", return_value=chain):
        assert await recruiter.get_cursor("u1", "n1") == "42"


@pytest.mark.asyncio
async def test_get_cursor_none_when_no_row():
    from app.services import recruiter
    chain = _fluent(None)
    with patch.object(recruiter.service_client, "table", return_value=chain):
        assert await recruiter.get_cursor("u1", "n1") is None


@pytest.mark.asyncio
async def test_insert_draft_writes_row():
    from app.services import recruiter
    chain = _fluent([{"id": "d1"}])
    with patch.object(recruiter.service_client, "table", return_value=chain):
        await recruiter.insert_draft("u1", "n1", "m1", "draft text", "ambiguous")
    args = chain.insert.call_args[0][0]
    assert args["user_id"] == "u1"
    assert args["negotiation_id"] == "n1"
    assert args["message_id"] == "m1"
    assert args["draft_text"] == "draft text"
    assert args["reason"] == "ambiguous"
    assert args["status"] == "pending"


@pytest.mark.asyncio
async def test_insert_todo_writes_row():
    from app.services import recruiter
    chain = _fluent([{"id": "t1"}])
    with patch.object(recruiter.service_client, "table", return_value=chain):
        await recruiter.insert_todo("u1", "n1", "m1", "Заполнить форму", "ссылка ниже", "https://forms.gle/x")
    args = chain.insert.call_args[0][0]
    assert args["title"] == "Заполнить форму"
    assert args["link"] == "https://forms.gle/x"
    assert args["status"] == "open"


@pytest.mark.asyncio
async def test_upsert_cursor_upserts():
    from app.services import recruiter
    chain = _fluent([{"id": "c1"}])
    with patch.object(recruiter.service_client, "table", return_value=chain):
        await recruiter.upsert_cursor("u1", "n1", "m9", vacancy_id="v1", employer_name="Acme")
    assert chain.upsert.called
    row = chain.upsert.call_args[0][0]
    assert row["last_handled_message_id"] == "m9"
    assert row["negotiation_id"] == "n1"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_service.py -v`
Expected: FAIL — `AttributeError: module 'app.services.recruiter' has no attribute 'get_cursor'`

- [ ] **Step 3: Implement persistence helpers**

Append to `backend/app/services/recruiter.py`:

```python
def _run(fn):
    return asyncio.get_running_loop().run_in_executor(None, fn)


async def get_cursor(user_id: str, negotiation_id: str) -> str | None:
    def _q():
        return (
            service_client.table("recruiter_chats")
            .select("last_handled_message_id")
            .eq("user_id", user_id)
            .eq("negotiation_id", negotiation_id)
            .maybe_single()
            .execute()
        )
    res = await _run(_q)
    data = res.data if res else None
    return data.get("last_handled_message_id") if data else None


async def upsert_cursor(
    user_id: str, negotiation_id: str, message_id: str,
    vacancy_id: str | None = None, employer_name: str | None = None,
) -> None:
    row = {
        "user_id": user_id,
        "negotiation_id": negotiation_id,
        "last_handled_message_id": message_id,
        "last_polled_at": datetime.now(timezone.utc).isoformat(),
    }
    if vacancy_id is not None:
        row["vacancy_id"] = vacancy_id
    if employer_name is not None:
        row["employer_name"] = employer_name

    def _q():
        return (
            service_client.table("recruiter_chats")
            .upsert(row, on_conflict="user_id,negotiation_id")
            .execute()
        )
    await _run(_q)


async def insert_draft(
    user_id: str, negotiation_id: str, message_id: str, draft_text: str, reason: str
) -> None:
    def _q():
        return service_client.table("recruiter_drafts").insert({
            "user_id": user_id,
            "negotiation_id": negotiation_id,
            "message_id": message_id,
            "draft_text": draft_text,
            "reason": reason,
            "status": "pending",
        }).execute()
    await _run(_q)


async def insert_todo(
    user_id: str, negotiation_id: str, message_id: str,
    title: str, detail: str | None, link: str | None,
) -> None:
    def _q():
        return service_client.table("recruiter_todos").insert({
            "user_id": user_id,
            "negotiation_id": negotiation_id,
            "message_id": message_id,
            "title": title,
            "detail": detail,
            "link": link,
            "status": "open",
        }).execute()
    await _run(_q)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_service.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/recruiter.py backend/tests/test_recruiter_service.py
git commit -m "feat: recruiter chat persistence helpers"
```

---

## Task 5: Recruiter service — draft/todo query + send

**Files:**
- Modify: `backend/app/services/recruiter.py`
- Test: `backend/tests/test_recruiter_service.py`

- [ ] **Step 1: Write the failing tests**

Append:

```python
@pytest.mark.asyncio
async def test_list_pending_drafts():
    from app.services import recruiter
    chain = _fluent([{"id": "d1", "draft_text": "hi", "status": "pending"}])
    with patch.object(recruiter.service_client, "table", return_value=chain):
        rows = await recruiter.list_drafts("u1")
    assert rows[0]["id"] == "d1"
    chain.eq.assert_any_call("status", "pending")


@pytest.mark.asyncio
async def test_discard_draft_sets_status():
    from app.services import recruiter
    chain = _fluent([{"id": "d1"}])
    with patch.object(recruiter.service_client, "table", return_value=chain):
        await recruiter.discard_draft("u1", "d1")
    update = chain.update.call_args[0][0]
    assert update["status"] == "discarded"
    assert "resolved_at" in update


@pytest.mark.asyncio
async def test_mark_todo_done():
    from app.services import recruiter
    chain = _fluent([{"id": "t1"}])
    with patch.object(recruiter.service_client, "table", return_value=chain):
        await recruiter.mark_todo("u1", "t1", "done")
    update = chain.update.call_args[0][0]
    assert update["status"] == "done"
    assert "done_at" in update


@pytest.mark.asyncio
async def test_send_draft_posts_to_hh_and_marks_sent():
    from app.services import recruiter
    draft_chain = _fluent([{"id": "d1", "negotiation_id": "n9", "draft_text": "orig", "status": "pending"}])
    fake_client = MagicMock()
    fake_client.access_token = "tok"
    with patch.object(recruiter.service_client, "table", return_value=draft_chain), \
         patch.object(recruiter, "load_api_client", new=_async_return(fake_client)), \
         patch.object(recruiter, "persist_if_refreshed", new=_async_noop()):
        await recruiter.send_draft("u1", "d1", message="edited reply")
    fake_client.post.assert_called_once()
    endpoint, body = fake_client.post.call_args[0][0], fake_client.post.call_args[0][1]
    assert endpoint == "negotiations/n9/messages"
    assert body == {"message": "edited reply"}
    update = draft_chain.update.call_args[0][0]
    assert update["status"] == "sent"
```

Add these async helpers near the top of the test file (after imports):

```python
def _async_return(value):
    async def _f(*a, **k):
        return value
    return _f


def _async_noop():
    async def _f(*a, **k):
        return None
    return _f
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_service.py -k "list_pending or discard or mark_todo or send_draft" -v`
Expected: FAIL — missing `list_drafts`/`discard_draft`/`mark_todo`/`send_draft`

- [ ] **Step 3: Implement**

Append to `backend/app/services/recruiter.py`:

```python
async def list_drafts(user_id: str) -> list[dict]:
    def _q():
        return (
            service_client.table("recruiter_drafts")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
    res = await _run(_q)
    return res.data or []


async def list_todos(user_id: str) -> list[dict]:
    def _q():
        return (
            service_client.table("recruiter_todos")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "open")
            .order("created_at", desc=True)
            .execute()
        )
    res = await _run(_q)
    return res.data or []


async def discard_draft(user_id: str, draft_id: str) -> None:
    def _q():
        return (
            service_client.table("recruiter_drafts")
            .update({"status": "discarded", "resolved_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id).eq("id", draft_id)
            .execute()
        )
    await _run(_q)


async def mark_todo(user_id: str, todo_id: str, status: str) -> None:
    def _q():
        return (
            service_client.table("recruiter_todos")
            .update({"status": status, "done_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id).eq("id", todo_id)
            .execute()
        )
    await _run(_q)


async def _get_draft(user_id: str, draft_id: str) -> dict | None:
    def _q():
        return (
            service_client.table("recruiter_drafts")
            .select("*")
            .eq("user_id", user_id).eq("id", draft_id)
            .maybe_single()
            .execute()
        )
    res = await _run(_q)
    return res.data if res else None


async def send_draft(user_id: str, draft_id: str, message: str | None = None) -> None:
    """Send a draft reply to hh and mark it sent. `message` overrides draft_text."""
    draft = await _get_draft(user_id, draft_id)
    if not draft:
        raise ValueError(f"draft {draft_id} not found")
    text = message if message is not None else draft["draft_text"]
    nid = draft["negotiation_id"]

    client = await load_api_client(user_id)
    original = client.access_token
    try:
        await _run(lambda: client.post(f"negotiations/{nid}/messages", {"message": text}))
    finally:
        await persist_if_refreshed(user_id, client, original)

    def _q():
        return (
            service_client.table("recruiter_drafts")
            .update({"status": "sent", "resolved_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id).eq("id", draft_id)
            .execute()
        )
    await _run(_q)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_service.py -v`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/recruiter.py backend/tests/test_recruiter_service.py
git commit -m "feat: recruiter draft/todo query + send_draft"
```

---

## Task 6: System prompt builder

**Files:**
- Modify: `backend/app/ai/prompt.py`
- Test: `backend/tests/test_agent_recruiter.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_agent_recruiter.py`:

```python
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def test_build_recruiter_prompt_embeds_resume_and_rules():
    from app.ai.prompt import build_recruiter_prompt
    p = build_recruiter_prompt("Python dev, 3 года опыта")
    assert "Python dev, 3 года опыта" in p
    assert "send_message_recruiter" in p
    assert "escalate_to_human" in p
    assert "make_todo" in p
    # skip guidance present
    assert "Отказ" in p or "отказ" in p
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_agent_recruiter.py::test_build_recruiter_prompt_embeds_resume_and_rules -v`
Expected: FAIL — `ImportError: cannot import name 'build_recruiter_prompt'`

- [ ] **Step 3: Implement the prompt**

Replace the contents of `backend/app/ai/prompt.py` with:

```python
"""System prompts for the centralized HHAgent."""

RECRUITER_RULES = """\
Ты — ассистент соискателя, который ведёт переписку с рекрутёрами на hh.ru от его \
имени. У тебя есть резюме кандидата (ниже). Отвечай на русском (или на языке \
рекрутёра), кратко и вежливо, НИКОГДА не выдумывай опыт, которого нет в резюме.

Реши, что делать с последним сообщением рекрутёра, и вызови РОВНО ОДИН инструмент \
(или ни одного):

- send_message_recruiter(message): закрытый вопрос, ответ на который ЕСТЬ в резюме \
  (зарплатные ожидания, опыт, навыки, город, готовность к удалёнке). Отвечай прямо.
- escalate_to_human(draft, reason): всё неоднозначное — назначение собеседования, \
  запрос данных, которых нет в резюме, решение, которое должен принять человек. \
  draft — предлагаемый ответ, reason — кратко почему эскалируешь.
- make_todo(title, detail, link): рекрутёр просит сделать что-то ВНЕ hh — заполнить \
  гугл-форму, написать в Telegram, позвонить. link — URL формы/профиля, если он есть, \
  иначе пусто.
- НЕ вызывай инструмент вообще, если ответ не нужен: отказ, вакансия в архиве, \
  «резюме в обработке, свяжемся позже».

Примеры сообщений, на которые НЕ нужно отвечать (никаких инструментов):
- «...мы не готовы пригласить вас на следующий этап... Желаем успехов» (Отказ).
- «...сейчас мы не готовы продолжить общение по вакансии...» (Отказ).
- «Рассмотрим ваше резюме. Если подойдёт — свяжемся с вами.» (резюме в обработке).
- «Мы внимательно изучим резюме и позже вернёмся к вам.» (резюме в обработке).
"""

RECRUITER_SYSTEM_PROMPT = RECRUITER_RULES  # default (no resume) — kept non-empty


def build_recruiter_prompt(resume_summary: str) -> str:
    """Recruiter system prompt grounded in the candidate's resume summary."""
    resume = resume_summary.strip() or "(резюме недоступно)"
    return f"{RECRUITER_RULES}\n\nРезюме кандидата:\n{resume}\n"
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_agent_recruiter.py::test_build_recruiter_prompt_embeds_resume_and_rules -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/ai/prompt.py backend/tests/test_agent_recruiter.py
git commit -m "feat: recruiter system prompt builder"
```

---

## Task 7: Recruiter tools

**Files:**
- Create: `backend/app/ai/recruiter_tools.py`
- Test: `backend/tests/test_recruiter_tools.py`

`ToolRuntime` cannot be constructed by hand (it needs `state`, `config`,
`stream_writer`, `tool_call_id`, `store`) — it is injected by `create_agent` at
runtime (verified: injection works via `ainvoke(..., context=RecruiterContext(...))`).
So the tool bodies are thin adapters over plain async helpers `do_send` /
`do_escalate` / `do_todo` that take a `RecruiterContext`. Unit tests exercise the
helpers directly; the runtime injection path is covered end-to-end in Task 8.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_recruiter_tools.py`:

```python
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from unittest.mock import MagicMock, patch
import pytest


class _Spy:
    def __init__(self):
        self.calls = []
    async def __call__(self, *args, **kwargs):
        self.calls.append(args)
        return None


def _ctx(client=None):
    from app.ai.recruiter_tools import RecruiterContext
    return RecruiterContext(user_id="u1", negotiation_id="n9", message_id="m5",
                            client=client or MagicMock(access_token="tok"))


@pytest.mark.asyncio
async def test_do_send_posts_to_hh():
    from app.ai import recruiter_tools as rt
    ctx = _ctx()
    out = await rt.do_send(ctx, "Зарплата от 300к")
    ctx.client.post.assert_called_once_with("negotiations/n9/messages", {"message": "Зарплата от 300к"})
    assert out == "sent"


@pytest.mark.asyncio
async def test_do_escalate_inserts_draft_and_notifies():
    from app.ai import recruiter_tools as rt
    ins, notif = _Spy(), _Spy()
    with patch.object(rt.recruiter, "insert_draft", new=ins), patch.object(rt, "notify", new=notif):
        out = await rt.do_escalate(_ctx(), "Давайте во вторник", "scheduling")
    assert ins.calls[0] == ("u1", "n9", "m5", "Давайте во вторник", "scheduling")
    assert notif.calls[0][1] == "recruiter_draft"
    assert out == "escalated"


@pytest.mark.asyncio
async def test_do_todo_inserts_and_notifies():
    from app.ai import recruiter_tools as rt
    ins, notif = _Spy(), _Spy()
    with patch.object(rt.recruiter, "insert_todo", new=ins), patch.object(rt, "notify", new=notif):
        out = await rt.do_todo(_ctx(), "Заполнить форму", "до пятницы", "https://forms.gle/x")
    assert ins.calls[0] == ("u1", "n9", "m5", "Заполнить форму", "до пятницы", "https://forms.gle/x")
    assert notif.calls[0][1] == "recruiter_todo"
    assert out == "todo_created"


def test_recruiter_tools_list_has_three_tools():
    from app.ai.recruiter_tools import RECRUITER_TOOLS
    names = {t.name for t in RECRUITER_TOOLS}
    assert names == {"send_message_recruiter", "escalate_to_human", "make_todo"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_tools.py -v`
Expected: FAIL — `ModuleNotFoundError: app.ai.recruiter_tools`

- [ ] **Step 3: Implement the tools**

Create `backend/app/ai/recruiter_tools.py`:

```python
"""LangChain tools for the recruiter chat agent.

Tools perform their own side effects (hh POST / DB write). Per-chat data is
injected via ToolRuntime[RecruiterContext] and is hidden from the model.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from langchain.tools import ToolRuntime, tool

from app.hh.client import ApiClient
from app.services import recruiter
from app.services.notifications import notify


@dataclass
class RecruiterContext:
    user_id: str
    negotiation_id: str
    message_id: str
    client: ApiClient


# --- side-effect helpers (testable without a ToolRuntime) --------------------

async def do_send(ctx: RecruiterContext, message: str) -> str:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: ctx.client.post(f"negotiations/{ctx.negotiation_id}/messages", {"message": message}),
    )
    return "sent"


async def do_escalate(ctx: RecruiterContext, draft: str, reason: str) -> str:
    await recruiter.insert_draft(ctx.user_id, ctx.negotiation_id, ctx.message_id, draft, reason)
    await notify(ctx.user_id, "recruiter_draft", {"negotiation_id": ctx.negotiation_id})
    return "escalated"


async def do_todo(ctx: RecruiterContext, title: str, detail: str, link: str | None) -> str:
    await recruiter.insert_todo(ctx.user_id, ctx.negotiation_id, ctx.message_id, title, detail, link)
    await notify(ctx.user_id, "recruiter_todo", {"negotiation_id": ctx.negotiation_id, "title": title})
    return "todo_created"


# --- tools (thin adapters; runtime injected by create_agent) -----------------

@tool
async def send_message_recruiter(message: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Отправить ответ рекрутёру. Используй ТОЛЬКО когда вопрос закрытый и ответ
    уже есть в резюме кандидата."""
    return await do_send(runtime.context, message)


@tool
async def escalate_to_human(draft: str, reason: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Сохранить предлагаемый ответ как черновик для подтверждения пользователем.
    Используй для всего неоднозначного: собеседования, запросы данных не из резюме."""
    return await do_escalate(runtime.context, draft, reason)


@tool
async def make_todo(title: str, detail: str, link: str | None,
                    runtime: ToolRuntime[RecruiterContext]) -> str:
    """Создать задачу для действия ВНЕ hh — заполнить форму, написать в Telegram,
    позвонить. link — URL формы/профиля, если рекрутёр его дал, иначе None."""
    return await do_todo(runtime.context, title, detail, link)


RECRUITER_TOOLS = [send_message_recruiter, escalate_to_human, make_todo]
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_tools.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/ai/recruiter_tools.py backend/tests/test_recruiter_tools.py
git commit -m "feat: recruiter chat agent tools"
```

---

## Task 8: HHAgent — user-aware + answer_recruiter

**Files:**
- Modify: `backend/app/ai/agent.py`
- Test: `backend/tests/test_agent_recruiter.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_agent_recruiter.py`:

```python
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_answer_recruiter_skips_when_no_api_key():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    with patch("app.ai.agent.settings") as s:
        s.OPENAI_API_KEY = ""
        # should not build/invoke an agent
        agent._build_recruiter_agent = MagicMock(side_effect=AssertionError("must not build"))
        await agent.answer_recruiter("n1", "m1", [("user", "hi")], client=MagicMock())


@pytest.mark.asyncio
async def test_answer_recruiter_invokes_agent_with_context():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    fake_agent = MagicMock()
    fake_agent.ainvoke = AsyncMock(return_value={"messages": []})
    agent._recruiter_agent = fake_agent
    agent._resume_summary = "ready"  # skip resume load
    with patch("app.ai.agent.settings") as s:
        s.OPENAI_API_KEY = "sk-test"
        await agent.answer_recruiter("n9", "m5", [("user", "Какая зарплата?")], client=MagicMock(access_token="t"))
    _, kwargs = fake_agent.ainvoke.call_args
    assert kwargs["config"]["configurable"]["thread_id"] == "n9"
    ctx = kwargs["context"]
    assert ctx.negotiation_id == "n9" and ctx.message_id == "m5" and ctx.user_id == "u1"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_agent_recruiter.py -k answer_recruiter -v`
Expected: FAIL — `HHAgent.__init__()` takes no `user_id` / signature mismatch.

- [ ] **Step 3: Rewrite `agent.py`**

Replace `backend/app/ai/agent.py` with:

```python
"""Central AI interface for hh automation.

One HHAgent per worker runner (per user). Wraps a single langchain ChatOpenAI
(self.llm) shared by every AI path — form-test answers, cover letters, and the
recruiter chat agent. No per-call LLM construction.
"""

from __future__ import annotations

import logging

from langchain.agents import create_agent
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver

from app.ai.prompt import build_recruiter_prompt
from app.ai.recruiter_tools import RECRUITER_TOOLS, RecruiterContext
from app.config import settings
from app.services.cover_letter import generate as _generate_cover_letter
from app.services.form_filler import FillStatus, fill_form

logger = logging.getLogger(__name__)


class HHAgent:
    """Single entry point for all LLM work. Construct once per runner/user."""

    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        # ChatOpenAI raises without an api key; empty key → fallback paths use None.
        self.llm = (
            ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                model=settings.OPENAI_MODEL,
                rate_limiter=InMemoryRateLimiter(
                    requests_per_second=settings.OPENAI_RATE_LIMIT / 60.0
                ),
            )
            if settings.OPENAI_API_KEY
            else None
        )
        self._recruiter_agent = None
        self._resume_summary: str | None = None

    async def write_form_answers(
        self, user_id: str, resume_id: str, vacancy: dict
    ) -> tuple[FillStatus, list[dict]]:
        """Solve a vacancy test and submit. Returns (status, per-task answers)."""
        return await fill_form(self.llm, user_id, resume_id, vacancy)

    async def write_cover_letter(
        self, user_id: str, vacancy: dict, resume: dict, resume_uuid: str
    ) -> str:
        """Cover letter text. PG cache → self.llm → fallback template."""
        return await _generate_cover_letter(
            self.llm,
            user_id=user_id,
            vacancy=vacancy,
            resume=resume,
            resume_uuid=resume_uuid,
        )

    async def _load_resume_summary(self) -> str:
        if self._resume_summary is not None:
            return self._resume_summary
        from app.services.form_filler import _resume_summary, load_resume
        try:
            resume = await load_resume(self.user_id)
            self._resume_summary = _resume_summary(resume)
        except Exception:
            logger.warning("recruiter: resume load failed for %s — ungrounded", self.user_id, exc_info=True)
            self._resume_summary = ""
        return self._resume_summary

    def _build_recruiter_agent(self, system_prompt: str):
        return create_agent(
            self.llm,
            tools=RECRUITER_TOOLS,
            system_prompt=system_prompt,
            context_schema=RecruiterContext,
            checkpointer=InMemorySaver(),
        )

    async def answer_recruiter(
        self, negotiation_id: str, message_id: str,
        history: list[tuple[str, str]], client,
    ) -> None:
        """Decide + act on the latest recruiter message via tools (send/escalate/
        todo) or no-op. Conversation memory keyed by negotiation_id."""
        if not settings.OPENAI_API_KEY:
            logger.info("recruiter: no OPENAI_API_KEY — skipping chat %s", negotiation_id)
            return
        if self._recruiter_agent is None:
            summary = await self._load_resume_summary()
            self._recruiter_agent = self._build_recruiter_agent(build_recruiter_prompt(summary))
        ctx = RecruiterContext(self.user_id, negotiation_id, message_id, client)
        await self._recruiter_agent.ainvoke(
            {"messages": history},
            config={"configurable": {"thread_id": negotiation_id}},
            context=ctx,
        )
```

> Note: `form_filler._resume_summary` is reused (do not duplicate). The recruiter
> agent is built lazily on the first chat so a runner with no recruiter activity
> never pays the resume-load cost.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_agent_recruiter.py -v`
Expected: PASS

- [ ] **Step 5: Verify no other HHAgent construction site broke**

Run: `cd backend && grep -rn "HHAgent(" app/ tests/`
Expected: only `worker/runner.py` constructs it (fixed in Task 9) and type-hint imports in `apply.py`. If a test constructs `HHAgent()`, update it to `HHAgent("test-user")`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/ai/agent.py backend/tests/test_agent_recruiter.py
git commit -m "feat: user-aware HHAgent with recruiter chat agent"
```

---

## Task 9: Poller orchestrator + runner wiring

**Files:**
- Create: `backend/app/worker/recruiter_poll.py`
- Modify: `backend/app/worker/runner.py:46-58` (`RunnerHandle`), and the loop body around `:215`
- Test: `backend/tests/test_recruiter_poll.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_recruiter_poll.py`:

```python
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _client_with(negotiations, messages):
    client = MagicMock()
    client.access_token = "tok"
    def _get(endpoint, **kw):
        if endpoint == "negotiations":
            return {"items": negotiations}
        if endpoint.endswith("/messages"):
            return {"items": messages}
        return {}
    client.get.side_effect = _get
    return client


@pytest.mark.asyncio
async def test_poll_invokes_agent_and_advances_cursor():
    from app.worker import recruiter_poll as rp
    negotiations = [{"id": "n9", "counters": {"unread_messages": 1},
                     "vacancy": {"id": "v1", "employer": {"name": "Acme"}}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"}, "text": "Какая зарплата?"}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock()

    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()) as upsert:
        await rp.poll_recruiter_chats("u1", agent)

    agent.answer_recruiter.assert_awaited_once()
    args = agent.answer_recruiter.await_args
    assert args.args[0] == "n9" and args.args[1] == "m5"
    upsert.assert_awaited_once()
    assert upsert.await_args.args[2] == "m5"  # cursor = handled message id


@pytest.mark.asyncio
async def test_poll_skips_already_handled():
    from app.worker import recruiter_poll as rp
    negotiations = [{"id": "n9", "counters": {"unread_messages": 1}, "vacancy": {}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"}, "text": "hi"}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock()
    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value="m5")), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()):
        await rp.poll_recruiter_chats("u1", agent)
    agent.answer_recruiter.assert_not_awaited()


@pytest.mark.asyncio
async def test_poll_swallows_send_error_keeps_cursor():
    from app.worker import recruiter_poll as rp
    negotiations = [{"id": "n9", "counters": {"unread_messages": 1}, "vacancy": {}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"}, "text": "hi"}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock(side_effect=RuntimeError("boom"))
    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()) as upsert:
        await rp.poll_recruiter_chats("u1", agent)  # must not raise
    upsert.assert_not_awaited()  # error → cursor NOT advanced (retry next poll)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_poll.py -v`
Expected: FAIL — `ModuleNotFoundError: app.worker.recruiter_poll`

- [ ] **Step 3: Implement the poller**

Create `backend/app/worker/recruiter_poll.py`:

```python
"""Poll recruiter chats and run the AI agent. Called once per runner loop iter."""

from __future__ import annotations

import asyncio
import logging
import random

from app.services import recruiter
from app.services.hh_credentials import load_api_client, persist_if_refreshed
from app.worker import throttle

logger = logging.getLogger(__name__)
_rng = random.Random()


async def poll_recruiter_chats(user_id: str, agent) -> None:
    """Fetch negotiations with unread messages; for each new employer message,
    invoke the agent. Errors are logged and never crash the runner loop."""
    loop = asyncio.get_running_loop()
    try:
        client = await load_api_client(user_id)
    except Exception:
        logger.warning("recruiter poll: cannot load creds for %s", user_id, exc_info=True)
        return
    original = client.access_token
    try:
        try:
            data = await loop.run_in_executor(
                None,
                lambda: client.get("negotiations", order_by="updated", order="desc", per_page=50),
            )
        except Exception:
            logger.warning("recruiter poll: list negotiations failed for %s", user_id, exc_info=True)
            return

        for item in data.get("items", []):
            if (item.get("counters") or {}).get("unread_messages", 0) <= 0:
                continue
            await _process_chat(user_id, agent, client, item)
            await asyncio.sleep(throttle.next_delay(_rng))
    finally:
        await persist_if_refreshed(user_id, client, original)


async def _process_chat(user_id: str, agent, client, item: dict) -> None:
    nid = str(item["id"])
    vacancy = item.get("vacancy") or {}
    vacancy_id = vacancy.get("id")
    employer_name = (vacancy.get("employer") or {}).get("name")
    loop = asyncio.get_running_loop()
    try:
        cursor = await recruiter.get_cursor(user_id, nid)
        msgs = await loop.run_in_executor(
            None, lambda: client.get(f"negotiations/{nid}/messages", with_text_only="true")
        )
        items = msgs.get("items", [])
        target = recruiter.new_employer_message(items, cursor)
        if target is None:
            return
        history = recruiter.to_lc_messages(items)
        await agent.answer_recruiter(nid, str(target["id"]), history, client)
        await recruiter.upsert_cursor(
            user_id, nid, str(target["id"]), vacancy_id=vacancy_id, employer_name=employer_name
        )
    except Exception:
        # Do NOT advance the cursor — retry on the next poll.
        logger.warning("recruiter poll: chat %s failed for %s", nid, user_id, exc_info=True)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_poll.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire into the runner**

In `backend/app/worker/runner.py`:

(a) Add the import near the other worker imports (after line 29):

```python
from app.worker.recruiter_poll import poll_recruiter_chats
```

(b) Replace the `agent` field + add `__post_init__` in `RunnerHandle` (lines 46-58). Change:

```python
    agent: HHAgent = field(default_factory=HHAgent)
```

to:

```python
    agent: HHAgent | None = None

    def __post_init__(self) -> None:
        if self.agent is None:
            self.agent = HHAgent(self.user_id)
```

(c) In `_run_loop`, after the "Refill queue when empty" block and before the
"Session cluster break" block (i.e. right after line 233's `continue` block ends,
around line 234), add a recruiter poll step:

```python
        # Recruiter chats — answer / escalate / todo for new employer messages.
        try:
            await poll_recruiter_chats(user_id, handle.agent)
        except Exception:
            logger.exception("recruiter poll failed for %s", user_id)
```

- [ ] **Step 6: Verify runner imports + existing worker tests pass**

Run: `cd backend && .venv/bin/python -c "from app.worker import runner; print('ok')" && .venv/bin/python -m pytest tests/ -k "worker or runner" -v`
Expected: `ok` then PASS (no regressions). If a worker test built `RunnerHandle(...)` and asserted `agent` identity, it still works (agent built in `__post_init__`).

- [ ] **Step 7: Commit**

```bash
git add backend/app/worker/recruiter_poll.py backend/app/worker/runner.py backend/tests/test_recruiter_poll.py
git commit -m "feat: poll recruiter chats in runner loop"
```

---

## Task 10: API endpoints + schemas

**Files:**
- Create: `backend/app/schemas/recruiter.py`, `backend/app/api/recruiter.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_recruiter_api.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_recruiter_api.py`:

```python
import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    from app.api.deps import get_current_user
    app.dependency_overrides[get_current_user] = lambda: "u1"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_drafts(client):
    with patch("app.api.recruiter.recruiter.list_drafts", new=AsyncMock(return_value=[{"id": "d1"}])):
        r = client.get("/api/recruiter/drafts")
    assert r.status_code == 200
    assert r.json()[0]["id"] == "d1"


def test_send_draft(client):
    with patch("app.api.recruiter.recruiter.send_draft", new=AsyncMock()) as send:
        r = client.post("/api/recruiter/drafts/d1/send", json={"message": "edited"})
    assert r.status_code == 200
    send.assert_awaited_once_with("u1", "d1", message="edited")


def test_discard_draft(client):
    with patch("app.api.recruiter.recruiter.discard_draft", new=AsyncMock()) as disc:
        r = client.post("/api/recruiter/drafts/d1/discard")
    assert r.status_code == 200
    disc.assert_awaited_once_with("u1", "d1")


def test_list_todos(client):
    with patch("app.api.recruiter.recruiter.list_todos", new=AsyncMock(return_value=[{"id": "t1"}])):
        r = client.get("/api/recruiter/todos")
    assert r.status_code == 200
    assert r.json()[0]["id"] == "t1"


def test_todo_done(client):
    with patch("app.api.recruiter.recruiter.mark_todo", new=AsyncMock()) as mt:
        r = client.post("/api/recruiter/todos/t1/done")
    assert r.status_code == 200
    mt.assert_awaited_once_with("u1", "t1", "done")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_api.py -v`
Expected: FAIL — 404s (router not mounted) / import error.

- [ ] **Step 3: Implement schemas + endpoints**

Create `backend/app/schemas/recruiter.py`:

```python
from __future__ import annotations

from pydantic import BaseModel


class SendDraftRequest(BaseModel):
    message: str | None = None


class OkResponse(BaseModel):
    ok: bool = True
```

Create `backend/app/api/recruiter.py`:

```python
"""Recruiter chat agent endpoints — draft approval + todo management."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.schemas.recruiter import OkResponse, SendDraftRequest
from app.services import recruiter

router = APIRouter(prefix="/api/recruiter", tags=["recruiter"])


@router.get("/drafts")
async def list_drafts(user_id: str = Depends(get_current_user)) -> list[dict]:
    return await recruiter.list_drafts(user_id)


@router.post("/drafts/{draft_id}/send", response_model=OkResponse)
async def send_draft(
    draft_id: str, body: SendDraftRequest, user_id: str = Depends(get_current_user)
) -> OkResponse:
    await recruiter.send_draft(user_id, draft_id, message=body.message)
    return OkResponse()


@router.post("/drafts/{draft_id}/discard", response_model=OkResponse)
async def discard_draft(draft_id: str, user_id: str = Depends(get_current_user)) -> OkResponse:
    await recruiter.discard_draft(user_id, draft_id)
    return OkResponse()


@router.get("/todos")
async def list_todos(user_id: str = Depends(get_current_user)) -> list[dict]:
    return await recruiter.list_todos(user_id)


@router.post("/todos/{todo_id}/done", response_model=OkResponse)
async def todo_done(todo_id: str, user_id: str = Depends(get_current_user)) -> OkResponse:
    await recruiter.mark_todo(user_id, todo_id, "done")
    return OkResponse()


@router.post("/todos/{todo_id}/dismiss", response_model=OkResponse)
async def todo_dismiss(todo_id: str, user_id: str = Depends(get_current_user)) -> OkResponse:
    await recruiter.mark_todo(user_id, todo_id, "dismissed")
    return OkResponse()
```

Modify `backend/app/api/router.py` — add `recruiter` to the import and include it:

```python
from app.api import auth, billing, blacklist, captcha, filters, internal, recruiter, resumes, webhooks, worker
```

```python
api_router.include_router(recruiter.router)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_recruiter_api.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/recruiter.py backend/app/api/recruiter.py backend/app/api/router.py backend/tests/test_recruiter_api.py
git commit -m "feat: recruiter drafts/todos API"
```

---

## Task 11: Full backend test sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: all green, including the 5 new test files. Fix any regression (most likely an
old test that built `HHAgent()` without a user_id — update to `HHAgent("test-user")`).

- [ ] **Step 2: Commit any fixups**

```bash
git add -A && git commit -m "test: fix HHAgent construction in existing tests"
```

(Skip the commit if nothing changed.)

---

## Task 12: Frontend inbox (drafts + todos)

No frontend test harness exists; verify with the type-check/build.

**Files:**
- Create: `frontend/src/hooks/useRecruiter.ts`, `frontend/src/app/(app)/recruiter/page.tsx`

- [ ] **Step 1: Implement the data hook**

Create `frontend/src/hooks/useRecruiter.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type Draft = {
  id: string;
  negotiation_id: string;
  draft_text: string;
  reason: string | null;
  created_at: string;
};

export type Todo = {
  id: string;
  negotiation_id: string;
  title: string;
  detail: string | null;
  link: string | null;
  created_at: string;
};

export function useRecruiter() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [d, t] = await Promise.all([
      apiFetch("/api/recruiter/drafts"),
      apiFetch("/api/recruiter/todos"),
    ]);
    setDrafts(await d.json());
    setTodos(await t.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sendDraft = useCallback(
    async (id: string, message: string) => {
      await apiFetch(`/api/recruiter/drafts/${id}/send`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      await refresh();
    },
    [refresh],
  );

  const discardDraft = useCallback(
    async (id: string) => {
      await apiFetch(`/api/recruiter/drafts/${id}/discard`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  const resolveTodo = useCallback(
    async (id: string, action: "done" | "dismiss") => {
      await apiFetch(`/api/recruiter/todos/${id}/${action}`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  return { drafts, todos, loading, refresh, sendDraft, discardDraft, resolveTodo };
}
```

> Confirm the `apiFetch` signature in `frontend/src/lib/api.ts` (it attaches the
> Supabase JWT). If it returns parsed JSON rather than a `Response`, drop the
> `await x.json()` calls accordingly.

- [ ] **Step 2: Implement the page**

Create `frontend/src/app/(app)/recruiter/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRecruiter, type Draft } from "@/hooks/useRecruiter";

function DraftCard({
  draft,
  onSend,
  onDiscard,
}: {
  draft: Draft;
  onSend: (id: string, msg: string) => void;
  onDiscard: (id: string) => void;
}) {
  const [text, setText] = useState(draft.draft_text);
  return (
    <div className="rounded-lg border p-4 space-y-2">
      {draft.reason && <p className="text-sm text-muted-foreground">Причина: {draft.reason}</p>}
      <textarea
        className="w-full rounded border p-2 text-sm"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="rounded bg-black px-3 py-1 text-sm text-white" onClick={() => onSend(draft.id, text)}>
          Отправить
        </button>
        <button className="rounded border px-3 py-1 text-sm" onClick={() => onDiscard(draft.id)}>
          Отклонить
        </button>
      </div>
    </div>
  );
}

export default function RecruiterPage() {
  const { drafts, todos, loading, sendDraft, discardDraft, resolveTodo } = useRecruiter();

  if (loading) return <div className="p-6">Загрузка…</div>;

  return (
    <div className="space-y-8 p-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Черновики ответов ({drafts.length})</h2>
        {drafts.length === 0 && <p className="text-sm text-muted-foreground">Нет черновиков.</p>}
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} onSend={sendDraft} onDiscard={discardDraft} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Задачи ({todos.length})</h2>
        {todos.length === 0 && <p className="text-sm text-muted-foreground">Нет задач.</p>}
        {todos.map((t) => (
          <div key={t.id} className="rounded-lg border p-4 space-y-1">
            <p className="font-medium">{t.title}</p>
            {t.detail && <p className="text-sm">{t.detail}</p>}
            {t.link && (
              <a className="text-sm text-blue-600 underline" href={t.link} target="_blank" rel="noreferrer">
                {t.link}
              </a>
            )}
            <div className="flex gap-2 pt-1">
              <button className="rounded bg-black px-3 py-1 text-sm text-white" onClick={() => resolveTodo(t.id, "done")}>
                Готово
              </button>
              <button className="rounded border px-3 py-1 text-sm" onClick={() => resolveTodo(t.id, "dismiss")}>
                Скрыть
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build / type-check**

Run: `cd frontend && npm run build`
Expected: build succeeds, `/recruiter` route compiled. Fix any type mismatch against the
real `apiFetch` and the app's UI conventions (className tokens, layout wrapper).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useRecruiter.ts "frontend/src/app/(app)/recruiter/page.tsx"
git commit -m "feat(frontend): recruiter drafts + todos inbox"
```

> Adding the page to the sidebar nav is optional polish — check
> `frontend/src/components/otclick/` for the sidebar and add a `/recruiter` link if
> the project wants it surfaced there.

---

## Self-Review notes (spec coverage)

- send / escalate / make_todo / skip — Tasks 7 (tools), 6 (prompt rules), 8 (routing).
- per-chat thread_id memory — Task 8 (`config.thread_id = negotiation_id`, `InMemorySaver`).
- resume grounding — Task 8 (`_load_resume_summary` + `build_recruiter_prompt`).
- dedup via `last_handled_message_id` — Tasks 4 (cursor helpers) + 9 (poller advances on success only).
- code pre-filter of non-employer / empty messages — Task 3 (`new_employer_message`).
- skip few-shot examples — Task 6 (prompt embeds the real samples from the spec appendix).
- 3 tables + RLS — Task 1.
- drafts/todos API — Task 10.
- notifications — Task 7 (emits) + Task 2 (types).
- frontend surface — Task 12.
- empty OPENAI_API_KEY no-op — Task 8.
- hh send failure keeps cursor — Task 9 (`test_poll_swallows_send_error_keeps_cursor`).
- future Postgres checkpointer — single line in `_build_recruiter_agent` (out of scope, noted in spec).
