import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def _chain(final_data):
    c = MagicMock()
    for m in ("select", "update", "eq", "in_", "is_", "maybe_single"):
        getattr(c, m).return_value = c
    c.execute.return_value = SimpleNamespace(data=final_data)
    return c


@pytest.mark.asyncio
async def test_set_enabled_updates_flag():
    from app.services import worker_control

    chain = _chain(None)
    with patch.object(worker_control.service_client, "table", return_value=chain):
        await worker_control.set_enabled("u1", True)
    chain.update.assert_called_once_with({"worker_enabled": True})
    chain.eq.assert_called_once_with("id", "u1")


@pytest.mark.asyncio
async def test_is_enabled_reads_flag():
    from app.services import worker_control

    chain = _chain({"worker_enabled": True})
    with patch.object(worker_control.service_client, "table", return_value=chain):
        assert await worker_control.is_enabled("u1") is True

    chain = _chain(None)
    with patch.object(worker_control.service_client, "table", return_value=chain):
        assert await worker_control.is_enabled("u1") is False


def test_enabled_active_user_ids_intersects_creds_and_flag():
    from app.services import worker_control

    creds = _chain([{"user_id": "a"}, {"user_id": "b"}, {"user_id": "c"}])
    # Only a and b have worker_enabled=true (the .eq filter is applied server-side).
    profiles = _chain([{"id": "a"}, {"id": "b"}])

    def _table(name):
        return creds if name == "hh_credentials" else profiles

    with patch.object(worker_control.service_client, "table", side_effect=_table):
        out = worker_control.enabled_active_user_ids()
    assert sorted(out) == ["a", "b"]


def test_enabled_active_user_ids_empty_when_no_active_creds():
    from app.services import worker_control

    creds = _chain([])
    with patch.object(worker_control.service_client, "table", return_value=creds):
        assert worker_control.enabled_active_user_ids() == []


@pytest.mark.asyncio
async def test_reconcile_starts_and_stops_diff():
    import worker_main

    registry = MagicMock()
    registry.running_user_ids.return_value = ["b", "c"]  # c should be stopped
    registry.start = AsyncMock()
    registry.stop = AsyncMock()

    with patch.object(worker_main, "enabled_active_user_ids", return_value=["a", "b"]), \
         patch.object(worker_main, "filter_accessible", side_effect=lambda u: u):
        await worker_main._reconcile(registry)

    registry.start.assert_awaited_once_with("a")   # newly enabled
    registry.stop.assert_awaited_once_with("c")    # no longer desired
