# Manual Cover-Letter Generator (Free/Pro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app manual cover-letter generator — free users generate up to 5 letters/day, pro users unlimited — reusing the existing `cover_letter.py` engine, without starting the worker.

**Architecture:** New thin service `manual_cover_letter` orchestrates: ownership check → cache lookup (free, uncounted) → free daily-limit gate (`gen_limiter`) → fetch vacancy from hh → generate via `HHAgent.write_cover_letter` → consume counter for free users. Exposed at `POST /api/cover-letters/generate` (auth only, no plan gate — free users allowed). Worker start stays pro-gated by the existing `require_active_plan` (no change). Frontend adds a generator page that previews a filter's vacancies and generates a letter per vacancy.

**Tech Stack:** FastAPI, pydantic, Supabase (service_role), langchain `ChatOpenAI` (via `HHAgent`), Next.js App Router + React, Tailwind.

**Free vs Pro recap (from spec):** Free = vacancy preview + manual generation (5/day). Pro = worker auto-apply + recruiter answers + todo (already gated elsewhere). "Pro" here = `plan.has_access(profile) is True` (includes active trial). Generation limit applies only when `has_access` is False.

---

## File Structure

**Backend (create):**
- `infra/supabase/migrations/016_cover_letter_gen_counters.sql` — daily free-gen counter table
- `backend/app/services/gen_limiter.py` — free daily generation cap (5/day, local TZ)
- `backend/app/services/manual_cover_letter.py` — orchestration service
- `backend/app/schemas/cover_letters.py` — request/response models
- `backend/app/api/cover_letters.py` — `POST /api/cover-letters/generate`
- `backend/tests/test_gen_limiter.py`
- `backend/tests/test_manual_cover_letter.py`

**Backend (modify):**
- `backend/app/api/router.py` — register the new router

**Frontend (create):**
- `frontend/src/hooks/useCoverLetter.ts` — generate hook
- `frontend/src/app/(app)/cover-letter/page.tsx` — generator UI

**Frontend (modify):**
- `frontend/src/lib/types.ts` — add `CoverLetterResult`
- `frontend/src/components/otclick/sidebar.tsx` — add nav link

---

## Task 1: Migration — free generation counter table

**Files:**
- Create: `infra/supabase/migrations/016_cover_letter_gen_counters.sql`

- [ ] **Step 1: Write the migration**

Mirrors `apply_counters` (001_init.sql:79) — same PK shape, RLS on, no policies (service_role only).

```sql
-- 016_cover_letter_gen_counters.sql
-- Per-user daily counter for free manual cover-letter generations (5/day cap).
-- Pro users (plan.has_access) are not counted. Cache hits are not counted.

create table if not exists cover_letter_gen_counters (
  user_id uuid references profiles(id) on delete cascade,
  date date not null,
  count int default 0,
  primary key (user_id, date)
);

alter table cover_letter_gen_counters enable row level security;
-- no policies = full RLS denial (service_role only; matches apply_counters)
```

- [ ] **Step 2: Apply locally and verify the table exists**

Apply via the project's Supabase workflow (CLI `supabase db push`, or paste into the SQL editor for the dev project). Verify:

Run: `psql "$SUPABASE_DB_URL" -c "\d cover_letter_gen_counters"` (or check the table in the Supabase dashboard)
Expected: table with columns `user_id`, `date`, `count`, PK `(user_id, date)`.

> If no local Postgres URL is configured, applying through the Supabase dashboard SQL editor is acceptable. The runtime uses `service_client`, which bypasses RLS.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/016_cover_letter_gen_counters.sql
git commit -m "feat: add cover_letter_gen_counters table for free-tier gen cap"
```

---

## Task 2: `gen_limiter` service

**Files:**
- Create: `backend/app/services/gen_limiter.py`
- Test: `backend/tests/test_gen_limiter.py`

- [ ] **Step 1: Write the failing tests**

```python
import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def _fluent(final_data):
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.upsert.return_value = chain
    chain.execute.return_value = SimpleNamespace(data=final_data, count=None)
    return chain


@pytest.mark.asyncio
async def test_remaining_full_when_no_rows():
    from app.services import gen_limiter

    sb = MagicMock()
    # Sequence: tz lookup (limiter._tz_for_user) → count read.
    sb.table.side_effect = [
        _fluent({"timezone": "Asia/Almaty"}),
        _fluent(None),
    ]
    with patch.object(gen_limiter, "service_client", sb), \
         patch("app.worker.limiter.service_client", sb):
        rem = await gen_limiter.remaining("u1")
    assert rem == gen_limiter.FREE_DAILY_GEN_LIMIT


@pytest.mark.asyncio
async def test_remaining_zero_at_cap():
    from app.services import gen_limiter

    sb = MagicMock()
    sb.table.side_effect = [
        _fluent({"timezone": "Asia/Almaty"}),
        _fluent({"count": gen_limiter.FREE_DAILY_GEN_LIMIT}),
    ]
    with patch.object(gen_limiter, "service_client", sb), \
         patch("app.worker.limiter.service_client", sb):
        rem = await gen_limiter.remaining("u1")
    assert rem == 0


@pytest.mark.asyncio
async def test_consume_bumps_count():
    from app.services import gen_limiter

    sb = MagicMock()
    sb.table.side_effect = [
        _fluent({"timezone": "Asia/Almaty"}),  # tz lookup
        _fluent({"count": 2}),                  # current count read
        _fluent(None),                          # upsert
    ]
    with patch.object(gen_limiter, "service_client", sb), \
         patch("app.worker.limiter.service_client", sb):
        new = await gen_limiter.consume("u1")
    assert new == 3
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_gen_limiter.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.gen_limiter'`.

- [ ] **Step 3: Write the implementation**

```python
"""Per-user daily cap on free manual cover-letter generations (5/day, local TZ).

Pro users (plan.has_access) bypass this entirely — the caller only invokes these
helpers for free users. Cache hits are not counted (handled by the caller).
"""

from __future__ import annotations

import asyncio

from app.db.supabase import service_client
from app.worker.limiter import _today_local, _tz_for_user

FREE_DAILY_GEN_LIMIT = 5


def _read_count(user_id: str, local_date: str) -> int:
    res = (
        service_client.table("cover_letter_gen_counters")
        .select("count")
        .eq("user_id", user_id)
        .eq("date", local_date)
        .maybe_single()
        .execute()
    )
    return ((res.data or {}).get("count") if res else 0) or 0


def _write_count(user_id: str, local_date: str, new_count: int) -> None:
    service_client.table("cover_letter_gen_counters").upsert(
        {"user_id": user_id, "date": local_date, "count": new_count},
        on_conflict="user_id,date",
    ).execute()


def _remaining_sync(user_id: str) -> int:
    tz = _tz_for_user(user_id)
    used = _read_count(user_id, _today_local(tz))
    return max(0, FREE_DAILY_GEN_LIMIT - used)


def _consume_sync(user_id: str) -> int:
    """Bump today's counter; returns new value. Caller checks remaining first."""
    tz = _tz_for_user(user_id)
    local_date = _today_local(tz)
    new_count = _read_count(user_id, local_date) + 1
    _write_count(user_id, local_date, new_count)
    return new_count


async def remaining(user_id: str) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _remaining_sync, user_id)


async def consume(user_id: str) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _consume_sync, user_id)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_gen_limiter.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/gen_limiter.py backend/tests/test_gen_limiter.py
git commit -m "feat: add gen_limiter for free cover-letter daily cap"
```

---

## Task 3: `manual_cover_letter` orchestration service

**Files:**
- Create: `backend/app/services/manual_cover_letter.py`
- Test: `backend/tests/test_manual_cover_letter.py`

Behavior contract:
- Unknown `resume_id` for the user → `HTTPException(400)`.
- Cache hit → return cached text, `cached=True`, do NOT consume the free counter.
- Free user (`has_access False`) with `remaining <= 0` and cache miss → `HTTPException(402)`.
- Free user under cap → generate, consume counter, return `remaining` (post-consume).
- Pro user (`has_access True`) → generate, never consume, `remaining=None`.

- [ ] **Step 1: Write the failing tests**

```python
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

RESUME = {"id": "r1", "title": "Python dev"}
VACANCY = {"id": "v1", "name": "Backend", "employer": {"name": "Acme"}}


@pytest.mark.asyncio
async def test_cache_hit_returns_without_consuming():
    from app.services import manual_cover_letter as svc

    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=False)), \
         patch.object(svc, "_cache_get", return_value="cached letter"), \
         patch.object(svc.gen_limiter, "remaining", new=AsyncMock(return_value=4)), \
         patch.object(svc.gen_limiter, "consume", new=AsyncMock()) as consume:
        out = await svc.generate_for_vacancy("u1", "v1", "r1")
    assert out == {"text": "cached letter", "cached": True, "remaining": 4}
    consume.assert_not_called()


@pytest.mark.asyncio
async def test_free_over_limit_raises_402():
    from app.services import manual_cover_letter as svc

    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=False)), \
         patch.object(svc, "_cache_get", return_value=None), \
         patch.object(svc.gen_limiter, "remaining", new=AsyncMock(return_value=0)):
        with pytest.raises(HTTPException) as ei:
            await svc.generate_for_vacancy("u1", "v1", "r1")
    assert ei.value.status_code == 402


@pytest.mark.asyncio
async def test_free_under_limit_generates_and_consumes():
    from app.services import manual_cover_letter as svc

    agent = MagicMock()
    agent.write_cover_letter = AsyncMock(return_value="fresh letter")
    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=False)), \
         patch.object(svc, "_cache_get", return_value=None), \
         patch.object(svc.gen_limiter, "remaining", new=AsyncMock(side_effect=[3, 2])), \
         patch.object(svc.gen_limiter, "consume", new=AsyncMock()) as consume, \
         patch.object(svc, "_fetch_vacancy", new=AsyncMock(return_value=VACANCY)), \
         patch.object(svc, "HHAgent", return_value=agent):
        out = await svc.generate_for_vacancy("u1", "v1", "r1")
    assert out == {"text": "fresh letter", "cached": False, "remaining": 2}
    consume.assert_awaited_once_with("u1")


@pytest.mark.asyncio
async def test_pro_unlimited_no_consume():
    from app.services import manual_cover_letter as svc

    agent = MagicMock()
    agent.write_cover_letter = AsyncMock(return_value="pro letter")
    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=True)), \
         patch.object(svc, "_cache_get", return_value=None), \
         patch.object(svc.gen_limiter, "consume", new=AsyncMock()) as consume, \
         patch.object(svc, "_fetch_vacancy", new=AsyncMock(return_value=VACANCY)), \
         patch.object(svc, "HHAgent", return_value=agent):
        out = await svc.generate_for_vacancy("u1", "v1", "r1")
    assert out == {"text": "pro letter", "cached": False, "remaining": None}
    consume.assert_not_called()


@pytest.mark.asyncio
async def test_unknown_resume_raises_400():
    from app.services import manual_cover_letter as svc

    with patch.object(svc, "_resume_row", return_value=None):
        with pytest.raises(HTTPException) as ei:
            await svc.generate_for_vacancy("u1", "v1", "rX")
    assert ei.value.status_code == 400
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_manual_cover_letter.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.manual_cover_letter'`.

- [ ] **Step 3: Write the implementation**

```python
"""On-demand cover-letter generation for the in-app manual generator.

Free users: capped at gen_limiter.FREE_DAILY_GEN_LIMIT/day; cache hits are free
and uncounted. Pro users (plan.has_access): unlimited, never counted.

Reuses the worker's HHAgent.write_cover_letter (PG cache → LLM → fallback). No
worker is started — this is the synchronous "preview" path.
"""

from __future__ import annotations

import asyncio

from fastapi import HTTPException, status

from app.ai.agent import HHAgent
from app.db.supabase import service_client
from app.services import gen_limiter, plan
from app.services.cover_letter import _cache_get
from app.services.hh_credentials import load_api_client, persist_if_refreshed


def _resume_row(user_id: str, resume_id: str) -> dict | None:
    res = (
        service_client.table("resumes")
        .select("id,title")
        .eq("user_id", user_id)
        .eq("id", resume_id)
        .maybe_single()
        .execute()
    )
    return res.data if res else None


async def _fetch_vacancy(user_id: str, vacancy_id: str) -> dict:
    client = await load_api_client(user_id)
    original_access = client.access_token
    loop = asyncio.get_running_loop()
    try:
        payload = await loop.run_in_executor(
            None, client.get, f"vacancies/{vacancy_id}"
        )
    finally:
        await persist_if_refreshed(user_id, client, original_access)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="unexpected hh vacancy payload")
    return payload


async def generate_for_vacancy(
    user_id: str, vacancy_id: str, resume_id: str
) -> dict:
    """Generate (or return cached) cover letter. See module docstring for rules."""
    loop = asyncio.get_running_loop()
    resume = await loop.run_in_executor(None, _resume_row, user_id, resume_id)
    if not resume:
        raise HTTPException(status_code=400, detail="resume_id not found for this user")

    is_pro = await plan.check_access(user_id)

    # Cache hit → free, no counter consumed (no inference cost).
    cached = await loop.run_in_executor(None, _cache_get, vacancy_id, resume_id)
    if cached:
        rem = None if is_pro else await gen_limiter.remaining(user_id)
        return {"text": cached, "cached": True, "remaining": rem}

    if not is_pro and await gen_limiter.remaining(user_id) <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="free_limit_reached: daily cover-letter limit reached, upgrade to Pro",
        )

    vacancy = await _fetch_vacancy(user_id, vacancy_id)
    agent = HHAgent(user_id)
    text = await agent.write_cover_letter(user_id, vacancy, resume, resume_id)

    rem = None
    if not is_pro:
        await gen_limiter.consume(user_id)
        rem = await gen_limiter.remaining(user_id)
    return {"text": text, "cached": False, "remaining": rem}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_manual_cover_letter.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/manual_cover_letter.py backend/tests/test_manual_cover_letter.py
git commit -m "feat: add manual_cover_letter service (free 5/day, pro unlimited)"
```

---

## Task 4: Schema + API endpoint + router registration

**Files:**
- Create: `backend/app/schemas/cover_letters.py`
- Create: `backend/app/api/cover_letters.py`
- Modify: `backend/app/api/router.py:3-19`

- [ ] **Step 1: Write the schema**

`backend/app/schemas/cover_letters.py`:

```python
from pydantic import BaseModel


class CoverLetterGenerateRequest(BaseModel):
    vacancy_id: str
    resume_id: str


class CoverLetterResponse(BaseModel):
    text: str
    cached: bool
    remaining: int | None = None  # null for pro (unlimited); int for free
```

- [ ] **Step 2: Write the endpoint**

`backend/app/api/cover_letters.py` — auth only (`get_current_user`), NOT `require_active_plan`, because free users may generate:

```python
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.schemas.cover_letters import (
    CoverLetterGenerateRequest,
    CoverLetterResponse,
)
from app.services import manual_cover_letter

router = APIRouter(prefix="/api/cover-letters", tags=["cover-letters"])


@router.post("/generate", response_model=CoverLetterResponse)
async def generate(
    body: CoverLetterGenerateRequest,
    user_id: str = Depends(get_current_user),
) -> CoverLetterResponse:
    data = await manual_cover_letter.generate_for_vacancy(
        user_id, body.vacancy_id, body.resume_id
    )
    return CoverLetterResponse(**data)
```

- [ ] **Step 3: Register the router**

In `backend/app/api/router.py`, add `cover_letters` to the import on line 3 and include it after `resumes`:

```python
from app.api import auth, billing, blacklist, captcha, chats, cover_letters, filters, forms, internal, recruiter, resumes, webhooks, worker
```

```python
api_router.include_router(resumes.router)
api_router.include_router(cover_letters.router)
```

- [ ] **Step 4: Verify the app imports and the route is registered**

Run: `cd backend && python -c "from app.main import app; print([r.path for r in app.routes if 'cover' in r.path])"`
Expected: `['/api/cover-letters/generate']`

- [ ] **Step 5: Run the full backend test suite (no regressions)**

Run: `cd backend && python -m pytest tests/ -q`
Expected: all pass (existing + the new `test_gen_limiter.py` and `test_manual_cover_letter.py`).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/cover_letters.py backend/app/api/cover_letters.py backend/app/api/router.py
git commit -m "feat: add POST /api/cover-letters/generate endpoint"
```

---

## Task 5: Frontend types + hook

**Files:**
- Modify: `frontend/src/lib/types.ts` (append)
- Create: `frontend/src/hooks/useCoverLetter.ts`

- [ ] **Step 1: Add the result type**

Append to `frontend/src/lib/types.ts`:

```typescript
export type CoverLetterResult = {
  text: string;
  cached: boolean;
  remaining: number | null; // null = pro (unlimited); number = free remaining today
};
```

- [ ] **Step 2: Write the hook**

`frontend/src/hooks/useCoverLetter.ts` — mirrors the `useFilters` pattern (`apiFetch`, local state):

```typescript
"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CoverLetterResult } from "@/lib/types";

export function useCoverLetter() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (vacancyId: string, resumeId: string): Promise<CoverLetterResult | null> => {
      setBusyId(vacancyId);
      setError(null);
      try {
        return await apiFetch<CoverLetterResult>("/api/cover-letters/generate", {
          method: "POST",
          body: JSON.stringify({ vacancy_id: vacancyId, resume_id: resumeId }),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "generate failed");
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  return { generate, busyId, error };
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/hooks/useCoverLetter.ts
git commit -m "feat: add useCoverLetter hook + result type"
```

---

## Task 6: Frontend generator page

**Files:**
- Create: `frontend/src/app/(app)/cover-letter/page.tsx`

The page: pick a resume + a filter, preview the filter's vacancies (reuse `/api/filters/{id}/preview`), generate a letter per vacancy, show it inline with a copy button, and surface the free remaining count.

- [ ] **Step 1: Write the page**

`frontend/src/app/(app)/cover-letter/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useFilters } from "@/hooks/useFilters";
import { useCoverLetter } from "@/hooks/useCoverLetter";
import type { Filter, FilterPreview, Resume, ResumesList, VacancyPreviewItem } from "@/lib/types";

export default function CoverLetterPage() {
  const { items: filters } = useFilters();
  const { generate, busyId, error } = useCoverLetter();

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [filterId, setFilterId] = useState<string>("");
  const [vacancies, setVacancies] = useState<VacancyPreviewItem[]>([]);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    apiFetch<ResumesList>("/api/resumes")
      .then((d) => {
        setResumes(d.items);
        if (d.items[0]) setResumeId(d.items[0].id);
      })
      .catch(() => setResumes([]));
  }, []);

  async function loadPreview() {
    if (!filterId) return;
    setLoadingPreview(true);
    try {
      const data = await apiFetch<FilterPreview>(`/api/filters/${filterId}/preview`);
      setVacancies(data.items.filter((v) => v.id));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function onGenerate(vacancyId: string) {
    if (!resumeId) return;
    const res = await generate(vacancyId, resumeId);
    if (res) {
      setLetters((prev) => ({ ...prev, [vacancyId]: res.text }));
      setRemaining(res.remaining);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 0" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Сопроводительные письма
      </h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <select
          value={resumeId}
          onChange={(e) => setResumeId(e.target.value)}
          style={{ padding: 8, borderRadius: 8 }}
        >
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title ?? r.hh_resume_id}
            </option>
          ))}
        </select>

        <select
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
          style={{ padding: 8, borderRadius: 8 }}
        >
          <option value="">— выбери фильтр —</option>
          {(filters ?? []).map((f: Filter) => (
            <option key={f.id} value={f.id}>
              {f.text ?? f.id}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={loadPreview}
          disabled={!filterId || loadingPreview}
          style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}
        >
          {loadingPreview ? "Загрузка…" : "Показать вакансии"}
        </button>
      </div>

      {remaining !== null && (
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
          Осталось бесплатных генераций сегодня: {remaining}
        </p>
      )}
      {error && (
        <p style={{ color: "var(--coral, #d44)", marginBottom: 12 }}>{error}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {vacancies.map((v) => (
          <div
            key={v.id!}
            style={{
              border: "1px solid var(--line-2, #eee)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{v.name}</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{v.employer}</div>
              </div>
              <button
                type="button"
                onClick={() => onGenerate(v.id!)}
                disabled={busyId === v.id || !resumeId}
                style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {busyId === v.id ? "Генерация…" : "Сгенерировать письмо"}
              </button>
            </div>
            {letters[v.id!] && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  readOnly
                  value={letters[v.id!]}
                  style={{ width: "100%", minHeight: 140, padding: 10, borderRadius: 8 }}
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(letters[v.id!])}
                  style={{ marginTop: 6, padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}
                >
                  Копировать
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(app)/cover-letter/page.tsx"
git commit -m "feat: add manual cover-letter generator page"
```

---

## Task 7: Sidebar nav link

**Files:**
- Modify: `frontend/src/components/otclick/sidebar.tsx:6-27`

- [ ] **Step 1: Add the nav entry**

The icon set is imported from `@/components/otclick/icons` (line 6). `IMail` is already used for Chats; reuse `IDoc` for the generator entry (it reads as a document). Add an item to the `NAV` array (after `todo`):

```tsx
const NAV: Item[] = [
  { id: "dashboard", href: "/dashboard", icon: <IHome />, label: "Главная" },
  { id: "applications", href: "/applications", icon: <IList />, label: "Отклики" },
  { id: "cover-letter", href: "/cover-letter", icon: <IDoc />, label: "Письма" },
  { id: "chats", href: "/chats", icon: <IMail />, label: "Чаты" },
  { id: "todo", href: "/todo", icon: <IDoc />, label: "Todo" },
  { id: "notifications", href: "/notifications", icon: <IBell />, label: "Уведомления" },
  { id: "account", href: "/account", icon: <IUser />, label: "Аккаунт" },
];
```

> `IDoc` is already imported (line 12), so no import change is needed.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/otclick/sidebar.tsx
git commit -m "feat: add cover-letter nav link to sidebar"
```

---

## Task 8: End-to-end manual verification

No new code — verify the wired feature against a running stack.

- [ ] **Step 1: Start backend + frontend**

```bash
cd backend && uvicorn app.main:app --reload   # terminal 1
cd frontend && npm run dev                     # terminal 2
```

- [ ] **Step 2: Verify the free flow**

With a logged-in account whose plan has NO access (expired trial / no sub):
1. Open `/cover-letter`, pick a resume + a filter, click "Показать вакансии".
2. Click "Сгенерировать письмо" on a vacancy → a letter appears, "Осталось бесплатных генераций сегодня" decrements.
3. Generate 5 distinct vacancies → the 6th returns a 402 surfaced as the error message ("free_limit_reached…").
4. Re-generating an already-generated vacancy returns instantly (cache hit) and does NOT decrement the remaining count.

Expected: matches the behavior contract in Task 3.

- [ ] **Step 3: Verify the pro flow**

With an account whose plan has access (active trial or paid):
1. Generate several letters → no "осталось" counter shown (remaining is null), no cap.

Expected: unlimited generation, `remaining` absent.

- [ ] **Step 4: Confirm worker stays pro-gated (unchanged)**

As the free account, hit worker start:

Run: `curl -s -X POST "$API/api/worker/start" -H "Authorization: Bearer $FREE_JWT" -o /dev/null -w "%{http_code}\n"`
Expected: `402` (existing `require_active_plan` gate — proves free users still can't auto-apply).

---

## Notes / Out of scope (from spec)
- No public no-login generator page (in-app only).
- No 3-day pro trial, no moat teaser, no lifetime tier.
- Worker pro-gating is already enforced by `require_active_plan` on `/api/worker/start` — no change in this plan.
- The free limit applies to users where `plan.has_access` is False; active-trial users currently count as pro (unlimited). If signup-trial behavior should change, that's a separate plan.
