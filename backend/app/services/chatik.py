"""hh.ru chatik web API — read robot-recruiter quick-reply buttons.

The new hh chat ("Робот-рекрутер") lives on chatik.hh.ru, NOT the legacy
negotiations API. The legacy `GET /negotiations/{nid}/messages` omits
`actions.text_buttons`, so the worker reading via that API is blind to the
allowed answers. The bot accepts a reply ONLY when its text exactly matches a
button label — free-form prose loops (bot re-asks forever).

We read the buttons here over the stored web session (the same cookies the
form-filler uses) so the recruiter agent can answer with an exact label. No
browser. The reply itself is still sent via the legacy messages API — those
messages do land in the chatik chat (verified).

Endpoints (cookies for .hh.ru cover chatik.hh.ru):
  GET /chatik/api/chats      → list recent chats; each item maps
                               resources.NEGOTIATION_TOPIC (= legacy nid) → id (chatId)
  GET /chatik/api/chat_data  → messages incl. actions.text_buttons
"""

from __future__ import annotations

import asyncio
import logging

from app.services.form_filler import load_web_session

logger = logging.getLogger(__name__)

CHATIK = "https://chatik.hh.ru/chatik/api"
_HEADERS = {"X-Requested-With": "XMLHttpRequest", "Referer": "https://hh.ru/chat"}


def _chats_map(session) -> dict[str, dict]:
    """nid (NEGOTIATION_TOPIC) -> {chat_id, applicant_id} for recent chats.

    The list is not paginated server-side (returns the ~20 most recent), but
    the poller only processes chats with `has_updates`, which are recently
    active and therefore at the top — so one page is enough."""
    r = session.get(
        f"{CHATIK}/chats",
        params={"do_not_track_session_events": "true"},
        headers=_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    out: dict[str, dict] = {}
    for it in (r.json().get("chats") or {}).get("items", []):
        applicant_id = str(it.get("currentParticipantId") or "")
        for topic in (it.get("resources") or {}).get("NEGOTIATION_TOPIC") or []:
            out[str(topic)] = {"chat_id": str(it["id"]), "applicant_id": applicant_id}
    return out


def _pending_buttons(session, chat_id: str, applicant_id: str) -> tuple[str, list[str]] | None:
    """If the LAST message in the chat is a bot message with text_buttons, return
    (question_text, labels). Otherwise None — nothing currently awaiting a tap."""
    r = session.get(
        f"{CHATIK}/chat_data",
        params={
            "chatId": chat_id,
            "applicantId": applicant_id,
            "do_not_track_session_events": "true",
        },
        headers={**_HEADERS, "Referer": f"https://hh.ru/chat/{chat_id}"},
        timeout=15,
    )
    r.raise_for_status()
    items = (((r.json() or {}).get("chat") or {}).get("messages") or {}).get("items") or []
    if not items:
        return None
    last = items[-1]
    if not (last.get("participantDisplay") or {}).get("isBot"):
        return None
    buttons = (last.get("actions") or {}).get("text_buttons") or []
    labels = [b["text"] for b in buttons if b.get("text")]
    if not labels:
        return None
    return (last.get("text") or "").strip(), labels


async def bot_buttons(user_id: str, nid: str) -> tuple[str, list[str]] | None:
    """Pending robot-recruiter question + its button labels for negotiation `nid`.

    Returns None when there is no web session, the chat is not in the recent
    list, or the latest message has no text_buttons (e.g. a live recruiter, or
    the bot already moved on). Never raises — the caller falls back to the
    free-text recruiter path."""
    loop = asyncio.get_running_loop()
    try:
        session = await load_web_session(user_id)
    except Exception:
        return None

    def _q():
        ref = _chats_map(session).get(str(nid))
        if not ref:
            return None
        return _pending_buttons(session, ref["chat_id"], ref["applicant_id"])

    try:
        return await loop.run_in_executor(None, _q)
    except Exception:
        logger.warning("chatik: buttons fetch failed for nid=%s", nid, exc_info=True)
        return None
