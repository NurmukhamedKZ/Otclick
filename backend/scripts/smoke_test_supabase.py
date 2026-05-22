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

from cryptography.fernet import Fernet  # noqa: E402
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
