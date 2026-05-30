"""Poll recruiter chats and run the AI agent. Called once per runner loop iter."""

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
    """Fetch negotiations with unread messages; for each new employer message,
    invoke the agent. Errors are logged and never crash the runner loop."""
    loop = asyncio.get_running_loop()
    try:
        client = await load_api_client(user_id)
    except Exception:
        logger.warning("recruiter poll: cannot load creds for %s", user_id, exc_info=True)
        return
    original = client.access_token
    try:
        try:
            data = await loop.run_in_executor(
                None,
                lambda: client.get("negotiations", order_by="updated_at", per_page=50),
            )
        except Exception:
            logger.warning("recruiter poll: list negotiations failed for %s", user_id, exc_info=True)
            return

        for item in data.get("items", []):
            # hh `counters.unread_messages` is unreliable (counts own activity).
            # `has_updates` flips when employer touches the chat; the per-message
            # `viewed_by_me` check inside _process_chat guards against false
            # positives (e.g. employer-side status changes without text).
            if not item.get("has_updates"):
                continue
            await _process_chat(user_id, agent, client, item)
            await asyncio.sleep(throttle.next_delay(_rng))
    finally:
        await persist_if_refreshed(user_id, client, original)


async def _process_chat(user_id: str, agent, client, item: dict) -> None:
    nid = str(item["id"])
    vacancy = item.get("vacancy") or {}
    vacancy_id = vacancy.get("id")
    employer_name = (vacancy.get("employer") or {}).get("name")
    loop = asyncio.get_running_loop()
    try:
        cursor = await recruiter.get_cursor(user_id, nid)
        msgs = await loop.run_in_executor(
            None, lambda: client.get(f"negotiations/{nid}/messages", with_text_only="true")
        )
        items = msgs.get("items", [])
        target = recruiter.new_employer_message(items, cursor)
        if target is None:
            return
        # Rejection (Отказ): employer declined — do NOT send the message to the AI.
        # Advance the cursor so the rejection text is marked handled and never re-evaluated.
        if (item.get("state") or {}).get("id") == "discard":
            await recruiter.upsert_cursor(
                user_id, nid, str(target["id"]), vacancy_id=vacancy_id, employer_name=employer_name
            )
            return
        history = recruiter.to_lc_messages(items)
        # Robot-recruiter quick-reply: the bot accepts only an exact button
        # label (free text loops). The legacy API hides the buttons, so read
        # them from chatik and let the agent pick one (answer_with_button) or
        # escalate. None → live recruiter / no pending buttons → free-text path.
        buttons = await chatik.bot_buttons(user_id, nid)
        if buttons is not None:
            question, labels = buttons
            await agent.answer_recruiter_choice(
                nid, str(target["id"]), history, client, question, labels
            )
            await recruiter.upsert_cursor(
                user_id, nid, str(target["id"]),
                vacancy_id=vacancy_id, employer_name=employer_name,
            )
            return
        await agent.answer_recruiter(
            nid, str(target["id"]), history, client,
            question_text=(target.get("text") or "").strip() or None,
        )
        await recruiter.upsert_cursor(
            user_id, nid, str(target["id"]), vacancy_id=vacancy_id, employer_name=employer_name
        )
    except Exception:
        # Do NOT advance the cursor — retry on the next poll.
        logger.warning("recruiter poll: chat %s failed for %s", nid, user_id, exc_info=True)
