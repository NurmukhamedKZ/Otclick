import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_build_recruiter_prompt_embeds_resume_and_rules():
    from backend.app.ai.prompts import build_recruiter_prompt
    p = build_recruiter_prompt("Python dev, 3 года опыта")
    assert "Python dev, 3 года опыта" in p
    assert "send_message_recruiter" in p
    assert "escalate_to_human" in p
    assert "make_todo" in p
    assert "Отказ" in p or "отказ" in p


@pytest.mark.asyncio
async def test_answer_recruiter_skips_when_no_api_key():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    with patch("app.ai.agent.settings") as s:
        s.OPENAI_API_KEY = ""
        agent._build_recruiter_agent = MagicMock(side_effect=AssertionError("must not build"))
        await agent.answer_recruiter("n1", "m1", [("user", "hi")], client=MagicMock())


@pytest.mark.asyncio
async def test_answer_recruiter_invokes_agent_with_context():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    fake_agent = MagicMock()
    fake_agent.ainvoke = AsyncMock(return_value={"messages": []})
    agent._recruiter_agent = fake_agent
    agent._resume_summary = "ready"  # skip resume load
    with patch("app.ai.agent.settings") as s:
        s.OPENAI_API_KEY = "sk-test"
        await agent.answer_recruiter("n9", "m5", [("user", "Какая зарплата?")], client=MagicMock(access_token="t"))
    _, kwargs = fake_agent.ainvoke.call_args
    assert kwargs["config"]["configurable"]["thread_id"] == "n9"
    ctx = kwargs["context"]
    assert ctx.negotiation_id == "n9" and ctx.message_id == "m5" and ctx.user_id == "u1"


@pytest.mark.asyncio
async def test_answer_recruiter_choice_sends_exact_label():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    agent._resume_summary = "Зарплата: 90 тыс"
    agent.llm = MagicMock()
    # LLM echoes the label inside a sentence — must still resolve to the verbatim label.
    agent.llm.ainvoke = AsyncMock(return_value=MagicMock(content="Думаю, подходит: Да"))
    client = MagicMock()
    sent = await agent.answer_recruiter_choice(
        "n9", client, "Подходит 100 тыс?", ["Да", "Рассматриваю зарплату выше"]
    )
    assert sent is True
    endpoint, body = client.post.call_args.args
    assert endpoint == "negotiations/n9/messages"
    assert body == {"message": "Да"}  # exact button label, sent verbatim


@pytest.mark.asyncio
async def test_answer_recruiter_choice_returns_false_when_unmatched():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    agent._resume_summary = "x"
    agent.llm = MagicMock()
    agent.llm.ainvoke = AsyncMock(return_value=MagicMock(content="Перезвоните мне завтра"))
    client = MagicMock()
    sent = await agent.answer_recruiter_choice("n9", client, "Готовы?", ["Да", "Нет"])
    assert sent is False
    client.post.assert_not_called()  # never guess a label / never send free text


@pytest.mark.asyncio
async def test_answer_recruiter_choice_no_llm_returns_false():
    from app.ai.agent import HHAgent
    agent = HHAgent("u1")
    agent.llm = None
    client = MagicMock()
    sent = await agent.answer_recruiter_choice("n9", client, "Готовы?", ["Да", "Нет"])
    assert sent is False
    client.post.assert_not_called()
