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

from app.ai.prompts import sanitize_ai_text
from app.hh.client import ApiClient
from app.services import recruiter
from app.services.notifications import notify


@dataclass
class RecruiterContext:
    user_id: str
    negotiation_id: str
    message_id: str
    client: ApiClient
    question_text: str | None = None


# --- side-effect helpers (testable without a ToolRuntime) --------------------

async def do_send(ctx: RecruiterContext, message: str) -> str:
    clean = sanitize_ai_text(message)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: ctx.client.post(f"negotiations/{ctx.negotiation_id}/messages", {"message": clean}),
    )
    return "sent"


async def do_escalate(ctx: RecruiterContext, draft: str, reason: str) -> str:
    await recruiter.insert_draft(
        ctx.user_id, ctx.negotiation_id, ctx.message_id,
        sanitize_ai_text(draft), reason,
        question_text=ctx.question_text,
    )
    await notify(ctx.user_id, "recruiter_draft", {"negotiation_id": ctx.negotiation_id})
    return "escalated"


async def do_todo(ctx: RecruiterContext, title: str, detail: str, link: str | None) -> str:
    await recruiter.insert_todo(ctx.user_id, ctx.negotiation_id, ctx.message_id, title, detail, link)
    await notify(ctx.user_id, "recruiter_todo", {"negotiation_id": ctx.negotiation_id, "title": title})
    return "todo_created"


# --- tools (thin adapters; runtime injected by create_agent) -----------------

@tool
async def send_message_recruiter(message: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Отправить готовый ответ рекрутёру в чат hh.ru от имени кандидата.

    КОГДА ИСПОЛЬЗОВАТЬ:
    - Вопрос закрытый, ответ ЕСТЬ в резюме кандидата.
    - Примеры: зарплатные ожидания, годы опыта с технологией, город,
      готовность к удалёнке/релокации, владение языком.

    КОГДА НЕ ИСПОЛЬЗОВАТЬ:
    - Назначение времени собеседования → escalate_to_human.
    - Запрос данных, которых нет в резюме → escalate_to_human.
    - Просьба заполнить форму / написать в Telegram / позвонить → make_todo.
    - Отказ или "резюме в обработке" → не вызывай инструменты вообще.

    PARAMETERS:
    - message (str, required): текст ответа на русском (или языке рекрутёра).
      Формат: plain text, 1-2 коротких предложения, БЕЗ markdown (*, _, **),
      БЕЗ длинных тире (—), БЕЗ эмодзи, БЕЗ приветствий "Уважаемые господа".
      Длина: 5-200 символов. Не пустая строка.
      Пример good: "250 000-300 000 руб на руки, готов обсудить."
      Пример bad: "**Здравствуйте!** Мой опыт — 5 лет..."

    RETURNS: "sent" при успешной отправке.

    EDGE CASES:
    - Текст автоматически санитизируется (убираются markdown и тире).
    - Вызывается РОВНО ОДИН раз за сообщение рекрутёра. Не дублировать.
    """
    return await do_send(runtime.context, message)


@tool
async def escalate_to_human(draft: str, reason: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Сохранить черновик ответа для ручного подтверждения пользователем.

    КОГДА ИСПОЛЬЗОВАТЬ:
    - Назначение/перенос времени собеседования (нужно согласие человека).
    - Запрос данных, которых НЕТ в резюме (паспорт, ИИН, ссылки на профили).
    - Технические вопросы, требующие решения кандидата.
    - Любая неоднозначность, где автоответ может навредить.

    КОГДА НЕ ИСПОЛЬЗОВАТЬ:
    - Ответ есть в резюме → send_message_recruiter.
    - Действие вне hh (форма/Telegram/звонок) → make_todo.

    PARAMETERS:
    - draft (str, required): предлагаемый текст ответа, который человек
      отредактирует и отправит. Формат: plain text, 1-3 предложения,
      БЕЗ markdown (*, _, **), БЕЗ длинных тире (—). Длина: 10-500 символов.
      Пример: "Готов в среду в 15:00 МСК, подойдёт?"
    - reason (str, required): краткое объяснение ПОЧЕМУ эскалируешь (для UI).
      Формат: одна фраза, 3-15 слов, на русском. БЕЗ markdown.
      Примеры: "назначение времени интервью", "запрос данных не из резюме".

    RETURNS: "escalated" при успешном сохранении черновика.

    EDGE CASES:
    - draft санитизируется автоматически.
    - Пользователь получит уведомление recruiter_draft в UI.
    """
    return await do_escalate(runtime.context, draft, reason)


@tool
async def make_todo(title: str, detail: str, link: str | None,
                    runtime: ToolRuntime[RecruiterContext]) -> str:
    """Создать задачу для действия ВНЕ hh.ru (форма, Telegram, звонок, e-mail).

    КОГДА ИСПОЛЬЗОВАТЬ:
    - Рекрутёр просит заполнить Google Form / Notion / Typeform.
    - Просит написать в Telegram/WhatsApp по @username или номеру.
    - Просит позвонить по номеру.
    - Просит отправить файлы/портфолио на e-mail.

    КОГДА НЕ ИСПОЛЬЗОВАТЬ:
    - Ответить можно прямо в hh-чате → send_message_recruiter.
    - Нужен ручной ответ человека → escalate_to_human.

    PARAMETERS:
    - title (str, required): короткое название задачи в императиве.
      Формат: 3-8 слов, на русском, БЕЗ markdown, БЕЗ точки в конце.
      Пример good: "Заполнить Google-форму вакансии"
      Пример bad: "Нужно бы заполнить форму, которую прислал рекрутёр."
    - detail (str, required): что конкретно сделать + контекст из сообщения.
      Формат: 1-3 предложения, plain text, БЕЗ markdown. Длина: 10-400 символов.
      Пример: "Рекрутёр Анна просит заполнить форму до пятницы."
    - link (str | None, required): прямой URL формы/профиля/чата если ЕСТЬ в
      сообщении рекрутёра, иначе None (НЕ пустая строка, НЕ "нет", НЕ выдуманный).
      Допустимые форматы: "https://...", "tg://...", "mailto:...", None.
      Примеры: "https://forms.gle/abc", "https://t.me/recruiter_anna", None.

    RETURNS: "todo_created" при успешном создании.

    EDGE CASES:
    - Если рекрутёр дал номер телефона без ссылки → link=None, номер в detail.
    - Если в сообщении несколько ссылок → выбери основную (форма > профиль).
    - Пользователь получит уведомление recruiter_todo в UI.
    """
    return await do_todo(runtime.context, title, detail, link)


RECRUITER_TOOLS = [send_message_recruiter, escalate_to_human, make_todo]
