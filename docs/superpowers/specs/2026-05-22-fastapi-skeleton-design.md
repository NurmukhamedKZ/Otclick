# FastAPI Skeleton — Day 4 Design

**Date:** 2026-05-22  
**Scope:** Backend FastAPI skeleton + hh OAuth connect flow (full working implementation)

---

## Goal

Build a working FastAPI backend that handles hh.ru OAuth onboarding via Playwright.
After Day 4 a user can: send credentials → backend runs Playwright → exchanges code for tokens → encrypts and stores in Supabase.

---

## File Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app + lifespan
│   ├── config.py            # Pydantic BaseSettings from .env
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py        # assembles all routers
│   │   ├── deps.py          # get_current_user (Supabase SDK JWT check)
│   │   └── auth.py          # 6 hh endpoints + /health
│   │
│   ├── hh/                  # low-level hh.ru HTTP client (copied from hh-applicant-tool)
│   │   ├── __init__.py
│   │   ├── client.py        # ApiClient + OAuthClient (CLI deps removed)
│   │   ├── client_keys.py   # ANDROID_CLIENT_ID / SECRET
│   │   ├── user_agent.py    # mobile UA rotation
│   │   ├── datatypes.py     # AccessToken TypedDict
│   │   └── authorize.py     # Playwright OAuth flow — adapted from poc_day1_playwright.py (NOT from hh-applicant-tool/authorize.py which has stale selectors)
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── auth.py          # HHConnectRequest, JobStatusResponse, HHStatusResponse
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   └── hh_auth.py       # job manager, Fernet encrypt/decrypt, Supabase writes
│   │
│   └── db/
│       ├── __init__.py
│       └── supabase.py      # already exists — service_client + anon_client
│
└── pyproject.toml           # add fastapi, uvicorn[standard], python-jose
```

**Separation of concerns:**
- `hh/` — knows only how to talk to hh.ru API. No users, no Supabase.
- `services/hh_auth.py` — knows about users, Supabase, Fernet. Uses `hh/` internally.
- `api/auth.py` — HTTP layer only. Delegates to services.

---

## Endpoints

All protected routes require `Authorization: Bearer <supabase_jwt>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/hh/connect` | Body: `{username, password}` → start Playwright job → `{job_id, status: "running"}` |
| `GET` | `/api/hh/connect/{job_id}` | Poll: `running / captcha_required / success / failed` |
| `POST` | `/api/hh/connect/{job_id}/captcha` | Body: `{solution}` → unblocks Playwright via asyncio.Queue |
| `POST` | `/api/hh/disconnect` | Delete `hh_credentials` row, mark disconnected |
| `GET` | `/api/hh/status` | `{connected, expires_at, last_refreshed_at}` |
| `GET` | `/health` | `{status, db}` — public, no auth |

---

## Data Flow

### POST /api/hh/connect

```
request (username, password)
  → deps.get_current_user()  — validates Supabase JWT, extracts user_id
  → hh_auth.start_connect_job(user_id, username, password)
      → creates JobState in _jobs dict
      → asyncio.create_task(playwright_oauth_task(...))
      → returns job_id
  → response {job_id, status: "running"}

playwright_oauth_task(user_id, username, password, job_id):
  → hh/authorize.py  — Playwright headless chromium
      → goto hh OAuth authorize URL
      → fill username → click "Войти с паролем" → fill password → Enter
      → intercept hhandroid://oauthresponse?code=...
  → hh/client.py OAuthClient.authenticate(code) → {access_token, refresh_token, access_expires_at: int (Unix ts)}
      → datetime.utcfromtimestamp(access_expires_at) → ISO string for Supabase
  → hh/client.py ApiClient.get("/me") → hh_user_id
  → Fernet.encrypt(access_token), Fernet.encrypt(refresh_token)
  → service_client.table("hh_credentials").upsert({...})
  → _jobs[job_id].status = "success"
```

### Captcha flow

```
playwright_oauth_task detects captcha image:
  → takes screenshot → uploads to Supabase Storage (captcha-screenshots bucket)
  → _jobs[job_id].status = "captcha_required"
  → _jobs[job_id].screenshot_url = storage_url
  → awaits captcha_queue.get()  — blocks until solution arrives

POST /api/hh/connect/{job_id}/captcha {solution}:
  → hh_auth.solve_captcha(job_id, solution)
      → _jobs[job_id].captcha_queue.put(solution)
  → Playwright fills captcha input → submits → continues to hhandroid:// redirect
```

---

## Key Data Structures

### JobState (in-memory)

```python
@dataclass
class JobState:
    user_id: str
    status: str               # running / captcha_required / success / failed
    captcha_queue: asyncio.Queue
    screenshot_url: str | None = None
    error: str | None = None

_jobs: dict[str, JobState] = {}  # job_id (uuid4) → JobState
```

### hh_credentials (Supabase — RLS: DENY ALL, service_role only)

```python
{
    "user_id": str,
    "access_token_encrypted": str,   # Fernet encrypted
    "refresh_token_encrypted": str,  # Fernet encrypted
    "expires_at": str,               # ISO timestamp
    "hh_user_id": str,
    "last_refreshed_at": str,
}
```

---

## JWT Authentication

`deps.get_current_user(token: str = Depends(oauth2_scheme))`:
- Calls `anon_client.auth.get_user(token)` 
- Returns `user_id: str`
- Raises HTTP 401 on invalid/expired token

Using Supabase SDK (not local JWKS decode) — simpler, no key management.

---

## Encryption

```python
# config.py
from cryptography.fernet import Fernet

class Settings(BaseSettings):
    FERNET_KEY: str
    
    @property
    def fernet(self) -> Fernet:
        return Fernet(self.FERNET_KEY.encode())
```

Fernet key generated once, stored in `.env`. Never changes after first deploy.

---

## Dependencies to add

```toml
# pyproject.toml
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
python-multipart>=0.0.12   # for form data
```

---

## Out of scope for Day 4

- Worker (asyncio.Queue auto-apply engine) — Day 10-12
- Resume sync endpoint — Day 5
- Filters CRUD — Day 5
- Billing — Day 19
- Cover letter — Day 13
