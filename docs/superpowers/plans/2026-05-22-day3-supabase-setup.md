# Day 3: Supabase Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Supabase project with all tables, RLS policies, Storage bucket, and Python client so backend can read/write data securely.

**Architecture:** SQL migration files in git (`infra/supabase/migrations/`) run manually via Supabase Dashboard SQL Editor. FastAPI uses two `supabase-py` clients — `service_client` (bypasses RLS, for all writes) and `anon_client` (for JWT validation). Fernet key stored in `.env`, never in git.

**Tech Stack:** Supabase (Postgres + Auth + Storage + Realtime), `supabase-py`, `cryptography` (Fernet), `python-dotenv`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `infra/supabase/migrations/001_init.sql` | Create | All tables + RLS policies + auth trigger + Realtime |
| `infra/supabase/migrations/002_indexes.sql` | Create | Performance indexes |
| `backend/app/db/__init__.py` | Create | Package marker |
| `backend/app/db/supabase.py` | Create | `service_client` + `anon_client` singletons |
| `backend/scripts/smoke_test_supabase.py` | Create | Verify connection works end-to-end |
| `backend/.env.example` | Modify | Add Supabase + Fernet vars |
| `backend/.env` | Modify (manual) | Add real keys (never commit) |
| `pyproject.toml` | Modify | Add `supabase`, `cryptography` dependencies |

---

## Task 1: Create Supabase project (manual)

**Files:** none (external step)

- [ ] **Step 1: Go to supabase.com → New project**

  Fill in: name `aiautoclicker`, strong DB password (save it!), region closest to your VPS (eu-central-1 for Contabo Frankfurt).

- [ ] **Step 2: Wait for project to provision (~2 min)**

- [ ] **Step 3: Get credentials**

  Dashboard → Settings → API. Copy:
  - `Project URL` → `SUPABASE_URL`
  - `anon public` key → `SUPABASE_ANON_KEY`
  - `service_role secret` key → `SUPABASE_SERVICE_ROLE_KEY`

  Save all three — you'll need them in Task 5.

---

## Task 2: Write `001_init.sql`

**Files:**
- Create: `infra/supabase/migrations/001_init.sql`

- [ ] **Step 1: Create directory**

  ```bash
  mkdir -p infra/supabase/migrations
  ```

- [ ] **Step 2: Write the migration file**

  Create `infra/supabase/migrations/001_init.sql` with this exact content:

  ```sql
  -- ============================================================
  -- 001_init.sql — tables, RLS, auth trigger, Realtime
  -- Run in Supabase Dashboard → SQL Editor
  -- ============================================================

  -- Auth trigger: auto-create profile row when user signs up
  CREATE OR REPLACE FUNCTION handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  -- ─── Tables ──────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan text DEFAULT 'trial',
    trial_ends timestamptz,
    timezone text DEFAULT 'Asia/Almaty',
    tg_chat_id bigint,
    created_at timestamptz DEFAULT now()
  );

  -- DENY ALL for anon+authenticated — no RLS policies will be created for this table
  CREATE TABLE IF NOT EXISTS hh_credentials (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    access_token_encrypted text,
    refresh_token_encrypted text,
    expires_at timestamptz,
    hh_user_id text,
    last_refreshed_at timestamptz,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    hh_resume_id text NOT NULL,
    title text,
    status text,
    synced_at timestamptz,
    UNIQUE(user_id, hh_resume_id)
  );

  CREATE TABLE IF NOT EXISTS filters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    resume_id uuid REFERENCES resumes(id) ON DELETE CASCADE,
    text text,
    area int,
    salary_min int,
    experience text,
    schedule text,
    employment text,
    professional_role int[],
    excluded_regex text,
    enabled bool DEFAULT true,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    resume_id uuid REFERENCES resumes(id),
    vacancy_id text NOT NULL,
    employer_id text,
    status text DEFAULT 'queued',
    cover_letter text,
    applied_at timestamptz,
    error text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, vacancy_id)
  );

  CREATE TABLE IF NOT EXISTS apply_counters (
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    date date NOT NULL,
    count int DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE IF NOT EXISTS blacklist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    employer_id text NOT NULL,
    employer_name text,
    reason text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, employer_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    provider_payment_id text UNIQUE NOT NULL,
    amount int,
    provider text DEFAULT 'cloudpayments',
    status text DEFAULT 'pending',
    expires_at timestamptz,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS captcha_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    storage_path text,
    captcha_url text,
    solved bool DEFAULT false,
    created_at timestamptz DEFAULT now(),
    solved_at timestamptz
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    type text,
    payload jsonb,
    read bool DEFAULT false,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS vacancy_cache (
    vacancy_id text PRIMARY KEY,
    payload jsonb,
    fetched_at timestamptz DEFAULT now()
  );

  -- ─── Auth trigger ─────────────────────────────────────────────

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

  -- ─── Row Level Security ───────────────────────────────────────

  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE hh_credentials ENABLE ROW LEVEL SECURITY;
  ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE filters ENABLE ROW LEVEL SECURITY;
  ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE apply_counters ENABLE ROW LEVEL SECURITY;
  ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE captcha_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE vacancy_cache ENABLE ROW LEVEL SECURITY;

  -- profiles: user reads/writes own row
  CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT USING (auth.uid() = id);
  CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (auth.uid() = id);

  -- hh_credentials: NO policies = DENY ALL for anon+authenticated
  -- service_role bypasses RLS entirely (Supabase default)

  -- resumes: user reads own only
  CREATE POLICY "resumes_select_own" ON resumes
    FOR SELECT USING (auth.uid() = user_id);

  -- filters: user reads own only
  CREATE POLICY "filters_select_own" ON filters
    FOR SELECT USING (auth.uid() = user_id);

  -- applications: user reads own only
  CREATE POLICY "applications_select_own" ON applications
    FOR SELECT USING (auth.uid() = user_id);

  -- apply_counters: no policies (service_role only)

  -- blacklist: user reads own only
  CREATE POLICY "blacklist_select_own" ON blacklist
    FOR SELECT USING (auth.uid() = user_id);

  -- payments: no policies (service_role only)

  -- captcha_requests: user reads own only
  CREATE POLICY "captcha_requests_select_own" ON captcha_requests
    FOR SELECT USING (auth.uid() = user_id);

  -- notifications: user reads own only, user can mark as read
  CREATE POLICY "notifications_select_own" ON notifications
    FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "notifications_update_own" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

  -- vacancy_cache: no policies (service_role only)

  -- ─── Realtime ─────────────────────────────────────────────────

  ALTER PUBLICATION supabase_realtime ADD TABLE applications;
  ALTER PUBLICATION supabase_realtime ADD TABLE captcha_requests;
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  ```

- [ ] **Step 3: Commit the file**

  ```bash
  git add infra/supabase/migrations/001_init.sql
  git commit -m "feat: add 001_init.sql migration (tables + RLS + realtime)"
  ```

---

## Task 3: Write `002_indexes.sql`

**Files:**
- Create: `infra/supabase/migrations/002_indexes.sql`

- [ ] **Step 1: Write the indexes file**

  Create `infra/supabase/migrations/002_indexes.sql`:

  ```sql
  -- ============================================================
  -- 002_indexes.sql — performance indexes
  -- Run AFTER 001_init.sql
  -- ============================================================

  CREATE INDEX IF NOT EXISTS idx_applications_user_created
    ON applications(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_applications_user_status
    ON applications(user_id, status);

  CREATE INDEX IF NOT EXISTS idx_apply_counters_user_date
    ON apply_counters(user_id, date);

  CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
    ON notifications(user_id, read, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_blacklist_user_employer
    ON blacklist(user_id, employer_id);

  CREATE INDEX IF NOT EXISTS idx_resumes_user
    ON resumes(user_id);
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add infra/supabase/migrations/002_indexes.sql
  git commit -m "feat: add 002_indexes.sql migration"
  ```

---

## Task 4: Run migrations in Supabase Dashboard (manual)

**Files:** none (external step)

- [ ] **Step 1: Run 001_init.sql**

  Dashboard → SQL Editor → New query → paste full content of `infra/supabase/migrations/001_init.sql` → Run.

  Expected: green "Success. No rows returned." for each statement.

- [ ] **Step 2: Verify tables exist**

  Dashboard → Table Editor. You should see: `profiles`, `hh_credentials`, `resumes`, `filters`, `applications`, `apply_counters`, `blacklist`, `payments`, `captcha_requests`, `notifications`, `vacancy_cache`.

- [ ] **Step 3: Run 002_indexes.sql**

  SQL Editor → New query → paste `infra/supabase/migrations/002_indexes.sql` → Run.

- [ ] **Step 4: Verify RLS is enabled**

  Table Editor → click `hh_credentials` → RLS tab. Should show "RLS enabled" with 0 policies (= DENY ALL).

---

## Task 5: Create Storage bucket (manual)

**Files:** none (external step)

- [ ] **Step 1: Create bucket**

  Dashboard → Storage → New bucket.
  - Name: `captcha-screenshots`
  - Public bucket: **OFF** (private)
  - Click Create.

- [ ] **Step 2: Add Storage RLS policy for authenticated users**

  Dashboard → Storage → `captcha-screenshots` → Policies → New policy → For full customization.

  Policy name: `authenticated read own`
  Allowed operation: SELECT
  Target roles: authenticated
  Policy definition:
  ```sql
  bucket_id = 'captcha-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
  ```

  This lets users download only their own captcha screenshots (stored at `{user_id}/filename.png`).

---

## Task 6: Add Python dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add supabase and cryptography**

  Edit `pyproject.toml`, update `dependencies`:

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
  ]
  ```

- [ ] **Step 2: Install**

  ```bash
  uv sync
  ```

  Expected: uv resolves and installs `supabase` and `cryptography` packages.

- [ ] **Step 3: Commit**

  ```bash
  git add pyproject.toml uv.lock
  git commit -m "feat: add supabase and cryptography dependencies"
  ```

---

## Task 7: Update `.env.example`

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Replace content of `backend/.env.example`**

  ```env
  # Supabase
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_ANON_KEY=eyJ...
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

  # Encryption — generate once:
  # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  FERNET_KEY=your-generated-fernet-key-here

  # hh.ru — local dev only, not used in production
  HH_LOGIN=your_email_or_phone@example.com
  HH_PASSWORD=your_password
  HH_TEST_VACANCY_ID=
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add backend/.env.example
  git commit -m "chore: update .env.example with Supabase and Fernet vars"
  ```

---

## Task 8: Update local `.env` (manual)

**Files:**
- Modify: `backend/.env` (never committed)

- [ ] **Step 1: Generate Fernet key**

  ```bash
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```

  Copy the output — this is your `FERNET_KEY`. Save it somewhere safe (password manager). If lost, all stored hh tokens become unreadable.

- [ ] **Step 2: Update `backend/.env`**

  Add to `backend/.env`:

  ```env
  # Supabase
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_ANON_KEY=eyJ...
  SUPABASE_SERVICE_ROLE_KEY=eyJ...

  # Encryption
  FERNET_KEY=<paste generated key>

  # hh.ru — local dev only
  HH_LOGIN=your_login
  HH_PASSWORD=your_password
  HH_TEST_VACANCY_ID=
  ```

  Replace placeholders with real values from Task 1 Step 3.

- [ ] **Step 3: Verify `.env` is in `.gitignore`**

  ```bash
  git check-ignore -v backend/.env
  ```

  Expected output: `backend/.gitignore:1:*.env  backend/.env` or similar showing it's ignored.
  If not ignored — add `*.env` to `.gitignore` before proceeding.

---

## Task 9: Create Supabase Python client

**Files:**
- Create: `backend/__init__.py`
- Create: `backend/app/__init__.py`
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/supabase.py`

- [ ] **Step 1: Create package markers**

  ```bash
  touch backend/__init__.py backend/app/__init__.py backend/app/db/__init__.py
  ```

- [ ] **Step 2: Write the client module**

  Create `backend/app/db/supabase.py`:

  ```python
  import os
  from supabase import Client, create_client


  def _make_client(key_env: str) -> Client:
      url = os.environ["SUPABASE_URL"]
      key = os.environ[key_env]
      return create_client(url, key)


  # Bypasses RLS — use for all data writes and sensitive reads (hh_credentials)
  service_client: Client = _make_client("SUPABASE_SERVICE_ROLE_KEY")

  # Respects RLS — use for JWT validation only
  anon_client: Client = _make_client("SUPABASE_ANON_KEY")
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add backend/__init__.py backend/app/__init__.py backend/app/db/__init__.py backend/app/db/supabase.py
  git commit -m "feat: add Supabase client module (service + anon)"
  ```

---

## Task 10: Smoke test — verify connection

**Files:**
- Create: `backend/scripts/smoke_test_supabase.py`

- [ ] **Step 1: Create scripts directory and test file**

  ```bash
  mkdir -p backend/scripts
  ```

  Create `backend/scripts/smoke_test_supabase.py`:

  ```python
  """Verify Supabase connection and table setup. Run from repo root."""
  import os
  import sys

  from dotenv import load_dotenv

  load_dotenv("backend/.env")

  # Validate required env vars before importing client
  required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "FERNET_KEY"]
  missing = [k for k in required if not os.environ.get(k)]
  if missing:
      print(f"FAIL: missing env vars: {missing}")
      sys.exit(1)

  from backend.app.db.supabase import service_client  # noqa: E402

  EXPECTED_TABLES = [
      "profiles", "hh_credentials", "resumes", "filters",
      "applications", "apply_counters", "blacklist", "payments",
      "captcha_requests", "notifications", "vacancy_cache",
  ]

  print("Testing Supabase connection...")

  errors = []
  for table in EXPECTED_TABLES:
      try:
          result = service_client.table(table).select("*", count="exact").limit(0).execute()
          print(f"  OK: {table} (count={result.count})")
      except Exception as e:
          errors.append(f"  FAIL: {table} — {e}")
          print(errors[-1])

  # Verify Fernet key works
  from cryptography.fernet import Fernet, InvalidToken
  try:
      f = Fernet(os.environ["FERNET_KEY"].encode())
      token = f.encrypt(b"test")
      assert f.decrypt(token) == b"test"
      print("  OK: Fernet key valid")
  except Exception as e:
      errors.append(f"  FAIL: Fernet — {e}")
      print(errors[-1])

  if errors:
      print(f"\nFAIL: {len(errors)} error(s)")
      sys.exit(1)
  else:
      print(f"\nOK: all {len(EXPECTED_TABLES)} tables reachable, Fernet valid")
  ```

- [ ] **Step 2: Run the smoke test**

  ```bash
  python -m backend.scripts.smoke_test_supabase
  ```

  Expected output:
  ```
  Testing Supabase connection...
    OK: profiles (count=0)
    OK: hh_credentials (count=0)
    OK: resumes (count=0)
    OK: filters (count=0)
    OK: applications (count=0)
    OK: apply_counters (count=0)
    OK: blacklist (count=0)
    OK: payments (count=0)
    OK: captcha_requests (count=0)
    OK: notifications (count=0)
    OK: vacancy_cache (count=0)
    OK: Fernet key valid

  OK: all 11 tables reachable, Fernet valid
  ```

  If any table shows FAIL: check that `001_init.sql` ran successfully in Dashboard.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/scripts/smoke_test_supabase.py
  git commit -m "chore: add Supabase connection smoke test"
  ```

---

## Done

Day 3 complete when:
- `001_init.sql` and `002_indexes.sql` ran successfully in Supabase Dashboard
- `captcha-screenshots` Storage bucket exists (private)
- `backend/app/db/supabase.py` has `service_client` and `anon_client`
- Smoke test passes for all 11 tables
- `.env` has all 4 required vars, is git-ignored
