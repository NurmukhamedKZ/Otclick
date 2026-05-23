"""Cover letter generator with Postgres cache.

- Cache key: (vacancy_id, resume_id). Hit → skip OpenAI.
- Miss → ChatOpenAI.complete; on failure → rand_text fallback template.
- All writes via service_role (RLS deny-all on table).
"""

from __future__ import annotations

import asyncio
import logging
import random
import re

from app.ai import ChatOpenAI, OpenAIError
from app.config import settings
from app.db.supabase import service_client

logger = logging.getLogger(__name__)


FALLBACK_TEMPLATE = (
    "{Здравствуйте|Добрый день}! Меня заинтересовала вакансия "
    "«%(vacancy_name)s» в компании %(employer_name)s. Мой опыт по резюме "
    "«%(resume_title)s» {соответствует|подходит под} требованиям, "
    "{буду рад|готов} {обсудить детали|пообщаться подробнее}."
)


def rand_text(s: str) -> str:
    """Resolve {a|b|c} alternations randomly. Ported from hh-applicant-tool."""
    while (
        temp := re.sub(
            r"\{([^{}]+)\}",
            lambda m: random.choice(m.group(1).split("|")),
            s,
        )
    ) != s:
        s = temp
    return s


def _build_fallback(vacancy: dict, resume: dict) -> str:
    placeholders = {
        "vacancy_name": vacancy.get("name") or "вакансию",
        "employer_name": (vacancy.get("employer") or {}).get("name") or "",
        "resume_title": resume.get("title") or "",
    }
    return rand_text(FALLBACK_TEMPLATE) % placeholders


def _build_prompt(vacancy: dict, resume: dict) -> str:
    parts = [
        f"Вакансия: {vacancy.get('name', '')}",
        f"Компания: {(vacancy.get('employer') or {}).get('name', '')}",
    ]
    desc = vacancy.get("description") or ""
    if desc:
        # strip HTML tags cheaply
        desc = re.sub(r"<[^>]+>", " ", desc)
        desc = re.sub(r"\s+", " ", desc).strip()
        parts.append(f"Описание: {desc[:1500]}")
    snippet = vacancy.get("snippet") or {}
    req = snippet.get("requirement") or ""
    if req:
        parts.append(f"Требования: {re.sub(r'<[^>]+>', '', req)}")
    parts.append(f"Резюме (заголовок): {resume.get('title', '')}")
    return "\n".join(parts)


def _cache_get(vacancy_id: str, resume_uuid: str) -> str | None:
    res = (
        service_client.table("cover_letters_cache")
        .select("text")
        .eq("vacancy_id", vacancy_id)
        .eq("resume_id", resume_uuid)
        .maybe_single()
        .execute()
    )
    row = res.data if res else None
    return row["text"] if row else None


def _cache_put(
    *,
    user_id: str,
    vacancy_id: str,
    resume_uuid: str,
    text: str,
    model: str | None,
    source: str,
) -> None:
    try:
        service_client.table("cover_letters_cache").upsert(
            {
                "user_id": user_id,
                "vacancy_id": vacancy_id,
                "resume_id": resume_uuid,
                "text": text,
                "model": model,
                "source": source,
            },
            on_conflict="vacancy_id,resume_id",
        ).execute()
    except Exception:  # pragma: no cover
        logger.exception("cover_letter: cache write failed")


_client_singleton: ChatOpenAI | None = None


def _get_client() -> ChatOpenAI | None:
    global _client_singleton
    if not settings.OPENAI_API_KEY:
        return None
    if _client_singleton is None:
        _client_singleton = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            model=settings.OPENAI_MODEL,
            system_prompt=settings.COVER_LETTER_SYSTEM_PROMPT,
            rate_limit=settings.OPENAI_RATE_LIMIT,
            temperature=0.4,
            max_completion_tokens=600,
        )
    return _client_singleton


async def generate(
    *,
    user_id: str,
    vacancy: dict,
    resume: dict,
    resume_uuid: str,
) -> str:
    """Return cover letter text. Hits cache, then OpenAI, then fallback."""
    loop = asyncio.get_running_loop()
    vacancy_id = str(vacancy.get("id") or "")
    if not vacancy_id:
        return _build_fallback(vacancy, resume)

    cached = await loop.run_in_executor(
        None, _cache_get, vacancy_id, resume_uuid
    )
    if cached:
        logger.debug("cover_letter: cache hit vacancy=%s", vacancy_id)
        return cached

    client = _get_client()
    text: str | None = None
    source = "fallback"
    model: str | None = None

    if client is not None:
        prompt = _build_prompt(vacancy, resume)
        try:
            text = await loop.run_in_executor(None, client.complete, prompt)
            text = (text or "").strip()
            if text:
                source = "ai"
                model = settings.OPENAI_MODEL
            else:
                text = None
        except OpenAIError as ex:
            logger.warning(
                "cover_letter: OpenAI failed for vacancy=%s: %s", vacancy_id, ex
            )

    if not text:
        text = _build_fallback(vacancy, resume)

    await loop.run_in_executor(
        None,
        lambda: _cache_put(
            user_id=user_id,
            vacancy_id=vacancy_id,
            resume_uuid=resume_uuid,
            text=text,
            model=model,
            source=source,
        ),
    )
    return text
