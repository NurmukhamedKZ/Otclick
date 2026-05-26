import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from app.services import plan as plan_service


def _iso(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


# ─── has_access ──────────────────────────────────────────────

def test_trial_active():
    assert plan_service.has_access({"plan": "trial", "trial_ends": _iso(3)}) is True


def test_trial_expired():
    assert plan_service.has_access({"plan": "trial", "trial_ends": _iso(-1)}) is False


def test_trial_no_end_date():
    # trial_ends never set = no window = no access
    assert plan_service.has_access({"plan": "trial", "trial_ends": None}) is False


def test_active_within_period():
    assert plan_service.has_access({"plan": "active", "plan_expires_at": _iso(10)}) is True


def test_active_expired():
    assert plan_service.has_access({"plan": "active", "plan_expires_at": _iso(-1)}) is False


def test_cancelled_keeps_access_until_period_end():
    assert plan_service.has_access({"plan": "cancelled", "plan_expires_at": _iso(5)}) is True


def test_cancelled_after_period_end():
    assert plan_service.has_access({"plan": "cancelled", "plan_expires_at": _iso(-1)}) is False


def test_unknown_plan_denied():
    assert plan_service.has_access({"plan": "weird", "trial_ends": _iso(5)}) is False


def test_empty_profile_denied():
    assert plan_service.has_access({}) is False


def test_parse_ts_handles_zulu_and_datetime():
    now = datetime.now(timezone.utc)
    assert plan_service._parse_ts(now.isoformat().replace("+00:00", "Z")) is not None
    assert plan_service._parse_ts(now) == now
    assert plan_service._parse_ts("garbage") is None


# ─── check_access (async) ────────────────────────────────────

@pytest.mark.asyncio
async def test_check_access_reads_profile():
    chain = MagicMock()
    for m in ("select", "eq", "single"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = SimpleNamespace(data={"plan": "trial", "trial_ends": _iso(2)})
    client = MagicMock()
    client.table.return_value = chain
    with patch.object(plan_service, "service_client", client):
        assert await plan_service.check_access("u1") is True


# ─── filter_accessible (sync, worker_main) ───────────────────

def test_filter_accessible_keeps_only_active():
    rows = [
        {"id": "u1", "plan": "trial", "trial_ends": _iso(2)},       # ok
        {"id": "u2", "plan": "trial", "trial_ends": _iso(-2)},      # expired
        {"id": "u3", "plan": "active", "plan_expires_at": _iso(9)}, # ok
    ]
    chain = MagicMock()
    for m in ("select", "in_"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = SimpleNamespace(data=rows)
    client = MagicMock()
    client.table.return_value = chain
    with patch.object(plan_service, "service_client", client):
        # u4 has no profile row → denied
        assert plan_service.filter_accessible(["u1", "u2", "u3", "u4"]) == ["u1", "u3"]


def test_filter_accessible_empty():
    assert plan_service.filter_accessible([]) == []
