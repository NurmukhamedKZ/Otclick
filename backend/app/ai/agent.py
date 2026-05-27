"""Central AI interface for hh automation.

One HHAgent per worker runner. Wraps a single langchain ChatOpenAI (self.llm)
shared by every AI path — form-test answers, cover letters, and the recruiter
chat agent. No per-call LLM construction, no bypassed clients: callers route
all completions through this class so rate-limiting and config live in one place.
"""

from __future__ import annotations

from langchain.agents import create_agent
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver

from app.ai.prompt import RECRUITER_SYSTEM_PROMPT
from app.config import settings
from app.services.cover_letter import generate as _generate_cover_letter
from app.services.form_filler import FillStatus, fill_form


class HHAgent:
    """Single entry point for all LLM work. Construct once per runner."""

    def __init__(self) -> None:
        self.llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            model=settings.OPENAI_MODEL,
            rate_limiter=InMemoryRateLimiter(
                requests_per_second=settings.OPENAI_RATE_LIMIT / 60.0
            ),
        )
        self.agent = create_agent(
            self.llm,
            tools=self.get_tools(),
            system_prompt=RECRUITER_SYSTEM_PROMPT,
            checkpointer=InMemorySaver(),
        )

    def get_tools(self) -> list:
        """Tools for the recruiter chat agent. None yet."""
        return []

    async def write_form_answers(
        self, user_id: str, resume_id: str, vacancy: dict
    ) -> tuple[FillStatus, list[dict]]:
        """Solve a vacancy test and submit. Returns (status, per-task answers)."""
        return await fill_form(self.llm, user_id, resume_id, vacancy)

    async def write_cover_letter(
        self, user_id: str, vacancy: dict, resume: dict, resume_uuid: str
    ) -> str:
        """Cover letter text. PG cache → self.llm → fallback template."""
        return await _generate_cover_letter(
            self.llm,
            user_id=user_id,
            vacancy=vacancy,
            resume=resume,
            resume_uuid=resume_uuid,
        )

    async def answer_recruiter(self, chat_id: str, question: str) -> str:
        """Recruiter chat reply. Conversation memory keyed by chat_id."""
        config = {"configurable": {"thread_id": chat_id}}
        result = await self.agent.ainvoke(
            {"messages": [("user", question)]}, config=config
        )
        return result["messages"][-1].content
