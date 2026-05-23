"""Send one job application to hh via POST /negotiations.

Day 13 will swap the cover-letter stub for GPT-generated text.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal

from app.db.supabase import service_client
from app.hh import errors as hh_errors
from app.services.hh_credentials import (
    HHCredentialsInvalid,
    load_api_client,
    mark_invalid,
    persist_if_refreshed,
)

logger = logging.getLogger(__name__)

ApplyStatus = Literal[
    "sent",
    "failed",
    "captcha",
    "skipped",
    "limit_day",
    "token_dead",
    "test_required",
    "resume_missing",
]

_TEST_REQUIRED_MARKERS = (
    "must process test",
    "process test first",
    "тест",
)

STATIC_COVER_LETTER = (
    "Здравствуйте! Меня заинтересовала ваша вакансия, "
    "буду рад обсудить детали и присоединиться к команде."
)

_ALREADY_APPLIED_MARKERS = (
    "already",
    "duplicate",
    "повтор",
    "уже отправ",
)


def _resolve_hh_resume_id(user_id: str, resume_uuid: str) -> tuple[str, str] | None:
    """Returns (hh_resume_id, resume_uuid) or None if not found."""
    res = (
        service_client.table("resumes")
        .select("id,hh_resume_id")
        .eq("user_id", user_id)
        .eq("id", resume_uuid)
        .maybe_single()
        .execute()
    )
    row = res.data if res else None
    if not row:
        return None
    return row["hh_resume_id"], row["id"]


def _already_applied(user_id: str, vacancy_id: str) -> bool:
    res = (
        service_client.table("applications")
        .select("id")
        .eq("user_id", user_id)
        .eq("vacancy_id", vacancy_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _is_already_applied_error(ex: hh_errors.ClientError) -> bool:
    msg = str(ex).lower()
    return any(m in msg for m in _ALREADY_APPLIED_MARKERS)


def _record_application(
    *,
    user_id: str,
    resume_uuid: str,
    vacancy_id: str,
    status: ApplyStatus,
    cover_letter: str | None,
    error: str | None,
    employer_id: str | None = None,
) -> None:
    row = {
        "user_id": user_id,
        "resume_id": resume_uuid,
        "vacancy_id": vacancy_id,
        "employer_id": employer_id,
        "status": status,
        "cover_letter": cover_letter,
        "error": error,
    }
    if status == "sent":
        row["applied_at"] = datetime.now(timezone.utc).isoformat()
    try:
        service_client.table("applications").upsert(
            row, on_conflict="user_id,vacancy_id"
        ).execute()
    except Exception:  # pragma: no cover — best-effort log row
        logger.exception("failed to persist application row")


def _fetch_employer_id(vacancy_id: str, client) -> str | None:
    try:
        v = client.get(f"vacancies/{vacancy_id}")
    except Exception:
        return None
    emp = v.get("employer") if isinstance(v, dict) else None
    return str(emp["id"]) if isinstance(emp, dict) and emp.get("id") else None


def _auto_blacklist(user_id: str, employer_id: str | None) -> None:
    if not employer_id:
        return
    try:
        service_client.table("blacklist").upsert(
            {
                "user_id": user_id,
                "employer_id": employer_id,
                "reason": "auto_already_applied",
            },
            on_conflict="user_id,employer_id",
        ).execute()
    except Exception:  # pragma: no cover
        logger.exception("failed to auto-blacklist employer %s", employer_id)


async def apply_one(
    user_id: str, resume_uuid: str, vacancy_id: str
) -> ApplyStatus:
    """Send a single application. Returns final status."""
    loop = asyncio.get_running_loop()
    logger.info(
        "apply: user=%s resume=%s vacancy=%s — start",
        user_id, resume_uuid, vacancy_id,
    )

    resolved = await loop.run_in_executor(
        None, _resolve_hh_resume_id, user_id, resume_uuid
    )
    if resolved is None:
        logger.warning("apply: resume %s not found for user %s", resume_uuid, user_id)
        return "resume_missing"
    hh_resume_id, resume_uuid = resolved
    logger.debug("apply: hh_resume_id=%s", hh_resume_id)

    if await loop.run_in_executor(None, _already_applied, user_id, vacancy_id):
        logger.info("apply: user=%s already applied to vacancy=%s", user_id, vacancy_id)
        return "skipped"

    try:
        client = await load_api_client(user_id)
    except HHCredentialsInvalid:
        logger.error("apply: user=%s creds invalid", user_id)
        return "token_dead"
    original_access = client.access_token
    cover_letter = STATIC_COVER_LETTER
    employer_id: str | None = None

    try:
        params = {
            "resume_id": hh_resume_id,
            "vacancy_id": vacancy_id,
            "message": cover_letter,
        }
        logger.info(
            "apply: POST /negotiations user=%s vacancy=%s resume=%s",
            user_id, vacancy_id, hh_resume_id,
        )
        try:
            await loop.run_in_executor(
                None, lambda: client.post("/negotiations", params)
            )
        except hh_errors.CaptchaRequired as ex:
            await loop.run_in_executor(
                None,
                lambda: _record_application(
                    user_id=user_id,
                    resume_uuid=resume_uuid,
                    vacancy_id=vacancy_id,
                    status="captcha",
                    cover_letter=cover_letter,
                    error=ex.captcha_url,
                ),
            )
            return "captcha"
        except hh_errors.LimitExceeded:
            logger.info("user %s: hh LimitExceeded on vacancy %s", user_id, vacancy_id)
            return "limit_day"
        except hh_errors.Forbidden as ex:
            msg = str(ex).lower()
            if any(m in msg for m in _TEST_REQUIRED_MARKERS):
                logger.info(
                    "apply: user=%s vacancy=%s requires test — skip",
                    user_id, vacancy_id,
                )
                await loop.run_in_executor(
                    None,
                    lambda: _record_application(
                        user_id=user_id,
                        resume_uuid=resume_uuid,
                        vacancy_id=vacancy_id,
                        status="skipped",
                        cover_letter=cover_letter,
                        error=f"test_required: {ex}",
                    ),
                )
                return "test_required"
            logger.warning("user %s: hh Forbidden — marking creds invalid", user_id)
            await mark_invalid(user_id, f"Forbidden: {ex}")
            return "token_dead"
        except hh_errors.ClientError as ex:
            if _is_already_applied_error(ex):
                employer_id = await loop.run_in_executor(
                    None, _fetch_employer_id, vacancy_id, client
                )
                await loop.run_in_executor(
                    None, _auto_blacklist, user_id, employer_id
                )
                await loop.run_in_executor(
                    None,
                    lambda: _record_application(
                        user_id=user_id,
                        resume_uuid=resume_uuid,
                        vacancy_id=vacancy_id,
                        status="skipped",
                        cover_letter=cover_letter,
                        error=f"already_applied: {ex}",
                        employer_id=employer_id,
                    ),
                )
                return "skipped"
            await loop.run_in_executor(
                None,
                lambda: _record_application(
                    user_id=user_id,
                    resume_uuid=resume_uuid,
                    vacancy_id=vacancy_id,
                    status="failed",
                    cover_letter=cover_letter,
                    error=f"{type(ex).__name__}: {ex}",
                ),
            )
            return "failed"

        employer_id = await loop.run_in_executor(
            None, _fetch_employer_id, vacancy_id, client
        )
        logger.info(
            "apply: SENT user=%s vacancy=%s employer=%s",
            user_id, vacancy_id, employer_id,
        )
        await loop.run_in_executor(
            None,
            lambda: _record_application(
                user_id=user_id,
                resume_uuid=resume_uuid,
                vacancy_id=vacancy_id,
                status="sent",
                cover_letter=cover_letter,
                error=None,
                employer_id=employer_id,
            ),
        )
        return "sent"
    finally:
        await persist_if_refreshed(user_id, client, original_access)
