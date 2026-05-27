# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI autoclicker for hh.ru/hh.kz — automates job applications. Sub-projects:

- **`backend/`** — FastAPI service (active build) + standalone worker (`worker_main.py`)
- **`frontend/`** — Next.js 16 + React 19 + Tailwind v4 (Supabase SSR auth)
- **`hh-applicant-tool/`** — existing Python CLI tool (source to copy from, not modify)
- **`MVP_PLAN.md`** — day-by-day build plan; check before starting work

Key discovery: hh.ru password grant OAuth is **broken** (`unsupported_grant_type`). Playwright headless browser is the only working login method.

## Commands

Deps managed by `uv` (root `pyproject.toml` + `uv.lock`, Python ≥3.13). Run with `.venv` active or prefix with `uv run`:

```bash
source .venv/bin/activate   # or: uv sync && source .venv/bin/activate

# Dev server
cd backend && uvicorn app.main:app --reload

# Standalone worker (systemd entrypoint)
cd backend && python worker_main.py

# Frontend dev
cd frontend && npm run dev

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

# AI (cover letters, form-test answers, recruiter chat). Empty key → fallback templates.
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.4-nano

# hh refresh-token cron (shared secret for /internal/cron/*)
INTERNAL_CRON_TOKEN=

# CloudPayments billing
CLOUDPAYMENTS_PUBLIC_ID=
CLOUDPAYMENTS_API_SECRET=   # HMAC key for webhook verification — never exposed
```

All non-secret config (rate limits, plan price, prompts, `REFRESH_THRESHOLD_DAYS`) has defaults in `config.py`.

## Backend Architecture (`backend/app/`)

```
main.py                      — FastAPI app, /health checks Supabase
config.py                    — pydantic-settings Settings (reads .env), Fernet lazy init
api/
  deps.py                    — get_current_user: validates Supabase JWT via anon_client
  auth.py                    — /api/hh/* (connect, poll, captcha, disconnect, status)
  resumes.py                 — /api/resumes/* (sync, list)
  filters.py                 — /api/filters/* (CRUD + vacancy preview)
  blacklist.py               — /api/blacklist/* (employer blacklist CRUD)
  captcha.py                 — /api/captcha/* (pending list, solve, dismiss)
  worker.py                  — /api/worker/* (status/control per user; plan-gated start)
  billing.py                 — /api/billing/* (subscribe params, status, cancel)
  webhooks.py                — /api/webhooks/cloudpayments (HMAC-auth, no JWT)
  internal.py                — /internal/cron/* (X-Internal-Token, no JWT) → token refresh
  _debug.py                  — debug-only routes, mounted iff DEBUG_ENDPOINTS
  router.py                  — aggregates all routers
ai/
  agent.py                   — HHAgent: one ChatOpenAI shared by every AI path (see below)
  prompt.py                  — system prompts (recruiter chat, etc.)
worker/
  runner.py                  — per-user apply loop + WorkerRegistry; captcha pause/poll
  queue.py                   — in-memory per-user ApplyJob queue
  limiter.py                 — daily/hourly apply caps (apply_counters table, per-user tz)
  throttle.py                — inter-request delay + SessionCluster human-like breaks
db/
  supabase.py                — service_client (bypasses RLS), anon_client (JWT validation only)
hh/
  authorize.py               — Playwright OAuth flow → auth code + captured web cookies
  client.py                  — ApiClient + OAuthClient (thread-safe, rate-limited, auto refresh)
  client_keys.py             — ANDROID_CLIENT_ID/SECRET (hardcoded, from hh-applicant-tool)
  errors.py                  — ApiError hierarchy (Forbidden, CaptchaRequired, LimitExceeded, …)
  datatypes.py               — hh API payload typed dicts
  user_agent.py              — random Android UA generator
services/
  hh_auth.py                 — async OAuth job manager + Fernet encrypt/decrypt + persist
  hh_credentials.py          — load ApiClient from stored creds; persist if auto-refreshed
  token_refresh.py           — refresh_user (one) + refresh_due (near-expiry cron batch)
  resume_sync.py             — pull /resumes/mine → upsert resumes table
  filters_service.py         — filters CRUD + vacancy preview with excluded_regex
  vacancy_producer.py        — search per enabled filter → dedup/blacklist/exclude → queue
  apply.py                   — apply_one: one /negotiations submit; maps hh errors → ApplyStatus
  form_filler.py             — solve vacancy tests over hh.ru web session (no browser)
  cover_letter.py            — cover letter gen with PG cache + rand_text fallback
  blacklist.py               — employer blacklist CRUD + bulk auto-blacklist
  billing.py                 — CloudPayments HMAC verify, idempotent payment, plan activate
  plan.py                    — has_access / check_access: does plan grant worker access now
  captcha.py                 — captcha_requests create/solve/dismiss helpers
  notifications.py           — insert notifications rows (UI reads via Realtime)
schemas/
  auth.py, resumes.py, filters.py, blacklist.py, billing.py — Pydantic models
```

## Key Design Patterns

**OAuth job flow**: `POST /api/hh/connect` → creates async job (UUID) → returns immediately → client polls `GET /api/hh/connect/{job_id}`. Job runs Playwright in background task (`asyncio.create_task`).

**Captcha handoff (plan-A, OAuth path)**: when Playwright sees captcha, job pauses at `captcha_queue.wait_for()` (5-min timeout), uploads screenshot to Supabase Storage, client sees `captcha_required` + signed URL → user solves → `POST /api/hh/connect/{job_id}/captcha`.

**Captcha handoff (plan-B, worker path)**: worker hitting captcha during apply inserts a `captcha_requests` row → user lists via `/api/captcha/pending`, solves via `/api/captcha/{id}/solve` (or dismisses) → runner polls queue and resumes.

**Worker model**: `worker_main.py` loads active users from `hh_credentials` (`invalid_at IS NULL`) → `plan.filter_accessible` drops users without a valid plan → spawns one runner per user via `get_registry()` (`WorkerRegistry` in `runner.py`). Each runner loop: refill queue via `vacancy_producer.produce_jobs` → check `limiter` caps → `throttle` sleep → `apply.apply_one` → handle `ApplyStatus`. Captcha pauses the runner and polls `GET /me` until cleared. Graceful shutdown on SIGTERM/SIGINT.

**Apply pipeline** (`apply.apply_one`): resolve resume → skip if already applied → fetch vacancy once (drives 3 decisions: `has_test`, `employer_id`, `response_letter_required`). `has_test` → hand to form filler. Letter required → generate cover letter (else empty message). `POST /negotiations`, then map every hh error to an `ApplyStatus` literal (`sent`/`form_sent`/`captcha`/`token_dead`/`account_banned`/`form_required`/`resume_missing`/`vacancy_gone`/…). Producer also pre-records `has_test` vacancies as `form_required` so they surface in the UI without burning an apply attempt, and auto-blacklists employers on "already applied" / non-empty `relations`.

**Centralized AI (`HHAgent`)**: one `HHAgent` per runner (`ai/agent.py`) wraps a single rate-limited `ChatOpenAI`. ALL LLM work routes through it — `write_form_answers` (form_filler), `write_cover_letter` (cover_letter), `answer_recruiter` (langchain agent w/ per-chat memory). No per-call LLM construction. Empty `OPENAI_API_KEY` → helpers fall back to templates/heuristics, never crash.

**Form-test solving (`form_filler.py`)**: hh vacancy tests are solved over the **hh.ru web session** (not the API) using cookies captured during OAuth login (`web_cookies_encrypted`, Fernet). Parses `vacancyTests` + `xsrfToken` out of the page's inline JSON, answers each task via the shared LLM grounded in a resume summary, POSTs to `vacancy_response/popup`. No browser, no re-login. Failure → `form_required` fallback.

**Cover letter cache**: `cover_letter.generate` keys on `(vacancy_id, resume_id)` in `cover_letters_cache` (PG). Hit → skip OpenAI. Miss → LLM → on failure, `rand_text` `{a|b}` template. All writes service_role.

**Plan gating**: `plan.has_access` — `trial` until `trial_ends`, `active`/`cancelled` until `plan_expires_at`, else no access. Gates worker start (`/api/worker`) and `worker_main`.

**Billing**: CloudPayments widget (params from `billing.subscribe_params`) → card charge → server-to-server POST to `/api/webhooks/cloudpayments`. Webhook verifies `Content-HMAC` (HMAC-SHA256 over raw body), records payment idempotently (`TransactionId` → `payments.provider_payment_id` UNIQUE), activates plan only on a genuinely new row. Always answers CP `{"code": 0}` once HMAC valid so it stops retrying.

**Token refresh cron**: `POST /internal/cron/refresh-tokens` (guarded by `X-Internal-Token`) → `token_refresh.refresh_due` refreshes only creds expiring within `REFRESH_THRESHOLD_DAYS` (hh refresh tokens are single-use, only usable after the access token expires). Trigger from system cron.

**Notifications**: worker events (`apply_success`, `captcha`, `limit_reached`, `token_dead`, `account_banned`, …) insert `notifications` rows; the frontend reads them via Supabase Realtime.

**Supabase client split**: `anon_client` only for JWT validation. `service_client` for all DB/storage writes (bypasses RLS). All sync Supabase calls run in `loop.run_in_executor` — never block the event loop.

**Token credential flow**: `hh_credentials.load_api_client` decrypts tokens → builds `ApiClient` → caller saves `original_access = client.access_token` before calling hh API → after the call, `persist_if_refreshed` re-encrypts and saves if `ApiClient` auto-refreshed the token.

**Token encryption**: Fernet symmetric encryption for hh tokens in `hh_credentials` table. `service_role` key only — no user-visible access.

**hh API client**: `BaseClient` → `OAuthClient` (token exchange) + `ApiClient` (API calls with auto token refresh on 403). Thread-safe via `Lock`. Rate-limited, default 0.345s delay.

## Frontend (`frontend/src/`)

Next.js App Router. Authed pages under `app/(app)/` (dashboard, applications, billing, account, notifications) behind `(app)/layout.tsx`; public `auth/`, `onboarding/`, landing `page.tsx`. Supabase SSR auth split across `lib/supabase/{client,server,middleware}.ts`.

- `lib/api.ts` — `apiFetch`: attaches the Supabase session JWT as `Bearer` to every backend call (backend `deps.get_current_user` validates it). Base URL from `NEXT_PUBLIC_API_URL`.
- `hooks/` — `useHHConnect`, `useFilters`, `useBlacklist` wrap the backend endpoints.
- `components/otclick/` — app chrome (sidebar, topbar, worker-bar, hh-banner); top-level `captcha-modal`, `filters-drawer`, `toaster`.
- Notifications stream in via Supabase Realtime (matches backend `notifications` inserts).

Env: `frontend/.env.local` (see `.env.local.example`) — `NEXT_PUBLIC_API_URL`, Supabase URL/anon key.

## Supabase Tables

Migrations live in `infra/supabase/migrations/` (numbered SQL files).

- `profiles` — user profiles + plan state (`plan`, `trial_ends`, `plan_expires_at`, `cp_subscription_id`)
- `hh_credentials` — encrypted hh tokens + `web_cookies_encrypted` per user (full RLS denial, service_role only)
- `resumes` — user resume list synced from hh, unique on `(user_id, hh_resume_id)`
- `filters` — saved vacancy search filters per user
- `applications` — apply attempts/results, unique on `(user_id, vacancy_id)`; stores status, cover_letter, `form_answers`
- `blacklist` — blacklisted employers per user, unique on `(user_id, employer_id)`
- `apply_counters` — per-user daily/hourly apply tallies (limiter)
- `cover_letters_cache` — generated cover letters keyed on `(vacancy_id, resume_id)`
- `vacancy_cache` — cached hh vacancy payloads
- `payments` — CloudPayments transactions, unique on `provider_payment_id`
- `notifications` — worker→UI events (read via Realtime)
- `captcha_requests` — pending captcha challenges raised by worker
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

Already ported: `client.py`, `client_keys.py`, `authorize.py` (selectors updated — old ones stale), apply/filter pipeline (`services/apply.py`, `vacancy_producer.py`), AI (`ai/agent.py` + LLM-backed services), `rand_text` (`services/cover_letter.py`).

The CLI tool remains a reference for hh API quirks — read it, don't modify it.

----

1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

    State your assumptions explicitly. If uncertain, ask.
    If multiple interpretations exist, present them - don't pick silently.
    If a simpler approach exists, say so. Push back when warranted.
    If something is unclear, stop. Name what's confusing. Ask.

2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

    No features beyond what was asked.
    No abstractions for single-use code.
    No "flexibility" or "configurability" that wasn't requested.
    No error handling for impossible scenarios.
    If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

    Don't "improve" adjacent code, comments, or formatting.
    Don't refactor things that aren't broken.
    Match existing style, even if you'd do it differently.
    If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

    Remove imports/variables/functions that YOUR changes made unused.
    Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.
4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

    "Add validation" → "Write tests for invalid inputs, then make them pass"
    "Fix the bug" → "Write a test that reproduces it, then make it pass"
    "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.