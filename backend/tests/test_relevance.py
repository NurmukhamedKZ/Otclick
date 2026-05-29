import os
from unittest.mock import MagicMock

import pytest

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
