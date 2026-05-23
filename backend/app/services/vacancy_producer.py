"""Search hh vacancies per enabled filter, dedup, push jobs into per-user queue."""

from __future__ import annotations

import asyncio
import logging
import re

from app.db.supabase import service_client
from app.services.filters_service import _filter_to_search_params
from app.services.hh_credentials import load_api_client, persist_if_refreshed
from app.worker.queue import ApplyJob, get_user_queue

logger = logging.getLogger(__name__)

PER_PAGE = 50
MAX_PUSH_PER_RUN = 100


def _load_enabled_filters(user_id: str) -> list[dict]:
    res = (
        service_client.table("filters")
        .select(
            "id,resume_id,text,area,salary_min,experience,schedule,"
            "employment,professional_role,excluded_regex"
        )
        .eq("user_id", user_id)
        .eq("enabled", True)
        .execute()
    )
    return [f for f in (res.data or []) if f.get("resume_id")]


def _existing_vacancy_ids(user_id: str, vacancy_ids: list[str]) -> set[str]:
    if not vacancy_ids:
        return set()
    res = (
        service_client.table("applications")
        .select("vacancy_id")
        .eq("user_id", user_id)
        .in_("vacancy_id", vacancy_ids)
        .execute()
    )
    return {r["vacancy_id"] for r in (res.data or [])}


def _blacklisted_employer_ids(user_id: str, employer_ids: list[str]) -> set[str]:
    if not employer_ids:
        return set()
    res = (
        service_client.table("blacklist")
        .select("employer_id")
        .eq("user_id", user_id)
        .in_("employer_id", employer_ids)
        .execute()
    )
    return {r["employer_id"] for r in (res.data or [])}


def _matches_excluded(item: dict, pat: re.Pattern | None) -> bool:
    if not pat:
        return False
    hay = " ".join(filter(None, [
        item.get("name") or "",
        (item.get("employer") or {}).get("name") or "",
        ((item.get("snippet") or {}).get("requirement") or ""),
        ((item.get("snippet") or {}).get("responsibility") or ""),
    ]))
    return bool(pat.search(hay))


async def produce_jobs(user_id: str) -> int:
    """Refill user queue from enabled filters. Returns number of jobs pushed."""
    loop = asyncio.get_running_loop()
    filters = await loop.run_in_executor(None, _load_enabled_filters, user_id)
    if not filters:
        return 0

    client = await load_api_client(user_id)
    original_access = client.access_token
    queue = get_user_queue(user_id)
    pushed = 0

    try:
        for f in filters:
            if pushed >= MAX_PUSH_PER_RUN:
                break
            params = _filter_to_search_params(f)
            params["per_page"] = PER_PAGE
            params["page"] = 0
            try:
                payload = await loop.run_in_executor(
                    None, lambda p=params: client.get("vacancies", p)
                )
            except Exception:
                logger.exception("vacancy search failed for filter %s", f.get("id"))
                continue

            items = payload.get("items", []) if isinstance(payload, dict) else []
            if not items:
                continue

            excluded_pat: re.Pattern | None = None
            if f.get("excluded_regex"):
                try:
                    excluded_pat = re.compile(f["excluded_regex"], re.IGNORECASE)
                except re.error:
                    logger.warning("invalid excluded_regex on filter %s", f.get("id"))

            vacancy_ids = [str(it["id"]) for it in items if it.get("id")]
            employer_ids = [
                str((it.get("employer") or {}).get("id"))
                for it in items
                if (it.get("employer") or {}).get("id")
            ]
            already = await loop.run_in_executor(
                None, _existing_vacancy_ids, user_id, vacancy_ids
            )
            blacklisted = await loop.run_in_executor(
                None, _blacklisted_employer_ids, user_id, employer_ids
            )

            for it in items:
                if pushed >= MAX_PUSH_PER_RUN:
                    break
                vid = str(it.get("id") or "")
                if not vid or vid in already:
                    continue
                emp_id = (it.get("employer") or {}).get("id")
                if emp_id and str(emp_id) in blacklisted:
                    continue
                if _matches_excluded(it, excluded_pat):
                    continue
                await queue.put(
                    ApplyJob(
                        user_id=user_id,
                        resume_id=f["resume_id"],
                        vacancy_id=vid,
                        filter_id=f.get("id"),
                    )
                )
                pushed += 1
    finally:
        await persist_if_refreshed(user_id, client, original_access)

    logger.info("producer: user=%s pushed=%d", user_id, pushed)
    return pushed
