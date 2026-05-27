"""LangChain tools for the recruiter chat agent.

Tools perform their own side effects (hh POST / DB write). Per-chat data is
injected via ToolRuntime[RecruiterContext] at agent runtime and is hidden from
the model. ToolRuntime cannot be built by hand, so the side-effect logic lives
in plain helpers (do_send / do_escalate / do_todo) that take a RecruiterContext;
the tools are thin adapters over them.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from langchain.tools import ToolRuntime, tool

from app.hh.client import ApiClient
from app.services import recruiter
from app.services.notifications import notify


@dataclass
class RecruiterContext:
    user_id: str
    negotiation_id: str
    message_id: str
    client: ApiClient


# --- side-effect helpers (testable without a ToolRuntime) --------------------

async def do_send(ctx: RecruiterContext, message: str) -> str:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: ctx.client.post(f"negotiations/{ctx.negotiation_id}/messages", {"message": message}),
    )
    return "sent"


async def do_escalate(ctx: RecruiterContext, draft: str, reason: str) -> str:
    await recruiter.insert_draft(ctx.user_id, ctx.negotiation_id, ctx.message_id, draft, reason)
    await notify(ctx.user_id, "recruiter_draft", {"negotiation_id": ctx.negotiation_id})
    return "escalated"


async def do_todo(ctx: RecruiterContext, title: str, detail: str, link: str | None) -> str:
    await recruiter.insert_todo(ctx.user_id, ctx.negotiation_id, ctx.message_id, title, detail, link)
    await notify(ctx.user_id, "recruiter_todo", {"negotiation_id": ctx.negotiation_id, "title": title})
    return "todo_created"


# --- tools (thin adapters; runtime injected by create_agent) -----------------

@tool
async def send_message_recruiter(message: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Отправить ответ рекрутёру. Используй ТОЛЬКО когда вопрос закрытый и ответ
    уже есть в резюме кандидата."""
    return await do_send(runtime.context, message)


@tool
async def escalate_to_human(draft: str, reason: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Сохранить предлагаемый ответ как черновик для подтверждения пользователем.
    Используй для всего неоднозначного: собеседования, запросы данных не из резюме."""
    return await do_escalate(runtime.context, draft, reason)


@tool
async def make_todo(title: str, detail: str, link: str | None,
                    runtime: ToolRuntime[RecruiterContext]) -> str:
    """Создать задачу для действия ВНЕ hh — заполнить форму, написать в Telegram,
    позвонить. link — URL формы/профиля, если рекрутёр его дал, иначе None."""
    return await do_todo(runtime.context, title, detail, link)


RECRUITER_TOOLS = [send_message_recruiter, escalate_to_human, make_todo]
