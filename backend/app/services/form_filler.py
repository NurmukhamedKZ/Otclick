"""Load full resume content for AI form-filling agent."""

from __future__ import annotations

import asyncio
import html
import json
import logging
import re
from typing import Literal

import requests
from langchain_core.language_models import BaseChatModel

from app.config import settings
from app.db.supabase import service_client
from app.services.hh_auth import decrypt_token
from app.services.hh_credentials import load_api_client, persist_if_refreshed

logger = logging.getLogger(__name__)

# Subset of apply.ApplyStatus that fill() can produce.
# "form_sent" = a test was solved + submitted (distinct from a plain "sent").
FillStatus = Literal["form_sent", "form_required", "failed"]

# Desktop UA for the hh.ru web session (test pages live on the desktop site).
HH_WEB_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _load_cookies_encrypted(user_id: str) -> str | None:
    res = (
        service_client.table("hh_credentials")
        .select("web_cookies_encrypted")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    data = res.data if res else None
    return data.get("web_cookies_encrypted") if data else None


async def load_web_session(user_id: str) -> requests.Session:
    """Build a requests.Session from the stored hh.ru web cookies.

    Cookies were captured during the OAuth login (see hh/authorize.py). No
    browser, no re-login. Raises ValueError if no session is stored (the user
    connected before cookie capture existed → needs reconnect).
    """
    loop = asyncio.get_running_loop()
    enc = await loop.run_in_executor(None, _load_cookies_encrypted, user_id)
    if not enc:
        raise ValueError(f"no stored web session for user {user_id} — reconnect required")

    cookies = json.loads(decrypt_token(enc))
    session = requests.Session()
    session.headers["User-Agent"] = HH_WEB_USER_AGENT
    for c in cookies:
        session.cookies.set(
            c["name"], c["value"], domain=c.get("domain"), path=c.get("path", "/")
        )
    return session


def extract_xsrf_token(html: str) -> str:
    """Pull the xsrfToken out of an hh.ru page's inline JSON state."""
    marker = ',"xsrfToken":"'
    start = html.find(marker)
    if start == -1:
        raise ValueError("xsrfToken not found in page")
    start += len(marker)
    end = html.find('"', start)
    return html[start:end]


async def _get_hh_resume_id(user_id: str, resume_row_id: str | None) -> str:
    """Pick hh_resume_id: explicit row id, else most recent synced resume."""
    loop = asyncio.get_running_loop()

    def _q():
        q = (
            service_client.table("resumes")
            .select("hh_resume_id")
            .eq("user_id", user_id)
        )
        if resume_row_id:
            q = q.eq("id", resume_row_id)
        else:
            q = q.order("synced_at", desc=True).limit(1)
        return q.execute()

    res = await loop.run_in_executor(None, _q)
    rows = res.data or []
    if not rows:
        raise ValueError(f"no resume found for user {user_id}")
    return rows[0]["hh_resume_id"]


async def load_resume(user_id: str, resume_row_id: str | None = None) -> dict:
    """Fetch full resume from hh API. Returns raw resume payload.

    resume_row_id: optional id of row in `resumes` table.
                   If None, picks most recently synced resume.
    """
    hh_resume_id = await _get_hh_resume_id(user_id, resume_row_id)

    client = await load_api_client(user_id)
    original_access = client.access_token
    loop = asyncio.get_running_loop()
    try:
        payload = await loop.run_in_executor(
            None, client.get, f"resumes/{hh_resume_id}"
        )
    finally:
        await persist_if_refreshed(user_id, client, original_access)

    if not isinstance(payload, dict):
        raise RuntimeError(f"unexpected hh resume payload: {type(payload)}")
    return payload


# --- vacancy test solving (web endpoint) -------------------------------------

_TESTS_MARKER = ',"vacancyTests":'
_COUNTERS_MARKER = ',"counters":'


def _strip_tags(s: str | None) -> str:
    # Tags in the page JSON are entity-encoded (&lt;p&gt;) — unescape first.
    text = re.sub(r"<[^>]+>", " ", html.unescape(s or ""))
    return re.sub(r"\s+", " ", text).strip()


def _ai_answer(chat: BaseChatModel, prompt: str) -> str:
    content = chat.invoke(prompt).content
    if isinstance(content, list):  # some models return content parts
        content = " ".join(str(c) for c in content)
    return (content or "").strip()


def _resume_summary(resume: dict) -> str:
    """Compact text of the resume to ground test answers. Bounded ~2000 chars."""
    parts: list[str] = []
    if resume.get("title"):
        parts.append(f"Желаемая должность: {resume['title']}")
    skills = resume.get("skill_set") or []
    if skills:
        parts.append("Навыки: " + ", ".join(str(s) for s in skills[:30]))
    if resume.get("skills"):
        parts.append("О себе: " + _strip_tags(resume["skills"])[:600])
    for e in (resume.get("experience") or [])[:4]:
        pos = e.get("position") or ""
        comp = e.get("company") or ""
        desc = _strip_tags(e.get("description"))[:300]
        parts.append(f"Опыт: {pos} @ {comp}. {desc}".strip())
    return "\n".join(parts)[:2000]


def _parse_tests(page_html: str, vacancy_id: str) -> dict:
    """Pull the test definition for vacancy_id out of the page's inline JSON."""
    start = page_html.find(_TESTS_MARKER)
    end = page_html.find(_COUNTERS_MARKER, start)
    if start == -1 or end == -1:
        raise ValueError("vacancyTests block not found in page")
    blob = page_html[start + len(_TESTS_MARKER):end]
    tests_data = json.loads(blob, strict=False)
    try:
        return tests_data[str(vacancy_id)]
    except KeyError as ex:
        raise ValueError(f"no test data for vacancy {vacancy_id}") from ex


def _choose_solution(
    chat: BaseChatModel | None, question: str, solutions: list, resume_ctx: str = ""
) -> str:
    """Pick a candidate solution id for a multiple-choice task, grounded in resume."""
    if chat is not None:
        options = "\n".join(
            f"{s['id']}: {_strip_tags(s.get('text'))}" for s in solutions
        )
        prompt = (
            "Ты отвечаешь на вопрос теста вакансии от имени кандидата, "
            "правдиво и на основе его резюме.\n"
            f"Резюме кандидата:\n{resume_ctx or '(нет данных)'}\n\n"
            f"Вопрос: {question}\n"
            f"Варианты:\n{options}\n"
            "Выбери ID наиболее подходящего и правдивого для кандидата ответа. "
            "Пришли только ID."
        )
        try:
            match = re.search(r"\d+", _ai_answer(chat, prompt))
            if match and any(str(s["id"]) == match.group(0) for s in solutions):
                return match.group(0)
        except Exception:
            logger.warning("fill: AI choose failed — using fallback", exc_info=True)
    # Fallback: prefer "да", else the middle option (statistically common).
    yes = next(
        (s for s in solutions if str(s.get("text", "")).strip().lower() == "да"),
        None,
    )
    return str(yes["id"]) if yes else str(solutions[len(solutions) // 2]["id"])


def _free_text(chat: BaseChatModel | None, question: str, resume_ctx: str = "") -> str:
    """Answer a free-text task, grounded in the candidate's resume."""
    if chat is not None:
        try:
            prompt = (
                "Ты отвечаешь на вопрос теста вакансии от имени кандидата, "
                "кратко и честно, на основе его резюме. Не выдумывай опыт, "
                "которого нет в резюме.\n"
                f"Резюме кандидата:\n{resume_ctx or '(нет данных)'}\n\n"
                f"Вопрос: {question}\n"
                "Дай краткий профессиональный ответ (2-4 предложения)."
            )
            return _ai_answer(chat, prompt)
        except Exception:
            logger.warning("fill: AI free-text failed — using fallback", exc_info=True)
    return "Да"


def _solve_and_submit(
    session: requests.Session,
    vacancy: dict,
    hh_resume_id: str,
    chat: BaseChatModel | None,
    resume_ctx: str = "",
    letter: str = "",
) -> tuple[requests.Response, list[dict]]:
    """Fetch the test, answer each task, POST the response. Sync — runs in executor.

    Returns (response, answers) where answers is a per-task record of the
    question and the chosen answer for persistence/audit.
    """
    vacancy_id = str(vacancy["id"])
    response_url = (
        f"https://hh.ru/applicant/vacancy_response?vacancyId={vacancy_id}"
        "&startedWithQuestion=false&hhtmFrom=vacancy"
    )
    r = session.get(response_url, timeout=15)
    r.raise_for_status()
    page = r.text

    test_data = _parse_tests(page, vacancy_id)
    xsrf = extract_xsrf_token(page)

    payload: dict = {
        "_xsrf": xsrf,
        "uidPk": test_data["uidPk"],
        "guid": test_data["guid"],
        "startTime": test_data["startTime"],
        "testRequired": test_data["required"],
        "vacancy_id": vacancy_id,
        "resume_hash": hh_resume_id,
        "ignore_postponed": "true",
        "incomplete": "false",
        "mark_applicant_visible_in_vacancy_country": "false",
        "country_ids": "[]",
        "lux": "true",
        "withoutTest": "no",
        "letter": letter,
    }

    answers: list[dict] = []
    for task in test_data["tasks"]:
        field = f"task_{task['id']}"
        solutions = task.get("candidateSolutions") or []
        question = _strip_tags(task.get("description"))
        if solutions:
            sel_id = _choose_solution(chat, question, solutions, resume_ctx)
            sel_text = next(
                (_strip_tags(s.get("text")) for s in solutions if str(s["id"]) == sel_id),
                "",
            )
            payload[field] = sel_id
            answers.append({
                "task_id": task["id"],
                "question": question,
                "type": "choice",
                "options": [
                    {"id": str(s["id"]), "text": _strip_tags(s.get("text"))}
                    for s in solutions
                ],
                "answer_id": sel_id,
                "answer": sel_text,
            })
        else:
            ans = _free_text(chat, question, resume_ctx)
            payload[f"{field}_text"] = ans
            answers.append({
                "task_id": task["id"],
                "question": question,
                "type": "text",
                "answer": ans,
            })

    resp = session.post(
        "https://hh.ru/applicant/vacancy_response/popup",
        data=payload,
        headers={
            "Referer": response_url,
            "X-Hhtmfrom": "vacancy",
            "X-Hhtmsource": "vacancy_response",
            "X-Requested-With": "XMLHttpRequest",
            "X-Xsrftoken": xsrf,
        },
        timeout=20,
    )
    return resp, answers


def _is_success(resp: requests.Response) -> bool:
    if resp.status_code != 200:
        return False
    try:
        data = resp.json()
    except ValueError:
        return False
    if isinstance(data, dict) and (data.get("error") or data.get("errors")):
        return False
    return True


async def fill_form(
    llm: BaseChatModel, user_id: str, resume_id: str, vacancy: dict
) -> tuple[FillStatus, list[dict]]:
    """Solve a vacancy test and submit the application over the hh.ru web
    endpoint, reusing the stored web session (no browser, no re-login).

    Answers are produced by `llm` (the caller's shared HHAgent model). Returns
    (status, answers): "form_sent" on accepted submit (distinct from a plain
    auto "sent" so the UI can flag test-solved applications), "form_required"
    otherwise (no stored session, no resume, fetch/parse failure, or hh
    rejected the answers) so the caller falls back to skip + manual handling.
    `answers` is the per-task question/answer record for persistence (empty
    when we bailed before solving).
    """
    vacancy_id = str(vacancy.get("id") or "")
    loop = asyncio.get_running_loop()

    try:
        session = await load_web_session(user_id)
    except ValueError as ex:
        logger.warning("fill: no web session for user %s: %s", user_id, ex)
        return "form_required", []

    try:
        hh_resume_id = await _get_hh_resume_id(user_id, resume_id)
    except ValueError as ex:
        logger.warning("fill: %s", ex)
        return "form_required", []

    # No API key → answer with fallbacks (None signals "no AI" to the helpers).
    chat = llm if settings.OPENAI_API_KEY else None
    resume_ctx = ""
    if chat is not None:
        try:
            resume = await load_resume(user_id, resume_id)
            resume_ctx = _resume_summary(resume)
        except Exception:
            logger.warning(
                "fill: resume load failed — answers ungrounded", exc_info=True
            )

    try:
        resp, answers = await loop.run_in_executor(
            None, _solve_and_submit, session, vacancy, hh_resume_id, chat, resume_ctx
        )
    except Exception:
        logger.exception("fill: solve/submit failed for vacancy=%s", vacancy_id)
        return "form_required", []

    if _is_success(resp):
        logger.info("fill: test solved + submitted vacancy=%s", vacancy_id)
        return "form_sent", answers
    logger.warning(
        "fill: submit not accepted vacancy=%s status=%s body=%.300s",
        vacancy_id, resp.status_code, resp.text,
    )
    return "form_required", answers