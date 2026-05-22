from supabase import Client, create_client

from app.config import settings


def _make_client(key: str) -> Client:
    return create_client(settings.SUPABASE_URL, key)


# Bypasses RLS — use for all data writes and sensitive reads (hh_credentials)
service_client: Client = _make_client(settings.SUPABASE_SERVICE_ROLE_KEY)

# Respects RLS — use for JWT validation only
anon_client: Client = _make_client(settings.SUPABASE_ANON_KEY)
