import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

RESUME = {"id": "r1", "title": "Python dev"}
VACANCY = {"id": "v1", "name": "Backend", "employer": {"name": "Acme"}}


@pytest.mark.asyncio
async def test_cache_hit_returns_without_consuming():
    from app.services import manual_cover_letter as svc

    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=False)), \
         patch.object(svc, "_cache_get", return_value="cached letter"), \
         patch.object(svc.gen_limiter, "remaining", new=AsyncMock(return_value=4)), \
         patch.object(svc.gen_limiter, "consume", new=AsyncMock()) as consume:
        out = await svc.generate_for_vacancy("u1", "v1", "r1")
    assert out == {"text": "cached letter", "cached": True, "remaining": 4}
    consume.assert_not_called()


@pytest.mark.asyncio
async def test_free_over_limit_raises_402():
    from app.services import manual_cover_letter as svc

    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=False)), \
         patch.object(svc, "_cache_get", return_value=None), \
         patch.object(svc.gen_limiter, "remaining", new=AsyncMock(return_value=0)):
        with pytest.raises(HTTPException) as ei:
            await svc.generate_for_vacancy("u1", "v1", "r1")
    assert ei.value.status_code == 402


@pytest.mark.asyncio
async def test_free_under_limit_generates_and_consumes():
    from app.services import manual_cover_letter as svc

    agent = MagicMock()
    agent.write_cover_letter = AsyncMock(return_value="fresh letter")
    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=False)), \
         patch.object(svc, "_cache_get", return_value=None), \
         patch.object(svc.gen_limiter, "remaining", new=AsyncMock(side_effect=[3, 2])), \
         patch.object(svc.gen_limiter, "consume", new=AsyncMock()) as consume, \
         patch.object(svc, "_fetch_vacancy", new=AsyncMock(return_value=VACANCY)), \
         patch.object(svc, "HHAgent", return_value=agent):
        out = await svc.generate_for_vacancy("u1", "v1", "r1")
    assert out == {"text": "fresh letter", "cached": False, "remaining": 2}
    consume.assert_awaited_once_with("u1")


@pytest.mark.asyncio
async def test_pro_unlimited_no_consume():
    from app.services import manual_cover_letter as svc

    agent = MagicMock()
    agent.write_cover_letter = AsyncMock(return_value="pro letter")
    with patch.object(svc, "_resume_row", return_value=RESUME), \
         patch.object(svc.plan, "check_access", new=AsyncMock(return_value=True)), \
         patch.object(svc, "_cache_get", return_value=None), \
         patch.object(svc.gen_limiter, "consume", new=AsyncMock()) as consume, \
         patch.object(svc, "_fetch_vacancy", new=AsyncMock(return_value=VACANCY)), \
         patch.object(svc, "HHAgent", return_value=agent):
        out = await svc.generate_for_vacancy("u1", "v1", "r1")
    assert out == {"text": "pro letter", "cached": False, "remaining": None}
    consume.assert_not_called()


@pytest.mark.asyncio
async def test_unknown_resume_raises_400():
    from app.services import manual_cover_letter as svc

    with patch.object(svc, "_resume_row", return_value=None):
        with pytest.raises(HTTPException) as ei:
            await svc.generate_for_vacancy("u1", "v1", "rX")
    assert ei.value.status_code == 400
