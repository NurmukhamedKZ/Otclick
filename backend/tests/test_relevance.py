import os
from unittest.mock import MagicMock

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

ITEMS = [
    {"id": "v1", "name": "AI Engineer", "snippet_requirement": "LLM, Python",
     "snippet_responsibility": "build models"},
    {"id": "v2", "name": "Sales Manager", "snippet_requirement": "продажи",
     "snippet_responsibility": "звонки клиентам"},
]


def _llm(content: str):
    chat = MagicMock()
    chat.invoke.return_value = MagicMock(content=content)
    return chat


def test_marks_listed_irrelevant_rest_relevant():
    from app.services.relevance import filter_relevant
    llm = _llm('{"irrelevant": [{"id": "v2", "reason": "sales, not AI"}]}')
    verdicts = filter_relevant(llm, "AI engineer resume", ITEMS)
    assert verdicts["v1"][0] is True
    assert verdicts["v2"][0] is False
    assert verdicts["v2"][1] == "sales, not AI"


def test_empty_response_keeps_all():
    from app.services.relevance import filter_relevant
    llm = _llm('{"irrelevant": []}')
    verdicts = filter_relevant(llm, "resume", ITEMS)
    assert all(v[0] for v in verdicts.values())


def test_malformed_json_fails_open():
    from app.services.relevance import filter_relevant
    llm = _llm("not json at all")
    verdicts = filter_relevant(llm, "resume", ITEMS)
    assert all(v[0] for v in verdicts.values())
    assert verdicts["v1"][1] == "fail_open"


def test_no_llm_fails_open():
    from app.services.relevance import filter_relevant
    verdicts = filter_relevant(None, "resume", ITEMS)
    assert all(v[0] for v in verdicts.values())


def test_empty_items_returns_empty():
    from app.services.relevance import filter_relevant
    assert filter_relevant(_llm("{}"), "resume", []) == {}


from types import SimpleNamespace
from unittest.mock import patch


def _cache_chain(final_data):
    c = MagicMock()
    for m in ("select", "eq", "in_", "upsert"):
        getattr(c, m).return_value = c
    c.execute.return_value = SimpleNamespace(data=final_data)
    return c


def test_get_cached_verdicts_maps_rows():
    from app.services import relevance
    rows = [
        {"vacancy_id": "v1", "relevant": True, "reason": ""},
        {"vacancy_id": "v2", "relevant": False, "reason": "sales"},
    ]
    chain = _cache_chain(rows)
    with patch.object(relevance.service_client, "table", return_value=chain):
        out = relevance.get_cached_verdicts("r1", ["v1", "v2"])
    assert out["v1"] == (True, "")
    assert out["v2"] == (False, "sales")


def test_get_cached_verdicts_empty_ids():
    from app.services import relevance
    assert relevance.get_cached_verdicts("r1", []) == {}


def test_store_verdicts_upserts_rows():
    from app.services import relevance
    chain = _cache_chain([])
    with patch.object(relevance.service_client, "table", return_value=chain):
        relevance.store_verdicts("u1", "r1", {"v2": (False, "sales")})
    chain.upsert.assert_called_once()
    rows = chain.upsert.call_args[0][0]
    assert rows[0]["vacancy_id"] == "v2"
    assert rows[0]["relevant"] is False
    assert rows[0]["resume_id"] == "r1"
    assert rows[0]["user_id"] == "u1"
