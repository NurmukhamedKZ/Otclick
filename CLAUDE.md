# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI autoclicker for hh.ru/hh.kz — automates job applications. Two sub-projects:

- **`backend/`** — FastAPI service (the active new backend being built)
- **`hh-applicant-tool/`** — existing Python CLI tool (s3rgeym's repo, used as source to copy from)

Key discovery: hh.ru password grant OAuth is **broken** (returns `unsupported_grant_type`). Playwright headless browser is the only working login method.

## Commands

All commands run from the repo root with the `.venv` active:

```bash
# Activate venv
source .venv/bin/activate

# Run backend dev server
cd backend && uvicorn app.main:app --reload

# Run tests
cd backend && python -m pytest tests/ -v

# Run single test
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
main.py           — FastAPI app, /health checks Supabase
config.py         — pydantic-settings Settings (reads .env), Fernet lazy init
api/
  deps.py         — get_current_user: validates Supabase JWT via anon_client
  auth.py         — /api/hh/* routes (connect, status, captcha, disconnect)
  router.py       — includes auth router
db/
  supabase.py     — service_client (bypasses RLS), anon_client (JWT validation only)
hh/
  authorize.py    — Playwright OAuth flow → returns hh auth code
  client.py       — ApiClient + OAuthClient (thread-safe, rate-limited, auto token refresh)
  client_keys.py  — ANDROID_CLIENT_ID/SECRET (hardcoded, from hh-applicant-tool)
  user_agent.py   — random Android UA generator
services/
  hh_auth.py      — in-memory job manager for async OAuth flows + Fernet encrypt + Supabase persist
schemas/
  auth.py         — Pydantic request/response models
```

## Key Design Patterns

**OAuth job flow**: `POST /api/hh/connect` → creates async job (UUID) → returns immediately → client polls `GET /api/hh/connect/{job_id}`. Job runs Playwright in background task.

**Captcha handoff**: when Playwright sees captcha, job pauses at `captcha_queue.wait_for()` (5-min timeout), uploads screenshot to Supabase Storage, client sees `captcha_required` status + signed URL → user solves → `POST /api/hh/connect/{job_id}/captcha`.

**Supabase client split**: `anon_client` only for JWT validation (`auth.get_user`). `service_client` for all DB/storage writes (bypasses RLS). All sync Supabase calls run in `loop.run_in_executor` to avoid blocking the event loop.

**Token encryption**: Fernet symmetric encryption for hh tokens stored in `hh_credentials` table. `service_role` key only — no user-visible access.

**hh API client**: `BaseClient` → `OAuthClient` (token exchange) + `ApiClient` (API calls with auto token refresh on 403). Thread-safe via `Lock`. Rate-limited with configurable delay (default 0.345s).

## Supabase Tables

- `profiles` — user profiles (used in /health check)
- `hh_credentials` — encrypted hh tokens per user (full RLS denial, service_role only)
- `captcha-screenshots` — Supabase Storage bucket for captcha images

## What to Reuse from `hh-applicant-tool/`

Don't rewrite — copy directly:
- `api/client.py` → already copied to `backend/app/hh/client.py`
- `api/client_keys.py` → already copied
- `operations/authorize.py` → already copied (selectors updated — old ones are stale)
- `operations/apply_vacancies.py` — filter pipeline, apply logic, test solver
- `ai/base.py` + `ai/openai.py` — ChatOpenAI client with retry
- `utils/string.py` — `rand_text` template syntax

## Tests

Tests set env vars before importing app modules (avoids pydantic-settings crash). Pattern:

```python
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
# ... other required vars
# THEN import from app.*
```

Tests are unit-level (no real Supabase/Playwright). Async tests use `pytest-asyncio`.
