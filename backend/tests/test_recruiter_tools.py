import os
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

from unittest.mock import MagicMock, patch

import pytest


class _Spy:
    def __init__(self):
        self.calls = []
    async def __call__(self, *args, **kwargs):
        self.calls.append(args)
        return None


def _ctx(client=None, labels=None):
    from app.ai.recruiter_tools import RecruiterContext
    return RecruiterContext(user_id="u1", negotiation_id="n9", message_id="m5",
                            client=client or MagicMock(access_token="tok"),
                            quick_reply_labels=labels)


@pytest.mark.asyncio
async def test_do_send_posts_to_hh():
    from app.ai import recruiter_tools as rt
    ctx = _ctx()
    out = await rt.do_send(ctx, "Зарплата от 300к")
    ctx.client.post.assert_called_once_with("negotiations/n9/messages", {"message": "Зарплата от 300к"})
    assert out == "sent"


@pytest.mark.asyncio
async def test_do_escalate_inserts_draft_and_notifies():
    from app.ai import recruiter_tools as rt
    ins, notif = _Spy(), _Spy()
    with patch.object(rt.recruiter, "insert_draft", new=ins), patch.object(rt, "notify", new=notif):
        out = await rt.do_escalate(_ctx(), "Давайте во вторник", "scheduling")
    assert ins.calls[0] == ("u1", "n9", "m5", "Давайте во вторник", "scheduling")
    assert notif.calls[0][1] == "recruiter_draft"
    assert out == "escalated"


@pytest.mark.asyncio
async def test_do_todo_inserts_and_notifies():
    from app.ai import recruiter_tools as rt
    ins, notif = _Spy(), _Spy()
    with patch.object(rt.recruiter, "insert_todo", new=ins), patch.object(rt, "notify", new=notif):
        out = await rt.do_todo(_ctx(), "Заполнить форму", "до пятницы", "https://forms.gle/x")
    assert ins.calls[0] == ("u1", "n9", "m5", "Заполнить форму", "до пятницы", "https://forms.gle/x")
    assert notif.calls[0][1] == "recruiter_todo"
    assert out == "todo_created"


@pytest.mark.asyncio
async def test_do_answer_button_sends_exact_label():
    from app.ai import recruiter_tools as rt
    # model echoed the label inside a sentence — must resolve to the verbatim
    # label string (here 'Нет ' with its trailing space) and post it as-is.
    ctx = _ctx(labels=["Да, есть", "Нет "])
    out = await rt.do_answer_button(ctx, "Думаю, Нет")
    ctx.client.post.assert_called_once_with("negotiations/n9/messages", {"message": "Нет "})
    assert out == "sent"


@pytest.mark.asyncio
async def test_do_answer_button_rejects_unmatched_label():
    from app.ai import recruiter_tools as rt
    ctx = _ctx(labels=["Да", "Нет"])
    out = await rt.do_answer_button(ctx, "Перезвоните завтра")
    ctx.client.post.assert_not_called()  # never send free text disguised as a label
    assert out.startswith("error:")


def test_match_label_prefers_exact_over_substring():
    from app.ai.recruiter_tools import match_label
    assert match_label(["Да", "Да, есть"], "Да") == "Да"
    assert match_label(["Yes", "No"], "yes") == "Yes"
    assert match_label(["Да", "Нет"], "ничего") is None


def test_recruiter_tools_list_has_all_tools():
    from app.ai.recruiter_tools import RECRUITER_TOOLS
    names = {t.name for t in RECRUITER_TOOLS}
    assert names == {
        "send_message_recruiter", "escalate_to_human", "make_todo", "answer_with_button",
    }
