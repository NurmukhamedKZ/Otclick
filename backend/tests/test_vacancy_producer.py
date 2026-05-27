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
    for m in ("select", "eq", "in_", "is_"):
        getattr(c, m).return_value = c
    c.execute.return_value = SimpleNamespace(data=final_data)
    return c


@pytest.mark.asyncio
async def test_has_test_vacancy_is_queued_not_skipped():
    """Regression: has_test vacancies must reach the queue so apply_one fills
    the test (form_filler). Previously they were skipped → never filled."""
    from app.services import vacancy_producer as vp
    from app.worker.queue import drop_user_queue, get_user_queue

    drop_user_queue("u1")

    a_filter = {
        "id": "f1", "resume_id": "r1", "text": "AI engineer", "area": None,
        "salary_min": None, "experience": None, "schedule": None,
        "employment": None, "professional_role": None, "excluded_regex": None,
    }
    filters_chain = _chain([a_filter])
    apps_chain = _chain([])       # nothing applied yet
    blacklist_chain = _chain([])  # nothing blacklisted

    def _table(name):
        return {
            "filters": filters_chain,
            "applications": apps_chain,
            "blacklist": blacklist_chain,
        }[name]

    client = MagicMock()
    client.access_token = "tok"
    client.get.return_value = {
        "items": [{"id": "v1", "has_test": True, "employer": {"id": "e1"}}],
        "found": 1,
    }

    with patch.object(vp.service_client, "table", side_effect=_table), \
         patch.object(vp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(vp, "persist_if_refreshed", new=AsyncMock()):
        pushed, skipped_has_test = await vp.produce_jobs("u1")

    assert pushed == 1
    assert skipped_has_test == 0
    queue = get_user_queue("u1")
    assert queue.qsize() == 1
    job = queue.get_nowait()
    assert job.vacancy_id == "v1"
