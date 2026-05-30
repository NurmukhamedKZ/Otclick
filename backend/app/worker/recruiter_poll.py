"""Poll recruiter chats and run the AI agent. Called once per runner loop iter.

Reads chats from chatik (the legacy negotiations API is frozen and misses new
messages — bot questions, our replies, and a real recruiter writing after the
robot leaves). Replies are still POSTed via the legacy messages API by the
agent tools — those land in the chatik chat.
"""

from __future__ import annotations

import asyncio
import logging
import random

from app.services import chatik, recruiter
from app.services.hh_credentials import load_api_client, persist_if_refreshed
from app.worker import throttle

logger = logging.getLogger(__name__)
_rng = random.Random()


async def poll_recruiter_chats(user_id: str, agent) -> None:
    """For each recent chat whose newest message is an unhandled employer/bot
    message, invoke the agent. Errors are logged and never crash the loop."""
    chats = await chatik.recent_chats(user_id)
    if chats is None:
        logger.warning("recruiter poll: no web session for %s — skipping", user_id)
        return
    try:
        client = await load_api_client(user_id)
    except Exception:
        logger.warning("recruiter poll: cannot load creds for %s", user_id, exc_info=True)
        return
    original = client.access_token
    try:
        for ref in chats:
            try:
                handled = await _process_chat(user_id, agent, client, ref)
            except Exception:
                # Do NOT advance the cursor — retry on the next poll.
                logger.warning(
                    "recruiter poll: chat %s failed for %s", ref.get("nid"), user_id,
                    exc_info=True,
                )
                continue
            if handled:
                await asyncio.sleep(throttle.next_delay(_rng))
    finally:
        await persist_if_refreshed(user_id, client, original)


def _history(msgs: list[dict]) -> list[tuple[str, str]]:
    """chatik messages → LangChain (role, content) tuples for agent context."""
    out: list[tuple[str, str]] = []
    for m in msgs:
        if not m["text"]:
            continue
        out.append(("user" if m["from_employer"] else "assistant", m["text"]))
    return out


async def _process_chat(user_id: str, agent, client, ref: dict) -> bool:
    """Returns True when the agent acted (so the caller throttles before the next
    chat). Cursor (`last_handled_message_id`) is the dedup key — only the newest
    employer message, when unhandled, triggers a reply."""
    nid = ref["nid"]
    last_id = ref.get("last_id")
    if last_id is None:
        return False
    # Newest message is ours → waiting on the employer, nothing to do.
    if ref.get("last_participant_id") == ref.get("applicant_id"):
        return False
    cursor = await recruiter.get_cursor(user_id, nid)
    if cursor is not None and str(cursor) == str(last_id):
        return False  # already handled this message

    msgs = await chatik.chat_messages(user_id, ref["chat_id"], ref["applicant_id"])
    if not msgs:
        return False
    # Newest employer-authored text message (bot or real recruiter).
    target = next((m for m in reversed(msgs) if m["from_employer"] and m["text"]), None)
    if target is None:
        return False
    if cursor is not None and str(cursor) == str(target["id"]):
        return False

    vacancy_id = ref.get("vacancy_id")
    mid = target["id"]
    if target["buttons"]:
        # Robot-recruiter quick-reply: the agent must pick an exact button label
        # (free text loops) via answer_with_button, or escalate.
        await agent.answer_recruiter_choice(
            nid, mid, _history(msgs), client, target["text"], target["buttons"]
        )
    elif target["is_bot"]:
        # Bot text without buttons (greeting / "Спасибо, ответы отправлены") —
        # nothing to answer; just mark handled.
        pass
    else:
        # Real recruiter wrote — free-text agent decides (reply/escalate/todo).
        await agent.answer_recruiter(
            nid, mid, _history(msgs), client, question_text=target["text"] or None
        )
    await recruiter.upsert_cursor(user_id, nid, mid, vacancy_id=vacancy_id)
    return True
