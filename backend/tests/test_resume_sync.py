import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def test_extract_status_dict():
    from app.services.resume_sync import _extract_status
    assert _extract_status({"status": {"id": "published", "name": "Опубликовано"}}) == "published"


def test_extract_status_string():
    from app.services.resume_sync import _extract_status
    assert _extract_status({"status": "published"}) == "published"


def test_extract_status_missing():
    from app.services.resume_sync import _extract_status
    assert _extract_status({}) is None


def test_extract_roles_dicts():
    from app.services.resume_sync import _extract_roles
    item = {"professional_roles": [{"id": "96", "name": "Программист"}, {"id": 124}]}
    assert _extract_roles(item) == [96, 124]


def test_extract_roles_empty_returns_none():
    from app.services.resume_sync import _extract_roles
    assert _extract_roles({}) is None
    assert _extract_roles({"professional_roles": [{"name": "no id"}]}) is None


async def test_sync_resumes_upserts_items():
    from app.services import resume_sync

    fake_client = MagicMock()
    fake_client.access_token = "USER_tok_v1"
    fake_client.get.return_value = {
        "items": [
            {"id": "r1", "title": "Backend dev", "status": {"id": "published"}},
            {"id": "r2", "title": "DevOps", "status": "not_published"},
        ]
    }

    async def fake_load(user_id):
        return fake_client

    async def fake_persist(*a, **kw):
        return None

    with patch.object(resume_sync, "load_api_client", side_effect=fake_load), \
         patch.object(resume_sync, "persist_if_refreshed", side_effect=fake_persist), \
         patch.object(resume_sync, "_upsert_resumes", return_value=[
             {"id": "uuid1", "hh_resume_id": "r1", "title": "Backend dev", "status": "published", "synced_at": None},
             {"id": "uuid2", "hh_resume_id": "r2", "title": "DevOps", "status": "not_published", "synced_at": None},
         ]) as upsert_mock:
        result = await resume_sync.sync_resumes("user-1")

    assert len(result) == 2
    upsert_mock.assert_called_once()
    args = upsert_mock.call_args[0]
    assert args[0] == "user-1"
    assert [i["id"] for i in args[1]] == ["r1", "r2"]
