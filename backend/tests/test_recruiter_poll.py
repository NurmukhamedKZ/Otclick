import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _client_with(negotiations, messages):
    client = MagicMock()
    client.access_token = "tok"
    def _get(endpoint, **kw):
        if endpoint == "negotiations":
            return {"items": negotiations}
        if endpoint.endswith("/messages"):
            return {"items": messages}
        return {}
    client.get.side_effect = _get
    return client


@pytest.mark.asyncio
async def test_poll_invokes_agent_and_advances_cursor():
    from app.worker import recruiter_poll as rp
    negotiations = [{"id": "n9", "has_updates": True,
                     "vacancy": {"id": "v1", "employer": {"name": "Acme"}}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"}, "text": "Какая зарплата?"}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock()

    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.chatik, "bot_buttons", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()) as upsert, \
         patch.object(rp.asyncio, "sleep", new=AsyncMock()):
        await rp.poll_recruiter_chats("u1", agent)

    agent.answer_recruiter.assert_awaited_once()
    args = agent.answer_recruiter.await_args
    assert args.args[0] == "n9" and args.args[1] == "m5"
    upsert.assert_awaited_once()
    assert upsert.await_args.args[2] == "m5"  # cursor = handled message id


@pytest.mark.asyncio
async def test_poll_skips_chat_without_has_updates():
    from app.worker import recruiter_poll as rp
    # hh `counters.unread_messages` lies — only `has_updates` should gate work.
    negotiations = [{"id": "n9", "counters": {"unread_messages": 5}, "vacancy": {}}]
    client = _client_with(negotiations, [])
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock()
    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()), \
         patch.object(rp.asyncio, "sleep", new=AsyncMock()):
        await rp.poll_recruiter_chats("u1", agent)
    agent.answer_recruiter.assert_not_awaited()
    # also: messages endpoint must not be hit for non-updated chats
    msg_calls = [c for c in client.get.call_args_list if "/messages" in c.args[0]]
    assert msg_calls == []


@pytest.mark.asyncio
async def test_poll_skips_already_handled():
    from app.worker import recruiter_poll as rp
    negotiations = [{"id": "n9", "has_updates": True, "vacancy": {}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"}, "text": "hi"}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock()
    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value="m5")), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()), \
         patch.object(rp.asyncio, "sleep", new=AsyncMock()):
        await rp.poll_recruiter_chats("u1", agent)
    agent.answer_recruiter.assert_not_awaited()


@pytest.mark.asyncio
async def test_poll_skips_ai_on_rejection_but_advances_cursor():
    from app.worker import recruiter_poll as rp
    # Employer rejected (state.id == "discard") — never feed the rejection to the AI,
    # but advance the cursor so it is not re-evaluated next poll.
    negotiations = [{"id": "n9", "has_updates": True, "state": {"id": "discard"},
                     "vacancy": {"id": "v1", "employer": {"name": "Acme"}}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"},
                 "text": "К сожалению, мы вынуждены вам отказать."}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock()
    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()) as upsert, \
         patch.object(rp.asyncio, "sleep", new=AsyncMock()):
        await rp.poll_recruiter_chats("u1", agent)
    agent.answer_recruiter.assert_not_awaited()
    upsert.assert_awaited_once()
    assert upsert.await_args.args[2] == "m5"


@pytest.mark.asyncio
async def test_poll_swallows_send_error_keeps_cursor():
    from app.worker import recruiter_poll as rp
    negotiations = [{"id": "n9", "has_updates": True, "vacancy": {}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"}, "text": "hi"}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock(side_effect=RuntimeError("boom"))
    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.chatik, "bot_buttons", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()) as upsert, \
         patch.object(rp.asyncio, "sleep", new=AsyncMock()):
        await rp.poll_recruiter_chats("u1", agent)  # must not raise
    upsert.assert_not_awaited()  # error → cursor NOT advanced (retry next poll)


@pytest.mark.asyncio
async def test_poll_bot_buttons_routes_to_choice_agent():
    from app.worker import recruiter_poll as rp
    negotiations = [{"id": "n9", "has_updates": True,
                     "vacancy": {"id": "v1", "employer": {"name": "Acme"}}}]
    messages = [{"id": "m5", "author": {"participant_type": "employer"},
                 "text": "Подходит ли вам 100 тыс?"}]
    client = _client_with(negotiations, messages)
    agent = MagicMock()
    agent.answer_recruiter = AsyncMock()
    agent.answer_recruiter_choice = AsyncMock()
    buttons = ("Подходит ли вам 100 тыс?", ["Да", "Рассматриваю зарплату выше"])
    with patch.object(rp, "load_api_client", new=AsyncMock(return_value=client)), \
         patch.object(rp, "persist_if_refreshed", new=AsyncMock()), \
         patch.object(rp.chatik, "bot_buttons", new=AsyncMock(return_value=buttons)), \
         patch.object(rp.recruiter, "get_cursor", new=AsyncMock(return_value=None)), \
         patch.object(rp.recruiter, "upsert_cursor", new=AsyncMock()) as upsert, \
         patch.object(rp.asyncio, "sleep", new=AsyncMock()):
        await rp.poll_recruiter_chats("u1", agent)
    # button path: choice agent used (with nid, message_id, question, labels),
    # free-text agent NOT used; cursor advanced.
    agent.answer_recruiter_choice.assert_awaited_once()
    ca = agent.answer_recruiter_choice.await_args
    assert ca.args[0] == "n9" and ca.args[1] == "m5"
    assert ca.args[4] == buttons[0] and ca.args[5] == buttons[1]
    agent.answer_recruiter.assert_not_awaited()
    upsert.assert_awaited_once()
    assert upsert.await_args.args[2] == "m5"
