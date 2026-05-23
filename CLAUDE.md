# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI autoclicker for hh.ru/hh.kz — automates job applications. Two sub-projects:

- **`backend/`** — FastAPI service (active build)
- **`hh-applicant-tool/`** — existing Python CLI tool (source to copy from, not modify)

Key discovery: hh.ru password grant OAuth is **broken** (`unsupported_grant_type`). Playwright headless browser is the only working login method.

## Commands

All commands run from the repo root with `.venv` active:

```bash
source .venv/bin/activate

# Dev server
cd backend && uvicorn app.main:app --reload

# All tests
cd backend && python -m pytest tests/ -v

# Single test
cd backend && python -m pytest tests/test_hh_auth.py::test_encrypt_decrypt_roundtrip -v

# Install playwright browsers (needed for OAuth flow)
playwright install chromium
```

## Required `.env` (backend root or project root)

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FERNET_KEY=   # generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Backend Architecture (`backend/app/`)

```
main.py                      — FastAPI app, /health checks Supabase
config.py                    — pydantic-settings Settings (reads .env), Fernet lazy init
api/
  deps.py                    — get_current_user: validates Supabase JWT via anon_client
  auth.py                    — /api/hh/* routes (connect, poll, captcha, disconnect, status)
  resumes.py                 — /api/resumes/* routes (sync, list)
  filters.py                 — /api/filters/* routes (CRUD + vacancy preview)
  router.py                  — includes auth, resumes, filters routers
db/
  supabase.py                — service_client (bypasses RLS), anon_client (JWT validation only)
hh/
  authorize.py               — Playwright OAuth flow → returns hh auth code
  client.py                  — ApiClient + OAuthClient (thread-safe, rate-limited, auto token refresh)
  client_keys.py             — ANDROID_CLIENT_ID/SECRET (hardcoded, from hh-applicant-tool)
  user_agent.py              — random Android UA generator
services/
  hh_auth.py                 — in-memory job manager for async OAuth flows + Fernet encrypt + Supabase persist
  hh_credentials.py          — load ApiClient from stored creds; persist if auto-refreshed
  resume_sync.py             — pull /resumes/mine → upsert resumes table
  filters_service.py         — filters CRUD + vacancy preview with excluded_regex
schemas/
  auth.py, resumes.py, filters.py — Pydantic request/response models
```

## Key Design Patterns

**OAuth job flow**: `POST /api/hh/connect` → creates async job (UUID) → returns immediately → client polls `GET /api/hh/connect/{job_id}`. Job runs Playwright in background task (`asyncio.create_task`).

**Captcha handoff**: when Playwright sees captcha, job pauses at `captcha_queue.wait_for()` (5-min timeout), uploads screenshot to Supabase Storage, client sees `captcha_required` + signed URL → user solves → `POST /api/hh/connect/{job_id}/captcha`.

**Supabase client split**: `anon_client` only for JWT validation. `service_client` for all DB/storage writes (bypasses RLS). All sync Supabase calls run in `loop.run_in_executor` — never block the event loop.

**Token credential flow**: `hh_credentials.load_api_client` decrypts tokens → builds `ApiClient` → caller saves `original_access = client.access_token` before calling hh API → after the call, `persist_if_refreshed` re-encrypts and saves if `ApiClient` auto-refreshed the token.

**Token encryption**: Fernet symmetric encryption for hh tokens in `hh_credentials` table. `service_role` key only — no user-visible access.

**hh API client**: `BaseClient` → `OAuthClient` (token exchange) + `ApiClient` (API calls with auto token refresh on 403). Thread-safe via `Lock`. Rate-limited, default 0.345s delay.

## Supabase Tables

- `profiles` — user profiles (used in /health check)
- `hh_credentials` — encrypted hh tokens per user (full RLS denial, service_role only)
- `resumes` — user resume list synced from hh, unique on `(user_id, hh_resume_id)`
- `filters` — saved vacancy search filters per user
- `captcha-screenshots` — Supabase Storage bucket for captcha images

## Tests

Tests set env vars before importing app modules (avoids pydantic-settings crash):

```python
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
# ... other required vars
# THEN import from app.*
```

Tests are unit-level (no real Supabase/Playwright). Async tests use `pytest-asyncio`. Supabase chain calls are mocked with a fluent `MagicMock` helper (see `test_filters_service.py::_fluent`).

## What to Reuse from `hh-applicant-tool/`

Already ported: `client.py`, `client_keys.py`, `authorize.py` (selectors updated — old ones stale).

Still to copy when needed:
- `operations/apply_vacancies.py` — filter pipeline, apply logic, test solver
- `ai/base.py` + `ai/openai.py` — ChatOpenAI client with retry
- `utils/string.py` — `rand_text` template syntax (`{a|b}`)
