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
    quick_reply_labels: list[str] | None = None


def match_label(labels: list[str], text: str | None) -> str | None:
    """Resolve a model-supplied answer to one of the bot's exact button labels.

    The hh robot accepts a reply ONLY when it matches a label verbatim, so we
    map the model's text back to the real label string (preserving e.g. a
    trailing space). None when it does not map to a single option."""
    t = (text or "").strip().strip('"').strip()
    tl = t.lower()
    for l in labels:  # exact (preferred)
        if t == l:
            return l
    for l in labels:  # equal ignoring label's surrounding whitespace / case
        if tl == l.strip().lower():
            return l
    for l in labels:  # model echoed the label inside a sentence
        ls = l.strip().lower()
        if ls and (ls in tl or tl in ls):
            return l
    return None


# --- side-effect helpers (testable without a ToolRuntime) --------------------

async def _post_message(ctx: RecruiterContext, text: str) -> None:
    """POST a chat message to hh. Shared transport; callers own the text policy."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: ctx.client.post(
            f"negotiations/{ctx.negotiation_id}/messages", {"message": text}
        ),
    )


async def do_send(ctx: RecruiterContext, message: str) -> str:
    # free-text reply to a live recruiter — sanitize markdown/em-dashes.
    await _post_message(ctx, sanitize_ai_text(message))
    return "sent"


async def do_answer_button(ctx: RecruiterContext, label: str) -> str:
    """Answer a robot-recruiter quick-reply. Unlike do_send, the text MUST be
    one of the bot's button labels (the bot loops on anything else), so it is
    validated against the allowed set and sent verbatim — no sanitize, which
    would e.g. strip a label's trailing space and break the match."""
    matched = match_label(ctx.quick_reply_labels or [], label)
    if matched is None:
        return f"error: '{label}' не входит в варианты {ctx.quick_reply_labels}"
    await _post_message(ctx, matched)
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

@tool(return_direct=True)
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


@tool(return_direct=True)
async def escalate_to_human(draft: str, reason: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Сохранить черновик ответа для ручного подтверждения пользователем.

    КОГДА ИСПОЛЬЗОВАТЬ:
    - Назначение/перенос времени собеседования (нужно согласие человека).
    - Запрос данных, которых НЕТ в резюме (паспорт, ИИН, ссылки на профили).
    - Технические вопросы, требующие решения кандидата.
    - Любая неоднозначность, где автоответ может навредить.
    - Вопрос робота-рекрутёра с кнопками, но ты НЕ можешь уверенно выбрать
      вариант (нет данных в резюме / неоднозначно) → эскалируй, пусть человек
      выберет. НЕ угадывай через answer_with_button.

    КОГДА НЕ ИСПОЛЬЗОВАТЬ:
    - Ответ есть в резюме → send_message_recruiter.
    - Вопрос робота с кнопками И вариант понятен по резюме → answer_with_button.
    - Действие вне hh (форма/Telegram/звонок) → make_todo.

    PARAMETERS:
    - draft (str, required): предлагаемый текст ответа, который человек
      отредактирует и отправит. Формат: plain text, 1-3 предложения,
      БЕЗ markdown (*, _, **), БЕЗ длинных тире (—). Длина: 10-500 символов.
      Пример: "Готов в среду в 15:00 МСК, подойдёт?"
      Для вопроса робота с кнопками: draft = один из вариантов (твоё лучшее
      предположение, человек поменяет при необходимости).
    - reason (str, required): краткое объяснение ПОЧЕМУ эскалируешь (для UI).
      Формат: одна фраза, 3-15 слов, на русском. БЕЗ markdown.
      Примеры: "назначение времени интервью", "запрос данных не из резюме".
      ВАЖНО: если это вопрос робота с кнопками и ты не смог выбрать — в reason
      укажи И причину, ПОЧЕМУ не выбрал, И возможные варианты ответа дословно
      через " / ". Пример: "нет данных в резюме; варианты: Да / Рассматриваю
      зарплату выше".

    RETURNS: "escalated" при успешном сохранении черновика.

    EDGE CASES:
    - draft санитизируется автоматически.
    - Пользователь получит уведомление recruiter_draft в UI.
    """
    return await do_escalate(runtime.context, draft, reason)


@tool(return_direct=True)
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


@tool(return_direct=True)
async def answer_with_button(label: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Ответить роботу-рекрутёру, выбрав ОДИН готовый вариант ответа (кнопку).

    КОГДА ИСПОЛЬЗОВАТЬ:
    - К последнему сообщению робота приложены кнопки-варианты (их список дан
      в задании). Робот примет ответ ТОЛЬКО если текст точно совпадает с
      вариантом — поэтому обычный send_message_recruiter тут НЕ работает
      (робот зациклится и переспросит).
    - Выбирай правдиво на основе резюме кандидата.

    КОГДА НЕ ИСПОЛЬЗОВАТЬ:
    - Кнопок нет (свободный вопрос) → send_message_recruiter.
    - Ни один вариант не подходит / неоднозначно → escalate_to_human.

    PARAMETERS:
    - label (str, required): ТОЧНЫЙ текст одного из предложенных вариантов,
      скопированный дословно (включая регистр и пробелы). НЕ перефразируй.
      Пример: варианты ['Да, есть', 'Нет '] → label="Да, есть".

    RETURNS: "sent" при успехе; строку "error: ..." если label не совпал с
    вариантами (тогда выбери корректный вариант или escalate_to_human).
    """
    return await do_answer_button(runtime.context, label)


RECRUITER_TOOLS = [
    send_message_recruiter, escalate_to_human, make_todo, answer_with_button,
]
