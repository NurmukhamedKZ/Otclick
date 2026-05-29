# AI Vacancy Relevance Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop clearly-irrelevant vacancies (semantic mismatch vs the candidate's resume) before they reach the apply queue, via a batched, cached LLM check gated per filter.

**Architecture:** A new `services/relevance.py` exposes a pure batch classifier (`filter_relevant`) plus cache read/write helpers. `HHAgent` gains `filter_relevant_vacancies`, grounding the classifier in the filter's resume summary. `vacancy_producer.produce_jobs` collects mechanically-surviving items per page, consults a new `relevance_cache` table, calls the agent only on uncached items, and queues only the relevant ones. A per-filter `ai_filter_enabled` flag (default true) gates the whole step. Fail-open everywhere.

**Tech Stack:** Python 3.13, FastAPI, langchain `ChatOpenAI`, Supabase (service_role), pytest/pytest-asyncio, Next.js/React/TypeScript frontend.

Reference spec: `docs/superpowers/specs/2026-05-29-ai-vacancy-relevance-filter-design.md`

---

## File Structure

- **Create** `infra/supabase/migrations/015_relevance_cache.sql` — cache table + `filters.ai_filter_enabled`.
- **Create** `backend/app/services/relevance.py` — `filter_relevant` classifier + cache helpers.
- **Create** `backend/tests/test_relevance.py` — classifier + cache unit tests.
- **Modify** `backend/app/ai/prompts.py` — `build_relevance_prompt`.
- **Modify** `backend/app/ai/agent.py` — `filter_relevant_vacancies` + per-resume summary cache.
- **Modify** `backend/app/services/vacancy_producer.py` — wire relevance into the per-page loop; `agent` param; select `ai_filter_enabled`.
- **Modify** `backend/app/worker/runner.py:246` — pass `handle.agent` to `produce_jobs`.
- **Modify** `backend/tests/test_vacancy_producer.py` — relevance drop / cache-hit / bypass tests.
- **Modify** `backend/app/schemas/filters.py` — `ai_filter_enabled` on Create/Update/Response.
- **Modify** `backend/app/services/filters_service.py` — `_FILTER_COLUMNS` add `ai_filter_enabled`.
- **Modify** `frontend/src/lib/types.ts` — `ai_filter_enabled` on `Filter` + `FilterCreate`.
- **Modify** `frontend/src/components/filters-drawer.tsx` — Toggle in `FilterEditor`.

---

## Task 1: Migration — relevance_cache table + ai_filter_enabled column

**Files:**
- Create: `infra/supabase/migrations/015_relevance_cache.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 015_relevance_cache.sql
-- AI vacancy relevance verdicts cache + per-filter toggle.

create table if not exists relevance_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  resume_id uuid references resumes(id) on delete cascade,
  vacancy_id text not null,
  relevant bool not null,
  reason text,
  created_at timestamptz default now(),
  unique (resume_id, vacancy_id)
);

create index if not exists relevance_cache_lookup
  on relevance_cache (resume_id, vacancy_id);

alter table relevance_cache enable row level security;
-- service_role only; no policies = full RLS denial (matches form_drafts).

alter table filters add column if not exists ai_filter_enabled bool default true;
```

- [ ] **Step 2: Apply the migration**

Apply via the project's normal migration path (Supabase MCP `apply_migration` or `psql` against the project). Confirm the table and column exist:

Run (psql) or MCP `list_tables`:
```sql
select column_name from information_schema.columns where table_name = 'filters' and column_name = 'ai_filter_enabled';
select to_regclass('public.relevance_cache');
```
Expected: one row `ai_filter_enabled`; `relevance_cache` non-null.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/015_relevance_cache.sql
git commit -m "feat: relevance_cache table + filters.ai_filter_enabled (migration 015)"
```

---

## Task 2: Relevance classifier + prompt builder

The classifier is a pure function: takes an llm, a resume summary, and a list of candidate items; returns a verdict per vacancy id. Conservative + fail-open.

**Files:**
- Create: `backend/app/services/relevance.py`
- Modify: `backend/app/ai/prompts.py`
- Test: `backend/tests/test_relevance.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_relevance.py`:

```python
import os
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

ITEMS = [
    {"id": "v1", "name": "AI Engineer", "snippet_requirement": "LLM, Python",
     "snippet_responsibility": "build models"},
    {"id": "v2", "name": "Sales Manager", "snippet_requirement": "продажи",
     "snippet_responsibility": "звонки клиентам"},
]


def _llm(content: str):
    chat = MagicMock()
    chat.invoke.return_value = MagicMock(content=content)
    return chat


def test_marks_listed_irrelevant_rest_relevant():
    from app.services.relevance import filter_relevant
    llm = _llm('{"irrelevant": [{"id": "v2", "reason": "sales, not AI"}]}')
    verdicts = filter_relevant(llm, "AI engineer resume", ITEMS)
    assert verdicts["v1"][0] is True
    assert verdicts["v2"][0] is False
    assert verdicts["v2"][1] == "sales, not AI"


def test_empty_response_keeps_all():
    from app.services.relevance import filter_relevant
    llm = _llm('{"irrelevant": []}')
    verdicts = filter_relevant(llm, "resume", ITEMS)
    assert all(v[0] for v in verdicts.values())


def test_malformed_json_fails_open():
    from app.services.relevance import filter_relevant
    llm = _llm("not json at all")
    verdicts = filter_relevant(llm, "resume", ITEMS)
    assert all(v[0] for v in verdicts.values())
    assert verdicts["v1"][1] == "fail_open"


def test_no_llm_fails_open():
    from app.services.relevance import filter_relevant
    verdicts = filter_relevant(None, "resume", ITEMS)
    assert all(v[0] for v in verdicts.values())


def test_empty_items_returns_empty():
    from app.services.relevance import filter_relevant
    assert filter_relevant(_llm("{}"), "resume", []) == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_relevance.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.relevance'`.

- [ ] **Step 3: Add the prompt builder**

Append to `backend/app/ai/prompts.py`:

```python
# --- vacancy relevance ------------------------------------------------------

def build_relevance_prompt(resume_summary: str, items_block: str) -> str:
    """Classify which vacancies clearly do NOT match the candidate's resume.

    Conservative: only flag clear mismatches; when in doubt, keep (omit)."""
    return (
        "Ты фильтруешь вакансии для кандидата по его резюме. Твоя задача — "
        "найти ТОЛЬКО те вакансии, которые ЯВНО НЕ подходят кандидату по сути "
        "(другая профессия/специализация: например AI-инженеру не подходят "
        "'Менеджер по продажам', 'Android-разработчик', 'Бухгалтер').\n"
        "ПРАВИЛО: сомневаешься — НЕ помечай (оставь). Помечай только очевидные "
        "несовпадения профессии.\n\n"
        f"Резюме кандидата:\n{resume_summary or '(нет данных)'}\n\n"
        f"Вакансии:\n{items_block}\n\n"
        'Верни СТРОГО JSON без пояснений в формате: '
        '{"irrelevant": [{"id": "<id>", "reason": "<кратко почему>"}]}. '
        "Если все подходят — верни {\"irrelevant\": []}."
    )
```

- [ ] **Step 4: Write the classifier**

Create `backend/app/services/relevance.py`:

```python
"""Batch semantic relevance filter for found vacancies.

filter_relevant: pure classifier (llm + resume summary + items) → per-id verdict.
Conservative (only clear mismatches dropped) and fail-open (any failure → keep all).
Cache helpers persist verdicts in relevance_cache (service_role).
"""

from __future__ import annotations

import json
import logging
import re

from app.ai.prompts import build_relevance_prompt
from app.db.supabase import service_client

logger = logging.getLogger(__name__)

# verdict = (relevant: bool, reason: str)
Verdict = tuple[bool, str]

_JSON_OBJ = re.compile(r"\{.*\}", re.DOTALL)


def _llm_text(llm, prompt: str) -> str:
    content = llm.invoke(prompt).content
    if isinstance(content, list):  # some models return content parts
        content = " ".join(str(c) for c in content)
    return (content or "").strip()


def filter_relevant(llm, resume_summary: str, items: list[dict]) -> dict[str, Verdict]:
    """Return {vacancy_id: (relevant, reason)} for each item.

    items carry {id, name, snippet_requirement, snippet_responsibility}.
    Conservative: an id is irrelevant only if the LLM explicitly lists it.
    Fail-open: no llm / parse error / exception → every item relevant.
    """
    if not items:
        return {}
    ids = [str(it["id"]) for it in items if it.get("id")]
    if not llm:
        return {vid: (True, "fail_open") for vid in ids}

    lines = []
    for it in items:
        vid = str(it.get("id") or "")
        if not vid:
            continue
        ctx = " ".join(filter(None, [
            it.get("name") or "",
            it.get("snippet_requirement") or "",
            it.get("snippet_responsibility") or "",
        ]))
        lines.append(f"- id={vid}: {ctx}")
    prompt = build_relevance_prompt(resume_summary, "\n".join(lines))

    try:
        raw = _llm_text(llm, prompt)
        match = _JSON_OBJ.search(raw)
        parsed = json.loads(match.group(0) if match else raw)
        irrelevant = {
            str(e["id"]): str(e.get("reason") or "")
            for e in parsed.get("irrelevant", [])
            if isinstance(e, dict) and e.get("id") is not None
        }
    except Exception:
        logger.warning("relevance: LLM parse failed — fail-open (keep all)", exc_info=True)
        return {vid: (True, "fail_open") for vid in ids}

    return {
        vid: ((False, irrelevant[vid]) if vid in irrelevant else (True, ""))
        for vid in ids
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_relevance.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/relevance.py backend/app/ai/prompts.py backend/tests/test_relevance.py
git commit -m "feat: vacancy relevance classifier + prompt"
```

---

## Task 3: Cache read/write helpers

**Files:**
- Modify: `backend/app/services/relevance.py`
- Test: `backend/tests/test_relevance.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_relevance.py`:

```python
from types import SimpleNamespace
from unittest.mock import patch


def _cache_chain(final_data):
    c = MagicMock()
    for m in ("select", "eq", "in_", "upsert"):
        getattr(c, m).return_value = c
    c.execute.return_value = SimpleNamespace(data=final_data)
    return c


def test_get_cached_verdicts_maps_rows():
    from app.services import relevance
    rows = [
        {"vacancy_id": "v1", "relevant": True, "reason": ""},
        {"vacancy_id": "v2", "relevant": False, "reason": "sales"},
    ]
    chain = _cache_chain(rows)
    with patch.object(relevance.service_client, "table", return_value=chain):
        out = relevance.get_cached_verdicts("r1", ["v1", "v2"])
    assert out["v1"] == (True, "")
    assert out["v2"] == (False, "sales")


def test_get_cached_verdicts_empty_ids():
    from app.services import relevance
    assert relevance.get_cached_verdicts("r1", []) == {}


def test_store_verdicts_upserts_rows():
    from app.services import relevance
    chain = _cache_chain([])
    with patch.object(relevance.service_client, "table", return_value=chain):
        relevance.store_verdicts("u1", "r1", {"v2": (False, "sales")})
    chain.upsert.assert_called_once()
    rows = chain.upsert.call_args[0][0]
    assert rows[0]["vacancy_id"] == "v2"
    assert rows[0]["relevant"] is False
    assert rows[0]["resume_id"] == "r1"
    assert rows[0]["user_id"] == "u1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_relevance.py -k cache -v`
Expected: FAIL with `AttributeError: module 'app.services.relevance' has no attribute 'get_cached_verdicts'`.

- [ ] **Step 3: Add the cache helpers**

Append to `backend/app/services/relevance.py`:

```python
def get_cached_verdicts(resume_id: str, vacancy_ids: list[str]) -> dict[str, Verdict]:
    """Read cached relevance verdicts for these vacancies. Empty on any failure."""
    if not vacancy_ids:
        return {}
    try:
        res = (
            service_client.table("relevance_cache")
            .select("vacancy_id,relevant,reason")
            .eq("resume_id", resume_id)
            .in_("vacancy_id", vacancy_ids)
            .execute()
        )
    except Exception:
        logger.warning("relevance: cache read failed — treating as miss", exc_info=True)
        return {}
    return {
        r["vacancy_id"]: (bool(r["relevant"]), r.get("reason") or "")
        for r in (res.data or [])
    }


def store_verdicts(user_id: str, resume_id: str, verdicts: dict[str, Verdict]) -> None:
    """Persist verdicts to relevance_cache (idempotent upsert). Never raises."""
    if not verdicts:
        return
    rows = [
        {
            "user_id": user_id,
            "resume_id": resume_id,
            "vacancy_id": vid,
            "relevant": relevant,
            "reason": reason or None,
        }
        for vid, (relevant, reason) in verdicts.items()
    ]
    try:
        service_client.table("relevance_cache").upsert(
            rows, on_conflict="resume_id,vacancy_id"
        ).execute()
    except Exception:
        logger.warning("relevance: cache write failed", exc_info=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_relevance.py -v`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/relevance.py backend/tests/test_relevance.py
git commit -m "feat: relevance cache read/write helpers"
```

---

## Task 4: HHAgent.filter_relevant_vacancies

Route the classifier through the centralized agent, grounded in the filter's resume summary (cached per `resume_id`).

**Files:**
- Modify: `backend/app/ai/agent.py`
- Test: `backend/tests/test_agent_relevance.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_agent_relevance.py`:

```python
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

ITEMS = [
    {"id": "v1", "name": "AI Engineer", "snippet_requirement": "", "snippet_responsibility": ""},
    {"id": "v2", "name": "Sales Manager", "snippet_requirement": "", "snippet_responsibility": ""},
]


@pytest.mark.asyncio
async def test_filter_relevant_vacancies_grounds_and_classifies():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    agent.llm = MagicMock()  # ensure non-None even without API key
    with patch("app.services.form_filler.load_resume",
               new=AsyncMock(return_value={"title": "AI Engineer"})), \
         patch("app.services.form_filler._resume_summary",
               return_value="AI engineer resume"), \
         patch("app.ai.agent.filter_relevant",
               return_value={"v1": (True, ""), "v2": (False, "sales")}) as fr:
        out = await agent.filter_relevant_vacancies("r1", ITEMS)
    assert out["v2"][0] is False
    # grounded in the loaded summary
    assert fr.call_args[0][1] == "AI engineer resume"


@pytest.mark.asyncio
async def test_filter_relevant_vacancies_caches_summary_per_resume():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    agent.llm = MagicMock()
    load = AsyncMock(return_value={"title": "AI Engineer"})
    with patch("app.services.form_filler.load_resume", new=load), \
         patch("app.services.form_filler._resume_summary", return_value="sum"), \
         patch("app.ai.agent.filter_relevant", return_value={}):
        await agent.filter_relevant_vacancies("r1", ITEMS)
        await agent.filter_relevant_vacancies("r1", ITEMS)
    assert load.await_count == 1  # second call uses cached summary
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_agent_relevance.py -v`
Expected: FAIL with `AttributeError: 'HHAgent' object has no attribute 'filter_relevant_vacancies'`.

- [ ] **Step 3: Add the method + per-resume summary cache**

In `backend/app/ai/agent.py`, add the import near the top (with the other `app.services` imports):

```python
from app.services.relevance import Verdict, filter_relevant
```

In `HHAgent.__init__`, after `self._full_resumes: dict[str, dict] = {}`, add:

```python
        self._relevance_summaries: dict[str, str] = {}
```

Add these methods to `HHAgent` (e.g. after `write_cover_letter`):

```python
    async def filter_relevant_vacancies(
        self, resume_id: str, items: list[dict]
    ) -> dict[str, Verdict]:
        """Per-vacancy relevance verdicts grounded in the filter's resume.

        items: {id, name, snippet_requirement, snippet_responsibility}.
        Fail-open: no llm → all relevant (handled inside filter_relevant)."""
        summary = await self._summary_for(resume_id)
        return filter_relevant(self.llm, summary, items)

    async def _summary_for(self, resume_id: str) -> str:
        """Resume summary for a specific resume_id, cached. '' on failure."""
        if resume_id in self._relevance_summaries:
            return self._relevance_summaries[resume_id]
        from app.services.form_filler import _resume_summary, load_resume
        try:
            resume = await load_resume(self.user_id, resume_id)
            summary = _resume_summary(resume)
        except Exception:
            logger.warning(
                "relevance: resume load failed for %s/%s — ungrounded",
                self.user_id, resume_id, exc_info=True,
            )
            summary = ""
        self._relevance_summaries[resume_id] = summary
        return summary
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_agent_relevance.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/ai/agent.py backend/tests/test_agent_relevance.py
git commit -m "feat: HHAgent.filter_relevant_vacancies with per-resume summary cache"
```

---

## Task 5: Wire relevance into the producer

Restructure the per-page item loop to collect mechanically-surviving items, then batch through the cache + agent before queueing. Gate on `ai_filter_enabled`. Add the `agent` param (optional → bypass when None, keeps existing tests valid). Update the runner call site.

**Files:**
- Modify: `backend/app/services/vacancy_producer.py`
- Modify: `backend/app/worker/runner.py:246`
- Test: `backend/tests/test_vacancy_producer.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_vacancy_producer.py`:

```python
def _filter_row(**over):
    base = {
        "id": "f1", "resume_id": "r1", "text": "AI engineer", "area": None,
        "salary_min": None, "experience": None, "schedule": None,
        "employment": None, "professional_role": None, "excluded_regex": None,
        "ai_filter_enabled": True,
    }
    base.update(over)
    return base


@pytest.mark.asyncio
async def test_relevance_drops_irrelevant():
    from app.services import vacancy_producer as vp
    from app.worker.queue import drop_user_queue, get_user_queue
    drop_user_queue("u1")

    filters_chain = _chain([_filter_row()])
    apps_chain = _chain([])
    blacklist_chain = _chain([])

    def _table(name):
        return {"filters": filters_chain, "applications": apps_chain,
                "blacklist": blacklist_chain}[name]

    client = MagicMock()
    client.access_token = "tok"
    client.get.return_value = {
        "items": [
            {"id": "v1", "name": "AI Engineer", "employer": {"id": "e1"}},
            {"id": "v2", "name": "Sales Manager", "employer": {"id": "e2"}},
        ],
        "found": 2,
    }

    agent = MagicMock()
    agent.filter_relevant_vacancies = AsyncMock(
        return_value={"v1": (True, ""), "v2": (False, "sales")}
    )

    with patch.object(vp.service_client, "table", side_effect=_table), \
         patch.object(vp.relevance, "get_cached_verdicts", return_value={}), \
         patch.object(vp.relevance, "store_verdicts"), \
         patch.object(vp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(vp, "persist_if_refreshed", new=AsyncMock()):
        pushed, _ = await vp.produce_jobs("u1", agent)

    assert pushed == 1
    queue = get_user_queue("u1")
    assert queue.qsize() == 1
    assert queue.get_nowait().vacancy_id == "v1"


@pytest.mark.asyncio
async def test_relevance_uses_cache_no_llm_call():
    from app.services import vacancy_producer as vp
    from app.worker.queue import drop_user_queue, get_user_queue
    drop_user_queue("u1")

    def _table(name):
        return {"filters": _chain([_filter_row()]), "applications": _chain([]),
                "blacklist": _chain([])}[name]

    client = MagicMock()
    client.access_token = "tok"
    client.get.return_value = {
        "items": [{"id": "v2", "name": "Sales Manager", "employer": {"id": "e2"}}],
        "found": 1,
    }

    agent = MagicMock()
    agent.filter_relevant_vacancies = AsyncMock(return_value={})

    with patch.object(vp.service_client, "table", side_effect=_table), \
         patch.object(vp.relevance, "get_cached_verdicts",
                      return_value={"v2": (False, "cached sales")}), \
         patch.object(vp.relevance, "store_verdicts"), \
         patch.object(vp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(vp, "persist_if_refreshed", new=AsyncMock()):
        pushed, _ = await vp.produce_jobs("u1", agent)

    assert pushed == 0
    agent.filter_relevant_vacancies.assert_not_awaited()  # fully served from cache
    assert get_user_queue("u1").qsize() == 0


@pytest.mark.asyncio
async def test_ai_filter_disabled_bypasses_relevance():
    from app.services import vacancy_producer as vp
    from app.worker.queue import drop_user_queue, get_user_queue
    drop_user_queue("u1")

    def _table(name):
        return {"filters": _chain([_filter_row(ai_filter_enabled=False)]),
                "applications": _chain([]), "blacklist": _chain([])}[name]

    client = MagicMock()
    client.access_token = "tok"
    client.get.return_value = {
        "items": [{"id": "v2", "name": "Sales Manager", "employer": {"id": "e2"}}],
        "found": 1,
    }

    agent = MagicMock()
    agent.filter_relevant_vacancies = AsyncMock(return_value={})

    with patch.object(vp.service_client, "table", side_effect=_table), \
         patch.object(vp.relevance, "get_cached_verdicts", return_value={}), \
         patch.object(vp.relevance, "store_verdicts"), \
         patch.object(vp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(vp, "persist_if_refreshed", new=AsyncMock()):
        pushed, _ = await vp.produce_jobs("u1", agent)

    assert pushed == 1  # not filtered
    agent.filter_relevant_vacancies.assert_not_awaited()
    assert get_user_queue("u1").qsize() == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_vacancy_producer.py -k relevance -v`
Expected: FAIL — `produce_jobs()` takes 1 positional arg / `vp` has no attribute `relevance`.

- [ ] **Step 3: Add the relevance import + select column**

In `backend/app/services/vacancy_producer.py`, add to imports:

```python
from app.services import relevance
```

In `_load_enabled_filters`, change the `.select(...)` string to include the new column:

```python
        .select(
            "id,resume_id,text,area,salary_min,experience,schedule,"
            "employment,professional_role,excluded_regex,ai_filter_enabled"
        )
```

- [ ] **Step 4: Add the agent param + relevance helper**

Change the `produce_jobs` signature (top of function) to accept an optional agent:

```python
async def produce_jobs(user_id: str, agent=None) -> tuple[int, int]:
```

Add this module-level helper above `produce_jobs`:

```python
async def _relevant_ids(
    loop, agent, user_id: str, resume_id: str, candidates: list[dict]
) -> set[str]:
    """Return the subset of candidate vacancy ids that are relevant.

    Cache-first: only uncached items hit the LLM. Fail-open: no agent → all
    relevant. candidates carry {id, name, snippet_requirement, snippet_responsibility}.
    """
    ids = [c["id"] for c in candidates]
    if agent is None or not ids:
        return set(ids)
    cached = await loop.run_in_executor(
        None, relevance.get_cached_verdicts, resume_id, ids
    )
    uncached = [c for c in candidates if c["id"] not in cached]
    fresh: dict[str, tuple[bool, str]] = {}
    if uncached:
        fresh = await agent.filter_relevant_vacancies(resume_id, uncached)
        await loop.run_in_executor(
            None, relevance.store_verdicts, user_id, resume_id, fresh
        )
    verdicts = {**cached, **fresh}
    # Default missing verdicts to relevant (fail-open / conservative).
    return {vid for vid in ids if verdicts.get(vid, (True, ""))[0]}
```

- [ ] **Step 5: Restructure the per-page loop to collect → filter → queue**

In `produce_jobs`, replace the inner `for it in items:` block (the one that currently calls `await queue.put(...)`) with a collect-then-filter-then-queue version. The full replacement for that block:

```python
                page_candidates: list[dict] = []
                for it in items:
                    vid = str(it.get("id") or "")
                    if not vid or vid in already:
                        skipped_already += 1
                        continue
                    if it.get("relations"):
                        skipped_relations += 1
                        emp = it.get("employer") or {}
                        if emp.get("id"):
                            relations_blacklist[str(emp["id"])] = emp.get("name")
                        continue
                    emp_id = (it.get("employer") or {}).get("id")
                    if emp_id and str(emp_id) in blacklisted:
                        skipped_blacklist += 1
                        continue
                    if _matches_excluded(it, excluded_pat):
                        skipped_excluded += 1
                        continue
                    snippet = it.get("snippet") or {}
                    page_candidates.append({
                        "id": vid,
                        "name": it.get("name") or "",
                        "snippet_requirement": snippet.get("requirement") or "",
                        "snippet_responsibility": snippet.get("responsibility") or "",
                    })

                if f.get("ai_filter_enabled") and page_candidates:
                    keep = await _relevant_ids(
                        loop, agent, user_id, f["resume_id"], page_candidates
                    )
                    dropped = len(page_candidates) - len(keep)
                    if dropped:
                        logger.info(
                            "producer: user=%s filter=%s relevance dropped %d/%d",
                            user_id, f.get("id"), dropped, len(page_candidates),
                        )
                    page_candidates = [c for c in page_candidates if c["id"] in keep]

                for c in page_candidates:
                    if pushed >= MAX_PUSH_PER_RUN:
                        break
                    await queue.put(
                        ApplyJob(
                            user_id=user_id,
                            resume_id=f["resume_id"],
                            vacancy_id=c["id"],
                            filter_id=f.get("id"),
                        )
                    )
                    pushed += 1
```

Note: the old loop's leading `if pushed >= MAX_PUSH_PER_RUN: break` guard inside the item loop is removed — the cap is now enforced in the final queueing loop. The outer `if pushed >= MAX_PUSH_PER_RUN: break` checks at the top of the page loop and filter loop remain unchanged.

- [ ] **Step 6: Update the runner call site**

In `backend/app/worker/runner.py:246`, change:

```python
                pushed, skipped_has_test = await produce_jobs(user_id)
```
to:
```python
                pushed, skipped_has_test = await produce_jobs(user_id, handle.agent)
```

- [ ] **Step 7: Run the producer tests**

Run: `cd backend && python -m pytest tests/test_vacancy_producer.py -v`
Expected: PASS — the new relevance tests pass AND the pre-existing `test_has_test_vacancy_is_queued_not_skipped` still passes (its filter dict has no `ai_filter_enabled` key → falsy → relevance bypassed; it calls `produce_jobs("u1")` with the default `agent=None`).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/vacancy_producer.py backend/app/worker/runner.py backend/tests/test_vacancy_producer.py
git commit -m "feat: wire AI relevance filter into vacancy producer"
```

---

## Task 6: Backend schema + filters_service column

Surface `ai_filter_enabled` through the filters API so the frontend can read/toggle it.

**Files:**
- Modify: `backend/app/schemas/filters.py`
- Modify: `backend/app/services/filters_service.py`
- Test: `backend/tests/test_filters_schema.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_filters_schema.py`:

```python
import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def test_filter_create_defaults_ai_filter_enabled_true():
    from app.schemas.filters import FilterCreate
    assert FilterCreate().ai_filter_enabled is True


def test_filter_update_accepts_ai_filter_enabled():
    from app.schemas.filters import FilterUpdate
    u = FilterUpdate(ai_filter_enabled=False)
    assert u.model_dump(exclude_unset=True) == {"ai_filter_enabled": False}


def test_filter_response_has_ai_filter_enabled():
    from app.schemas.filters import FilterResponse
    r = FilterResponse(id="x", ai_filter_enabled=False)
    assert r.ai_filter_enabled is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_filters_schema.py -v`
Expected: FAIL — `FilterCreate` has no attribute `ai_filter_enabled` / unexpected keyword.

- [ ] **Step 3: Add the field to the schemas**

In `backend/app/schemas/filters.py`:

- In `FilterCreate`, after `enabled: bool = True` add:
```python
    ai_filter_enabled: bool = True
```
- In `FilterUpdate`, after `enabled: bool | None = None` add:
```python
    ai_filter_enabled: bool | None = None
```
- In `FilterResponse`, after `enabled: bool = True` add:
```python
    ai_filter_enabled: bool = True
```

- [ ] **Step 4: Add the column to filters_service select**

In `backend/app/services/filters_service.py`, update `_FILTER_COLUMNS`:

```python
_FILTER_COLUMNS = (
    "id,user_id,resume_id,text,area,salary_min,experience,"
    "schedule,employment,professional_role,excluded_regex,enabled,"
    "ai_filter_enabled,created_at"
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_filters_schema.py -v`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/filters.py backend/app/services/filters_service.py backend/tests/test_filters_schema.py
git commit -m "feat: expose ai_filter_enabled in filters API"
```

---

## Task 7: Frontend toggle

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/components/filters-drawer.tsx`

- [ ] **Step 1: Add the field to the TS types**

In `frontend/src/lib/types.ts`:

- In `Filter`, after `enabled: boolean;` add:
```typescript
  ai_filter_enabled: boolean;
```
- In `FilterCreate`, after `enabled?: boolean;` add:
```typescript
  ai_filter_enabled?: boolean;
```

- [ ] **Step 2: Add the Toggle to FilterEditor**

In `frontend/src/components/filters-drawer.tsx`, inside `FilterEditor`, after the `excluded regex` `EditorField` (the closing `</EditorField>` near the end of the returned JSX, before the closing `</Card>`), add:

```tsx
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 4,
          paddingTop: 14,
          borderTop: "1px solid var(--line)",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>AI-фильтр релевантности</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Бот пропустит вакансии, которые ИИ счёл нерелевантными резюме
          </div>
        </div>
        <Toggle
          on={filter.ai_filter_enabled}
          onChange={(next) => commit({ ai_filter_enabled: next })}
        />
      </div>
```

`Toggle` is already imported in this file (`@/components/otclick/ui`).

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors related to `ai_filter_enabled` / `filters-drawer.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/components/filters-drawer.tsx
git commit -m "feat: AI relevance filter toggle in filters drawer"
```

---

## Task 8: Full backend test sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the whole backend suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: all pass (new `test_relevance.py`, `test_agent_relevance.py`, `test_filters_schema.py`, extended `test_vacancy_producer.py`, and all pre-existing tests).

- [ ] **Step 2: If anything fails**

Use superpowers:systematic-debugging. Do not paper over failures.

---

## Notes for the implementer

- **Fail-open is load-bearing.** Relevance must never block the worker. Empty `OPENAI_API_KEY` → `HHAgent.llm is None` → `filter_relevant` returns all-relevant. Cache read/write failures are swallowed (logged). LLM/parse failures keep all.
- **Conservative classifier.** The prompt flags only clear profession mismatches; missing verdicts default to relevant. Prefer false-keep over false-drop.
- **One LLM call per vacancy ever** (per resume): the cache is keyed `(resume_id, vacancy_id)`; re-runs of the producer re-find the same vacancies but read verdicts from cache.
- **Migration must be applied** before the producer code runs against a real DB, or `_load_enabled_filters` / `_FILTER_COLUMNS` selecting `ai_filter_enabled` will error. Unit tests inject the column via mock rows, so tests pass regardless.
