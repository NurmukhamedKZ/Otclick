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
