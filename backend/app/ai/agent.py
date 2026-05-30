"""Central AI interface for hh automation.

One HHAgent per worker runner (per user). Wraps a single langchain ChatOpenAI
(self.llm) shared by every AI path — form-test answers, cover letters, and the
recruiter chat agent. No per-call LLM construction.
"""

from __future__ import annotations

import logging

from langchain.agents import create_agent
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver

import asyncio

from app.ai.prompts import build_recruiter_choice_prompt, build_recruiter_prompt
from app.ai.recruiter_tools import RECRUITER_TOOLS, RecruiterContext
from app.config import settings
from app.services.cover_letter import generate as _generate_cover_letter
from app.services.form_filler import FillStatus, prepare_form_answers
from app.services.relevance import Verdict, filter_relevant

logger = logging.getLogger(__name__)


class HHAgent:
    """Single entry point for all LLM work. Construct once per runner/user."""

    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        # ChatOpenAI raises without an api key; empty key → fallback paths use None.
        self.llm = (
            ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                model=settings.OPENAI_MODEL,
                rate_limiter=InMemoryRateLimiter(
                    requests_per_second=settings.OPENAI_RATE_LIMIT / 60.0
                ),
            )
            if settings.OPENAI_API_KEY
            else None
        )
        self._recruiter_agent = None
        self._resume_summary: str | None = None
        self._full_resumes: dict[str, dict] = {}
        self._relevance_summaries: dict[str, str] = {}

    async def write_form_answers(
        self, user_id: str, resume_id: str, vacancy: dict
    ) -> tuple[FillStatus, list[dict]]:
        """Generate vacancy-test answers — caller persists for user approval."""
        return await prepare_form_answers(self.llm, user_id, resume_id, vacancy)

    async def write_cover_letter(
        self, user_id: str, vacancy: dict, resume: dict, resume_uuid: str
    ) -> str:
        """Cover letter text. PG cache → self.llm → fallback template.

        `resume` arg is the sparse DB row (title only). Pull the full hh resume
        payload so the prompt is grounded in the candidate's real experience —
        fall back to the sparse row if the fetch fails."""
        full = await self._load_full_resume(resume_uuid)
        return await _generate_cover_letter(
            self.llm,
            user_id=user_id,
            vacancy=vacancy,
            resume=full or resume,
            resume_uuid=resume_uuid,
        )

    async def filter_relevant_vacancies(
        self, resume_id: str, items: list[dict]
    ) -> dict[str, Verdict]:
        """Per-vacancy relevance verdicts grounded in the filter's resume.

        items: {id, name, snippet_requirement, snippet_responsibility}.
        Fail-open: no llm → all relevant (handled inside filter_relevant)."""
        summary = await self._summary_for(resume_id)
        return filter_relevant(self.llm, summary, items)

    async def _summary_for(self, resume_id: str) -> str:
        """Resume summary for a specific resume_id, cached. '' on failure."""
        if resume_id in self._relevance_summaries:
            return self._relevance_summaries[resume_id]
        from app.services.form_filler import _resume_summary, load_resume
        try:
            resume = await load_resume(self.user_id, resume_id)
            summary = _resume_summary(resume)
        except Exception:
            logger.warning(
                "relevance: resume load failed for %s/%s — ungrounded",
                self.user_id, resume_id, exc_info=True,
            )
            summary = ""
        self._relevance_summaries[resume_id] = summary
        return summary

    async def _load_full_resume(self, resume_uuid: str) -> dict | None:
        """Full hh resume payload, cached per resume_uuid (same as the
        recruiter path's _resume_summary). None on failure → caller falls back."""
        if resume_uuid in self._full_resumes:
            return self._full_resumes[resume_uuid]
        from app.services.form_filler import load_resume
        try:
            resume = await load_resume(self.user_id, resume_uuid)
            self._full_resumes[resume_uuid] = resume
            return resume
        except Exception:
            logger.warning(
                "cover_letter: full resume load failed for %s — using sparse row",
                self.user_id, exc_info=True,
            )
            return None

    async def _load_resume_summary(self) -> str:
        if self._resume_summary is not None:
            return self._resume_summary
        from app.services.form_filler import _resume_summary, load_resume
        try:
            resume = await load_resume(self.user_id)
            self._resume_summary = _resume_summary(resume)
        except Exception:
            logger.warning(
                "recruiter: resume load failed for %s — ungrounded", self.user_id, exc_info=True
            )
            self._resume_summary = ""
        return self._resume_summary

    def _build_recruiter_agent(self, system_prompt: str):
        return create_agent(
            self.llm,
            tools=RECRUITER_TOOLS,
            system_prompt=system_prompt,
            context_schema=RecruiterContext,
            checkpointer=InMemorySaver(),
        )

    async def answer_recruiter(
        self, negotiation_id: str, message_id: str,
        history: list[tuple[str, str]], client,
        question_text: str | None = None,
    ) -> None:
        """Decide + act on the latest recruiter message via tools (send/escalate/
        todo) or no-op. Conversation memory keyed by negotiation_id. The
        `question_text` is the verbatim recruiter message and is persisted
        with any draft so the user can review it on the Todo screen."""
        if not settings.OPENAI_API_KEY:
            logger.info("recruiter: no OPENAI_API_KEY — skipping chat %s", negotiation_id)
            return
        if self._recruiter_agent is None:
            summary = await self._load_resume_summary()
            self._recruiter_agent = self._build_recruiter_agent(build_recruiter_prompt(summary))
        ctx = RecruiterContext(
            self.user_id, negotiation_id, message_id, client,
            question_text=question_text,
        )
        await self._recruiter_agent.ainvoke(
            {"messages": history},
            config={
                "configurable": {"thread_id": negotiation_id},
                "metadata": {"thread_id": negotiation_id, "session_id": negotiation_id},
            },
            context=ctx,
        )

    async def answer_recruiter_choice(
        self, negotiation_id: str, client, question: str, labels: list[str]
    ) -> bool:
        """Reply to a robot-recruiter quick-reply question with the EXACT button
        label it expects (hh's bot loops on free-form prose). The label is picked
        by the LLM grounded in the resume and sent verbatim via the legacy
        messages API (those messages do reach the chatik chat).

        Returns True if a label was sent, False if no label could be chosen
        confidently (caller escalates to the user instead of guessing)."""
        label = await self._choose_label(question, labels)
        if label is None:
            return False
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: client.post(
                f"negotiations/{negotiation_id}/messages", {"message": label}
            ),
        )
        logger.info(
            "recruiter: answered bot buttons nid=%s label=%r", negotiation_id, label
        )
        return True

    async def _choose_label(self, question: str, labels: list[str]) -> str | None:
        """LLM picks one button label. Returns the verbatim label or None when
        the answer does not map cleanly to a single option."""
        if self.llm is None or not labels:
            return None
        summary = await self._load_resume_summary()
        prompt = build_recruiter_choice_prompt(summary, question, labels)
        try:
            resp = await self.llm.ainvoke(prompt)
        except Exception:
            logger.warning("recruiter: choice LLM failed", exc_info=True)
            return None
        content = resp.content
        if isinstance(content, list):  # some models return content parts
            content = " ".join(str(c) for c in content)
        text = (content or "").strip().strip('"').strip()
        for l in labels:  # exact match (preferred — bot needs verbatim)
            if text == l:
                return l
        for l in labels:  # tolerant: model added/dropped punctuation
            if text.lower() == l.lower():
                return l
        for l in labels:  # model echoed the label inside a sentence
            if l.lower() in text.lower():
                return l
        logger.warning("recruiter: choice %r not in labels %s", text, labels)
        return None
