"""Batch semantic relevance filter for found vacancies.

filter_relevant: pure classifier (llm + resume summary + items) → per-id verdict.
Conservative (only clear mismatches dropped) and fail-open (any failure → keep all).
Cache helpers persist verdicts in relevance_cache (service_role).
"""

from __future__ import annotations

import json
import logging
import re

from app.ai.prompts import build_relevance_prompt
from app.db.supabase import service_client

logger = logging.getLogger(__name__)

# verdict = (relevant: bool, reason: str)
Verdict = tuple[bool, str]

_JSON_OBJ = re.compile(r"\{.*\}", re.DOTALL)


def _llm_text(llm, prompt: str) -> str:
    content = llm.invoke(prompt).content
    if isinstance(content, list):  # some models return content parts
        content = " ".join(str(c) for c in content)
    return (content or "").strip()


def filter_relevant(llm, resume_summary: str, items: list[dict]) -> dict[str, Verdict]:
    """Return {vacancy_id: (relevant, reason)} for each item.

    items carry {id, name, snippet_requirement, snippet_responsibility}.
    Conservative: an id is irrelevant only if the LLM explicitly lists it.
    Fail-open: no llm / parse error / exception → every item relevant.
    """
    if not items:
        return {}
    ids = [str(it["id"]) for it in items if it.get("id")]
    if not llm:
        return {vid: (True, "fail_open") for vid in ids}

    lines = []
    for it in items:
        vid = str(it.get("id") or "")
        if not vid:
            continue
        ctx = " ".join(filter(None, [
            it.get("name") or "",
            it.get("snippet_requirement") or "",
            it.get("snippet_responsibility") or "",
        ]))
        lines.append(f"- id={vid}: {ctx}")
    prompt = build_relevance_prompt(resume_summary, "\n".join(lines))

    try:
        raw = _llm_text(llm, prompt)
        match = _JSON_OBJ.search(raw)
        parsed = json.loads(match.group(0) if match else raw)
        irrelevant = {
            str(e["id"]): str(e.get("reason") or "")
            for e in parsed.get("irrelevant", [])
            if isinstance(e, dict) and e.get("id") is not None
        }
    except Exception:
        logger.warning("relevance: LLM parse failed — fail-open (keep all)", exc_info=True)
        return {vid: (True, "fail_open") for vid in ids}

    return {
        vid: ((False, irrelevant[vid]) if vid in irrelevant else (True, ""))
        for vid in ids
    }
