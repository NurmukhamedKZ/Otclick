import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def _fluent(final_data):
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.upsert.return_value = chain
    chain.execute.return_value = SimpleNamespace(data=final_data, count=None)
    return chain


@pytest.mark.asyncio
async def test_remaining_full_when_no_rows():
    from app.services import gen_limiter

    sb = MagicMock()
    # Sequence: tz lookup (limiter._tz_for_user) → count read.
    sb.table.side_effect = [
        _fluent({"timezone": "Asia/Almaty"}),
        _fluent(None),
    ]
    with patch.object(gen_limiter, "service_client", sb), \
         patch("app.worker.limiter.service_client", sb):
        rem = await gen_limiter.remaining("u1")
    assert rem == gen_limiter.FREE_DAILY_GEN_LIMIT


@pytest.mark.asyncio
async def test_remaining_zero_at_cap():
    from app.services import gen_limiter

    sb = MagicMock()
    sb.table.side_effect = [
        _fluent({"timezone": "Asia/Almaty"}),
        _fluent({"count": gen_limiter.FREE_DAILY_GEN_LIMIT}),
    ]
    with patch.object(gen_limiter, "service_client", sb), \
         patch("app.worker.limiter.service_client", sb):
        rem = await gen_limiter.remaining("u1")
    assert rem == 0


@pytest.mark.asyncio
async def test_consume_bumps_count():
    from app.services import gen_limiter

    sb = MagicMock()
    sb.table.side_effect = [
        _fluent({"timezone": "Asia/Almaty"}),  # tz lookup
        _fluent({"count": 2}),                  # current count read
        _fluent(None),                          # upsert
    ]
    with patch.object(gen_limiter, "service_client", sb), \
         patch("app.worker.limiter.service_client", sb):
        new = await gen_limiter.consume("u1")
    assert new == 3
