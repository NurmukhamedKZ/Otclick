# FastAPI Skeleton (Day 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build working FastAPI backend that handles hh.ru OAuth onboarding via Playwright. User sends credentials → backend runs Playwright → exchanges code → encrypts and writes to Supabase `hh_credentials`.

**Architecture:** Three-layer split — `api/` (HTTP routes), `services/` (business logic, Supabase, Fernet), `hh/` (low-level hh.ru HTTP+Playwright client, copied from `hh-applicant-tool`). In-memory job dict for Playwright session state. Supabase SDK for JWT validation.

**Tech Stack:** FastAPI, uvicorn, pydantic-settings, cryptography (Fernet), supabase-py, playwright, requests.

---

## File Plan

**Create:**
- `backend/app/config.py`
- `backend/app/api/__init__.py`
- `backend/app/api/deps.py`
- `backend/app/api/router.py`
- `backend/app/api/auth.py`
- `backend/app/hh/__init__.py`
- `backend/app/hh/client_keys.py`
- `backend/app/hh/user_agent.py`
- `backend/app/hh/datatypes.py`
- `backend/app/hh/errors.py`
- `backend/app/hh/client.py`
- `backend/app/hh/authorize.py`
- `backend/app/schemas/__init__.py`
- `backend/app/schemas/auth.py`
- `backend/app/services/__init__.py`
- `backend/app/services/hh_auth.py`
- `backend/tests/__init__.py`
- `backend/tests/test_hh_auth.py`

**Modify:**
- `backend/app/main.py` (currently empty)
- `backend/app/services/hh_auth.py` (currently empty)
- `backend/app/services/captcha.py` (currently empty — leave for later, do not edit)
- `pyproject.toml` (add fastapi, uvicorn, pydantic-settings, pytest)

---

## Task 1: Add dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Update `pyproject.toml` dependencies**

Replace the `dependencies` array:

```toml
[project]
name = "aiautoclicker"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
    "playwright>=1.60.0",
    "python-dotenv>=1.2.2",
    "requests>=2.34.2",
    "supabase>=2.10.0",
    "cryptography>=43.0.0",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic-settings>=2.6.0",
    "python-multipart>=0.0.12",
]

[dependency-groups]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
]
```

- [ ] **Step 2: Install**

Run: `uv sync`

Expected: deps installed, lock file updated.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "chore: add fastapi, uvicorn, pydantic-settings, pytest deps"
```

---

## Task 2: Create config module

**Files:**
- Create: `backend/app/config.py`

- [ ] **Step 1: Write `backend/app/config.py`**

```python
from functools import cached_property

from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    FERNET_KEY: str

    @cached_property
    def fernet(self) -> Fernet:
        return Fernet(self.FERNET_KEY.encode())


settings = Settings()
```

- [ ] **Step 2: Smoke test from `backend/` directory**

Run: `cd backend && python -c "from app.config import settings; print(settings.SUPABASE_URL[:20], 'fernet ok' if settings.fernet else 'fail')"`

Expected: prints first 20 chars of SUPABASE_URL and `fernet ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat: add Settings module with Fernet helper"
```

---

## Task 3: Copy hh client modules (low-level)

**Files:**
- Create: `backend/app/hh/__init__.py`
- Create: `backend/app/hh/client_keys.py`
- Create: `backend/app/hh/user_agent.py`
- Create: `backend/app/hh/datatypes.py`
- Create: `backend/app/hh/errors.py`

- [ ] **Step 1: Create `backend/app/hh/__init__.py`** (empty file)

- [ ] **Step 2: Create `backend/app/hh/client_keys.py`**

```python
ANDROID_CLIENT_ID = (
    "HIOMIAS39CA9DICTA7JIO64LQKQJF5AGIK74G9ITJKLNEDAOH5FHS5G1JI7FOEGD"
)

ANDROID_CLIENT_SECRET = (
    "V9M870DE342BGHFRUJ5FTCGCUA1482AN0DI8C5TFI9ULMA89H10N60NOP8I4JMVS"
)
```

- [ ] **Step 3: Create `backend/app/hh/user_agent.py`**

Copy verbatim from `hh-applicant-tool/src/hh_applicant_tool/api/user_agent.py` (the `generate_android_useragent` function + `MOBILE_MODELS` list).

- [ ] **Step 4: Create `backend/app/hh/datatypes.py`**

Minimal version — only what we use in Day 4:

```python
from __future__ import annotations

from typing import Literal, TypedDict


class AccessToken(TypedDict):
    access_token: str
    refresh_token: str
    access_expires_at: int  # Unix timestamp
```

- [ ] **Step 5: Create `backend/app/hh/errors.py`**

Copy verbatim from `hh-applicant-tool/src/hh_applicant_tool/api/errors.py`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/hh/__init__.py backend/app/hh/client_keys.py backend/app/hh/user_agent.py backend/app/hh/datatypes.py backend/app/hh/errors.py
git commit -m "feat: copy hh.ru low-level modules (keys, UA, datatypes, errors)"
```

---

## Task 4: Adapt hh client.py

**Files:**
- Create: `backend/app/hh/client.py`

- [ ] **Step 1: Copy `hh-applicant-tool/src/hh_applicant_tool/api/client.py` to `backend/app/hh/client.py`**

- [ ] **Step 2: Fix import — change**

```python
from hh_applicant_tool.api.user_agent import generate_android_useragent
```

to:

```python
from .user_agent import generate_android_useragent
```

- [ ] **Step 3: Verify import works**

Run: `cd backend && python -c "from app.hh.client import ApiClient, OAuthClient; print('ok')"`

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/hh/client.py
git commit -m "feat: copy hh ApiClient + OAuthClient with local imports"
```

---

## Task 5: Adapt Playwright authorize.py

**Files:**
- Create: `backend/app/hh/authorize.py`

This is adapted from `backend/poc_day1_playwright.py` `get_auth_code` — but parameterized to support captcha handoff via `asyncio.Queue` and screenshot upload callback.

- [ ] **Step 1: Write `backend/app/hh/authorize.py`**

```python
"""Playwright OAuth flow for hh.ru.

Adapted from backend/poc_day1_playwright.py. Differs from
hh-applicant-tool/operations/authorize.py — the upstream selectors are stale
(Magritte UI changed). Our POC selectors are verified Day 1.
"""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.async_api import async_playwright

from .client_keys import ANDROID_CLIENT_ID

HH_OAUTH_AUTHORIZE = "https://hh.ru/oauth/authorize"
HH_ANDROID_SCHEME = "hhandroid"

SEL_LOGIN_INPUT = 'input[data-qa="login-input-username"]'
SEL_EXPAND_PASSWORD = 'button:has-text("Войти с паролем")'
SEL_PASSWORD_INPUT = 'input[data-qa="login-input-password"]'
SEL_CAPTCHA_IMAGE = 'img[data-qa="account-captcha-picture"]'
SEL_CAPTCHA_INPUT = 'input[data-qa="account-captcha-input"]'


def build_authorize_url() -> str:
    qs = urlencode({"client_id": ANDROID_CLIENT_ID, "response_type": "code"})
    return f"{HH_OAUTH_AUTHORIZE}?{qs}"


async def get_auth_code(
    username: str,
    password: str,
    on_captcha: Callable[[bytes], Awaitable[str]] | None = None,
    headless: bool = True,
) -> str:
    """Run Playwright OAuth flow → returns hh OAuth code.

    on_captcha: async callback (screenshot_png_bytes) -> solution_string.
                If captcha appears and callback is None, raises RuntimeError.
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        try:
            device = pw.devices["Galaxy A55"]
            context = await browser.new_context(**device)
            page = await context.new_page()

            code_future: asyncio.Future[str | None] = asyncio.Future()

            def handle_request(request):
                url = request.url
                if url.startswith(f"{HH_ANDROID_SCHEME}://"):
                    if not code_future.done():
                        code = parse_qs(urlsplit(url).query).get("code", [None])[0]
                        code_future.set_result(code)

            page.on("request", handle_request)

            await page.goto(build_authorize_url(), timeout=30000, wait_until="load")

            await page.wait_for_selector(SEL_LOGIN_INPUT, timeout=10000, state="visible")
            await page.fill(SEL_LOGIN_INPUT, username)

            await page.wait_for_selector(SEL_EXPAND_PASSWORD, timeout=5000, state="visible")
            await page.click(SEL_EXPAND_PASSWORD)

            await _handle_captcha_if_present(page, on_captcha)

            await page.wait_for_selector(SEL_PASSWORD_INPUT, timeout=10000, state="visible")
            await page.fill(SEL_PASSWORD_INPUT, password)
            await page.keyboard.press("Enter")

            await _handle_captcha_if_present(page, on_captcha)

            code = await asyncio.wait_for(code_future, timeout=120.0)
            if not code:
                raise RuntimeError("OAuth code empty in hhandroid:// redirect")
            return code
        finally:
            await browser.close()


async def _handle_captcha_if_present(page, on_captcha):
    try:
        await page.wait_for_selector(SEL_CAPTCHA_IMAGE, timeout=2500, state="visible")
    except Exception:
        return  # no captcha

    if on_captcha is None:
        raise RuntimeError("Captcha required but no handler provided")

    screenshot = await page.locator(SEL_CAPTCHA_IMAGE).screenshot()
    solution = await on_captcha(screenshot)
    await page.fill(SEL_CAPTCHA_INPUT, solution)
    await page.keyboard.press("Enter")
```

- [ ] **Step 2: Smoke import**

Run: `cd backend && python -c "from app.hh.authorize import get_auth_code, build_authorize_url; print(build_authorize_url())"`

Expected: prints `https://hh.ru/oauth/authorize?client_id=HIOMIAS...&response_type=code`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/hh/authorize.py
git commit -m "feat: add Playwright OAuth flow with captcha handoff callback"
```

---

## Task 6: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/auth.py`

- [ ] **Step 1: Create empty `backend/app/schemas/__init__.py`**

- [ ] **Step 2: Create `backend/app/schemas/auth.py`**

```python
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

JobStatus = Literal["running", "captcha_required", "success", "failed"]


class HHConnectRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class HHConnectResponse(BaseModel):
    job_id: str
    status: JobStatus


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    screenshot_url: str | None = None
    error: str | None = None


class CaptchaSolveRequest(BaseModel):
    solution: str = Field(min_length=1)


class HHStatusResponse(BaseModel):
    connected: bool
    expires_at: datetime | None = None
    last_refreshed_at: datetime | None = None
    hh_user_id: str | None = None
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/__init__.py backend/app/schemas/auth.py
git commit -m "feat: add auth Pydantic schemas"
```

---

## Task 7: Write test for hh_auth service (TDD)

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_hh_auth.py`

- [ ] **Step 1: Create empty `backend/tests/__init__.py`**

- [ ] **Step 2: Write failing tests in `backend/tests/test_hh_auth.py`**

```python
import asyncio
import os

import pytest

# Set required env BEFORE importing app modules
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault(
    "FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc="
)


def test_encrypt_decrypt_roundtrip():
    from app.services.hh_auth import decrypt_token, encrypt_token

    plain = "USER_TOKEN_abc123"
    enc = encrypt_token(plain)
    assert enc != plain
    assert decrypt_token(enc) == plain


def test_job_state_lifecycle():
    from app.services.hh_auth import JobState, _jobs

    _jobs.clear()
    job_id = "test-job-id"
    state = JobState(user_id="user-1", status="running")
    _jobs[job_id] = state

    assert _jobs[job_id].status == "running"
    _jobs[job_id].status = "success"
    assert _jobs[job_id].status == "success"
    _jobs.clear()


@pytest.mark.asyncio
async def test_solve_captcha_unblocks_queue():
    from app.services.hh_auth import JobState, _jobs, solve_captcha

    _jobs.clear()
    job_id = "captcha-job"
    state = JobState(user_id="user-1", status="captcha_required")
    _jobs[job_id] = state

    solved = asyncio.create_task(state.captcha_queue.get())
    await solve_captcha(job_id, "abc123")
    result = await asyncio.wait_for(solved, timeout=1.0)
    assert result == "abc123"
    _jobs.clear()
```

- [ ] **Step 3: Add pytest config**

Create `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
pythonpath = .
```

- [ ] **Step 4: Run tests — verify they fail**

Run: `cd backend && uv run pytest tests/test_hh_auth.py -v`

Expected: FAIL with ImportError (`app.services.hh_auth` has no `encrypt_token` / `JobState` / `solve_captcha`).

- [ ] **Step 5: Commit**

```bash
git add backend/tests/__init__.py backend/tests/test_hh_auth.py backend/pytest.ini
git commit -m "test: add failing tests for hh_auth service"
```

---

## Task 8: Implement hh_auth service

**Files:**
- Create: `backend/app/services/__init__.py`
- Modify: `backend/app/services/hh_auth.py` (currently empty)

- [ ] **Step 1: Create empty `backend/app/services/__init__.py`** (if not exists)

- [ ] **Step 2: Write `backend/app/services/hh_auth.py`**

```python
"""hh OAuth onboarding: Playwright job manager + Fernet + Supabase writes."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from app.config import settings
from app.db.supabase import service_client
from app.hh.authorize import get_auth_code
from app.hh.client import ApiClient, OAuthClient
from app.hh.user_agent import generate_android_useragent

logger = logging.getLogger(__name__)

JobStatus = Literal["running", "captcha_required", "success", "failed"]


@dataclass
class JobState:
    user_id: str
    status: JobStatus = "running"
    captcha_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    screenshot_url: str | None = None
    error: str | None = None


_jobs: dict[str, JobState] = {}


def encrypt_token(plain: str) -> str:
    return settings.fernet.encrypt(plain.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    return settings.fernet.decrypt(encrypted.encode()).decode()


def get_job(job_id: str) -> JobState | None:
    return _jobs.get(job_id)


async def start_connect_job(user_id: str, username: str, password: str) -> str:
    job_id = str(uuid.uuid4())
    state = JobState(user_id=user_id)
    _jobs[job_id] = state
    asyncio.create_task(_run_oauth(job_id, username, password))
    return job_id


async def solve_captcha(job_id: str, solution: str) -> None:
    state = _jobs.get(job_id)
    if not state:
        raise KeyError(f"job {job_id} not found")
    await state.captcha_queue.put(solution)


async def _run_oauth(job_id: str, username: str, password: str) -> None:
    state = _jobs[job_id]
    try:
        async def on_captcha(screenshot_png: bytes) -> str:
            state.status = "captcha_required"
            path = f"{state.user_id}/{job_id}.png"
            service_client.storage.from_("captcha-screenshots").upload(
                path, screenshot_png,
                {"content-type": "image/png", "upsert": "true"},
            )
            signed = service_client.storage.from_(
                "captcha-screenshots"
            ).create_signed_url(path, 600)
            state.screenshot_url = signed.get("signedURL") or signed.get("signedUrl")
            solution = await state.captcha_queue.get()
            state.status = "running"
            return solution

        code = await get_auth_code(username, password, on_captcha=on_captcha)
        token = _exchange_and_fetch_user(code)
        _persist_credentials(state.user_id, token["access_token"],
                             token["refresh_token"],
                             token["access_expires_at"],
                             token["hh_user_id"])
        state.status = "success"
    except Exception as ex:
        logger.exception("hh oauth job %s failed", job_id)
        state.status = "failed"
        state.error = str(ex)


def _exchange_and_fetch_user(code: str) -> dict:
    ua = generate_android_useragent()
    oauth = OAuthClient(user_agent=ua)
    tok = oauth.authenticate(code)
    api = ApiClient(
        user_agent=ua,
        access_token=tok["access_token"],
        refresh_token=tok["refresh_token"],
        access_expires_at=tok["access_expires_at"],
    )
    me = api.get("me")
    return {
        "access_token": tok["access_token"],
        "refresh_token": tok["refresh_token"],
        "access_expires_at": tok["access_expires_at"],
        "hh_user_id": str(me["id"]),
    }


def _persist_credentials(user_id: str, access: str, refresh: str,
                         expires_at: int, hh_user_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    service_client.table("hh_credentials").upsert({
        "user_id": user_id,
        "access_token_encrypted": encrypt_token(access),
        "refresh_token_encrypted": encrypt_token(refresh),
        "expires_at": datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat(),
        "hh_user_id": hh_user_id,
        "last_refreshed_at": now,
    }).execute()


def get_credentials_status(user_id: str) -> dict:
    res = service_client.table("hh_credentials").select(
        "expires_at,last_refreshed_at,hh_user_id"
    ).eq("user_id", user_id).maybe_single().execute()
    data = res.data if res else None
    if not data:
        return {"connected": False}
    return {
        "connected": True,
        "expires_at": data.get("expires_at"),
        "last_refreshed_at": data.get("last_refreshed_at"),
        "hh_user_id": data.get("hh_user_id"),
    }


def disconnect(user_id: str) -> None:
    service_client.table("hh_credentials").delete().eq("user_id", user_id).execute()
```

- [ ] **Step 3: Run tests — verify pass**

Run: `cd backend && uv run pytest tests/test_hh_auth.py -v`

Expected: all 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/hh_auth.py
git commit -m "feat: implement hh_auth service (jobs, Fernet, Supabase persist)"
```

---

## Task 9: Auth dependency (JWT validation)

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/deps.py`

- [ ] **Step 1: Create empty `backend/app/api/__init__.py`**

- [ ] **Step 2: Write `backend/app/api/deps.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.supabase import anon_client

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Validate Supabase JWT → return user_id (uuid string)."""
    try:
        res = anon_client.auth.get_user(creds.credentials)
    except Exception as ex:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid token: {ex}",
        ) from ex
    user = getattr(res, "user", None)
    if user is None or not getattr(user, "id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token: no user",
        )
    return user.id
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/__init__.py backend/app/api/deps.py
git commit -m "feat: add Supabase JWT auth dependency"
```

---

## Task 10: Auth router (endpoints)

**Files:**
- Create: `backend/app/api/auth.py`

- [ ] **Step 1: Write `backend/app/api/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.schemas.auth import (
    CaptchaSolveRequest,
    HHConnectRequest,
    HHConnectResponse,
    HHStatusResponse,
    JobStatusResponse,
)
from app.services import hh_auth

router = APIRouter(prefix="/api/hh", tags=["hh"])


@router.post("/connect", response_model=HHConnectResponse)
async def connect(
    body: HHConnectRequest,
    user_id: str = Depends(get_current_user),
):
    job_id = await hh_auth.start_connect_job(user_id, body.username, body.password)
    return HHConnectResponse(job_id=job_id, status="running")


@router.get("/connect/{job_id}", response_model=JobStatusResponse)
async def connect_status(
    job_id: str,
    user_id: str = Depends(get_current_user),
):
    state = hh_auth.get_job(job_id)
    if not state or state.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return JobStatusResponse(
        job_id=job_id,
        status=state.status,
        screenshot_url=state.screenshot_url,
        error=state.error,
    )


@router.post("/connect/{job_id}/captcha", status_code=status.HTTP_204_NO_CONTENT)
async def submit_captcha(
    job_id: str,
    body: CaptchaSolveRequest,
    user_id: str = Depends(get_current_user),
):
    state = hh_auth.get_job(job_id)
    if not state or state.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    if state.status != "captcha_required":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="captcha not pending")
    await hh_auth.solve_captcha(job_id, body.solution)


@router.post("/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(user_id: str = Depends(get_current_user)):
    hh_auth.disconnect(user_id)


@router.get("/status", response_model=HHStatusResponse)
async def hh_status(user_id: str = Depends(get_current_user)):
    return HHStatusResponse(**hh_auth.get_credentials_status(user_id))
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/auth.py
git commit -m "feat: add hh connect/disconnect/status endpoints"
```

---

## Task 11: Router assembly + main app

**Files:**
- Create: `backend/app/api/router.py`
- Modify: `backend/app/main.py` (currently empty)

- [ ] **Step 1: Write `backend/app/api/router.py`**

```python
from fastapi import APIRouter

from app.api import auth

api_router = APIRouter()
api_router.include_router(auth.router)
```

- [ ] **Step 2: Write `backend/app/main.py`**

```python
from fastapi import FastAPI

from app.api.router import api_router
from app.db.supabase import service_client

app = FastAPI(title="AIautoclicker API", version="0.1.0")
app.include_router(api_router)


@app.get("/health")
def health():
    db_ok = False
    try:
        service_client.table("profiles").select("id").limit(1).execute()
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok}
```

- [ ] **Step 3: Smoke test — start uvicorn**

Run: `cd backend && uv run uvicorn app.main:app --reload --port 8000`

In another terminal: `curl http://localhost:8000/health`

Expected: `{"status":"ok","db":true}`.

Stop server (Ctrl+C).

- [ ] **Step 4: Smoke test — OpenAPI schema lists endpoints**

Start server again, then: `curl -s http://localhost:8000/openapi.json | python -c "import json,sys; d=json.load(sys.stdin); print(sorted(d['paths'].keys()))"`

Expected: contains `/health`, `/api/hh/connect`, `/api/hh/connect/{job_id}`, `/api/hh/connect/{job_id}/captcha`, `/api/hh/disconnect`, `/api/hh/status`.

Stop server.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/router.py backend/app/main.py
git commit -m "feat: wire FastAPI app + /health endpoint"
```

---

## Task 12: End-to-end manual verification

**Files:** none (manual)

- [ ] **Step 1: Start uvicorn**

Run: `cd backend && uv run uvicorn app.main:app --reload --port 8000`

- [ ] **Step 2: Unauthorized request returns 401**

Run (other terminal): `curl -i http://localhost:8000/api/hh/status`

Expected: `HTTP/1.1 403 Forbidden` (HTTPBearer auto_error) with `{"detail":"Not authenticated"}`.

- [ ] **Step 3: Bogus token returns 401**

Run: `curl -i -H "Authorization: Bearer fake.jwt.here" http://localhost:8000/api/hh/status`

Expected: `HTTP/1.1 401 Unauthorized` with `{"detail":"invalid token: ..."}`.

- [ ] **Step 4: Real JWT path** (skip if no Supabase user yet)

Get a Supabase access token via `curl` against Supabase Auth endpoint OR via Supabase dashboard JWT helper. Then:

```bash
curl -H "Authorization: Bearer <real_supabase_jwt>" http://localhost:8000/api/hh/status
```

Expected: `{"connected":false,...}` (no `hh_credentials` row yet).

- [ ] **Step 5: Stop server, commit nothing (manual verification only)**

---

## Self-Review

**Spec coverage:**
- File structure (spec §"File Structure") → Task 2-11
- Endpoints (spec §"Endpoints") → Task 10 (POST/GET/POST captcha/disconnect/status) + Task 11 (/health)
- Data flow POST /api/hh/connect → Task 8 (`start_connect_job` + `_run_oauth`)
- Captcha flow → Task 5 (`on_captcha` callback in `get_auth_code`) + Task 8 (`on_captcha` impl uses `captcha_queue.get()`)
- JobState (in-memory) → Task 8
- Supabase write to `hh_credentials` → Task 8 (`_persist_credentials`)
- Fernet encrypt/decrypt → Task 8 (`encrypt_token`/`decrypt_token`) + Task 7 (test)
- JWT via Supabase SDK → Task 9 (`anon_client.auth.get_user`)
- `hh/` vs `services/` separation → Task 3-5 (low-level) vs Task 8 (uses Supabase + Fernet)

All spec requirements covered.

**Type consistency:**
- `JobStatus` literal used identically in `schemas/auth.py` and `services/hh_auth.py`
- `JobState.captcha_queue` is `asyncio.Queue` everywhere
- `access_expires_at: int` (Unix ts) returned by `OAuthClient.authenticate()` → converted to ISO via `datetime.fromtimestamp` for Supabase

**Placeholder scan:** None found. Every step has exact code or exact command.
