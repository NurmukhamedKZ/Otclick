# Day 3: Supabase Setup Design

**Date:** 2026-05-22
**Scope:** Supabase project init, all tables, RLS policies, Storage bucket, env integration

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Migration management | SQL files in git | Simple, reproducible, no extra tooling |
| Migration execution | Supabase Dashboard SQL Editor | Direct, no CLI/Docker needed for MVP |
| Fernet key storage | `.env` on VPS | Simpler than Vault, safe if .gitignore correct |
| Local dev DB | Production Supabase | Single instance for MVP, no local Docker |

## File Structure

```
infra/
└── supabase/
    └── migrations/
        ├── 001_init.sql      # tables + RLS policies + Realtime
        └── 002_indexes.sql   # indexes

backend/
└── app/
    └── db/
        └── supabase.py       # anon_client + service_client

backend/.env.example          # updated with all required vars
```

## Migration 001_init.sql

Creates all tables in order (respecting FK dependencies):

1. `profiles` — references `auth.users`
2. `hh_credentials` — references `profiles`
3. `resumes` — references `profiles`
4. `filters` — references `profiles` + `resumes`
5. `applications` — references `profiles` + `resumes`
6. `apply_counters` — references `profiles`
7. `blacklist` — references `profiles`
8. `payments` — references `profiles`
9. `captcha_requests` — references `profiles`
10. `notifications` — references `profiles`
11. `vacancy_cache` — no FK

Enables Realtime on: `applications`, `captcha_requests`, `notifications`.

## RLS Policies

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `profiles` | DENY | read/write own row (`auth.uid() = id`) | ALL |
| `hh_credentials` | DENY | DENY | ALL |
| `resumes` | DENY | SELECT own (`auth.uid() = user_id`) | ALL |
| `filters` | DENY | SELECT own | ALL |
| `applications` | DENY | SELECT own | ALL |
| `apply_counters` | DENY | DENY | ALL |
| `blacklist` | DENY | SELECT own | ALL |
| `payments` | DENY | DENY | ALL |
| `captcha_requests` | DENY | SELECT own | ALL |
| `notifications` | DENY | SELECT own | ALL |
| `vacancy_cache` | DENY | DENY | ALL |

All writes go through FastAPI (service_role). Frontend reads via Supabase client (authenticated) for tables with SELECT own policy.

## Storage Bucket

- Name: `captcha-screenshots`
- Type: Private (not public)
- RLS: `service_role` → INSERT/SELECT/DELETE all; authenticated → SELECT own files at `{user_id}/*`
- Created manually via Supabase Dashboard (Storage → New bucket)

## Migration 002_indexes.sql

```sql
CREATE INDEX ON applications(user_id, created_at DESC);
CREATE INDEX ON applications(user_id, status);
CREATE INDEX ON apply_counters(user_id, date);
CREATE INDEX ON notifications(user_id, read, created_at DESC);
CREATE INDEX ON blacklist(user_id, employer_id);
CREATE INDEX ON resumes(user_id);
```

## Environment Variables

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Encryption (generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
FERNET_KEY=your-generated-fernet-key

# hh.ru — local dev only, not used in production
HH_LOGIN=your_email_or_phone@example.com
HH_PASSWORD=your_password
HH_TEST_VACANCY_ID=
```

## Supabase Client (backend/app/db/supabase.py)

Two clients:
- `anon_client` — uses `SUPABASE_ANON_KEY`, for validating user JWTs
- `service_client` — uses `SUPABASE_SERVICE_ROLE_KEY`, for all data operations (bypasses RLS)

## Setup Steps (Day 3 execution order)

1. Create Supabase project at supabase.com → get URL + keys
2. Run `001_init.sql` in Dashboard SQL Editor
3. Run `002_indexes.sql` in Dashboard SQL Editor
4. Create `captcha-screenshots` Storage bucket in Dashboard
5. Generate Fernet key, add to `.env`
6. Update `.env.example` with all vars
7. Create `backend/app/db/supabase.py` with both clients
