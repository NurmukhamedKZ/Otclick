"""System prompts + AI-output sanitizer for HHAgent."""

from __future__ import annotations

import re

# --- output sanitizer --------------------------------------------------------

# Em/en dashes → hyphen. Strip markdown emphasis chars (`*`, `_`, `**`, `__`).
# Applied to every AI-produced string before it leaves the backend.
_MD_BOLD = re.compile(r"\*\*|__")
_MD_EMPH = re.compile(r"[*_]")
_DASHES = re.compile(r"[—–]")


def sanitize_ai_text(text: str | None) -> str:
    """Remove markdown emphasis and em/en dashes from AI output."""
    if not text:
        return ""
    s = _MD_BOLD.sub("", text)
    s = _MD_EMPH.sub("", s)
    s = _DASHES.sub("-", s)
    return s.strip()


# --- recruiter chat ----------------------------------------------------------

RECRUITER_RULES = """\
Ты - ассистент соискателя, ведёшь переписку с рекрутёрами на hh.ru от его имени.
У тебя есть резюме кандидата (ниже). Отвечай на русском (или языке рекрутёра),
МАКСИМАЛЬНО КРАТКО (1-2 предложения), вежливо. НИКОГДА не выдумывай опыт.

ФОРМАТ ОТВЕТА: только plain text. БЕЗ markdown (*, _, **), БЕЗ длинных тире (—),
БЕЗ эмодзи, БЕЗ приветствий типа "Уважаемые господа".

Реши, что делать с последним сообщением, и вызови РОВНО ОДИН инструмент (или ни одного):

- send_message_recruiter(message): закрытый вопрос, ответ ЕСТЬ в резюме
  (зарплата, опыт, навыки, город, удалёнка). Отвечай прямо и коротко.
- escalate_to_human(draft, reason): всё неоднозначное - назначение собеседования,
  запрос данных не из резюме, решение для человека. draft - короткий ответ,
  reason - кратко почему.
- make_todo(title, detail, link): рекрутёр просит сделать что-то ВНЕ hh -
  гугл-форма, Telegram, звонок. link - URL если есть, иначе пусто.
- НЕ вызывай инструмент: отказ, вакансия в архиве, "резюме в обработке".

Примеры сообщений БЕЗ ответа:
- "...мы не готовы пригласить вас..." (отказ)
- "Рассмотрим резюме. Если подойдёт - свяжемся." (в обработке)
"""

RECRUITER_SYSTEM_PROMPT = RECRUITER_RULES


def build_recruiter_prompt(resume_summary: str) -> str:
    """Recruiter system prompt grounded in candidate resume."""
    resume = resume_summary.strip() or "(резюме недоступно)"
    return f"{RECRUITER_RULES}\n\nРезюме кандидата:\n{resume}\n"


def build_recruiter_choice_prompt(
    resume_summary: str, question: str, labels: list[str]
) -> str:
    """Pick one quick-reply button label for a robot-recruiter question.

    The hh robot accepts an answer ONLY when it exactly matches a button label,
    so the model must return one label verbatim — no rephrasing."""
    opts = "\n".join(f"- {l}" for l in labels)
    return (
        "Робот-рекрутёр на hh.ru задал вопрос с готовыми вариантами ответа "
        "(кнопками). Выбери ОДИН вариант от имени кандидата, правдиво и на "
        "основе его резюме.\n"
        f"Резюме кандидата:\n{resume_summary or '(нет данных)'}\n\n"
        f"Вопрос: {question or '(см. варианты)'}\n"
        f"Варианты ответа:\n{opts}\n\n"
        "Верни ТОЛЬКО текст одного варианта, ДОСЛОВНО как в списке: без кавычек, "
        "без пояснений, без изменений."
    )


# --- cover letter ------------------------------------------------------------

COVER_LETTER_SYSTEM_PROMPT = (
    "Ты - кандидат на вакансию. Напиши сопроводительное письмо на русском, "
    "МАКСИМАЛЬНО КРАТКО: 2-3 коротких предложения. Без воды, без приветствий "
    "типа 'Уважаемые господа', без эмодзи. Без markdown (*, _, **), без длинных "
    "тире (—). Свяжи 1-2 факта из резюме с требованиями. Заверши готовностью "
    "обсудить. Не выдумывай факты."
)


# --- form-test answers -------------------------------------------------------

def build_form_choice_prompt(question: str, options_block: str, resume_ctx: str) -> str:
    """Pick an option id for a multiple-choice vacancy-test task."""
    return (
        "Ты отвечаешь на вопрос теста вакансии от имени кандидата, "
        "правдиво и на основе его резюме.\n"
        f"Резюме кандидата:\n{resume_ctx or '(нет данных)'}\n\n"
        f"Вопрос: {question}\n"
        f"Варианты:\n{options_block}\n"
        "Выбери ID самого подходящего и правдивого ответа. Пришли ТОЛЬКО ID, ничего больше."
    )


def build_form_text_prompt(question: str, resume_ctx: str) -> str:
    """Free-text vacancy-test answer. Must be ultra-short, plain text.

    Example желаемый формат:
      Вопрос: Укажите желаемый доход (фикс в месяц на руки)
      Ответ: 250 000-300 000 руб на руки в месяц
    """
    return (
        "Ты отвечаешь на вопрос теста вакансии от имени кандидата, на основе резюме.\n"
        f"Резюме кандидата:\n{resume_ctx or '(нет данных)'}\n\n"
        f"Вопрос: {question}\n\n"
        "ТРЕБОВАНИЯ К ОТВЕТУ:\n"
        "- МАКСИМАЛЬНО КРАТКО: одна строка, идеально 3-10 слов.\n"
        "- Только факт/число/диапазон. Без вступлений, без 'я считаю', без объяснений.\n"
        "- Plain text. БЕЗ markdown (*, _, **). БЕЗ длинных тире (—), используй обычный дефис.\n"
        "- Не выдумывай то, чего нет в резюме.\n\n"
        "Пример:\n"
        "Вопрос: Укажите желаемый доход (фикс в месяц на руки)\n"
        "Ответ: 250 000-300 000 руб на руки в месяц\n\n"
        "Дай только текст ответа, без префикса 'Ответ:'."
    )


# --- vacancy relevance ------------------------------------------------------

def build_relevance_prompt(resume_summary: str, items_block: str) -> str:
    """Classify which vacancies clearly do NOT match the candidate's resume.

    Conservative: only flag clear mismatches; when in doubt, keep (omit)."""
    return (
        "Ты фильтруешь вакансии для кандидата по его резюме. Твоя задача — "
        "найти ТОЛЬКО те вакансии, которые ЯВНО НЕ подходят кандидату по сути "
        "(другая профессия/специализация: например AI-инженеру не подходят "
        "'Менеджер по продажам', 'Android-разработчик', 'Бухгалтер').\n"
        "ПРАВИЛО: сомневаешься — НЕ помечай (оставь). Помечай только очевидные "
        "несовпадения профессии.\n\n"
        f"Резюме кандидата:\n{resume_summary or '(нет данных)'}\n\n"
        f"Вакансии:\n{items_block}\n\n"
        'Верни СТРОГО JSON без пояснений в формате: '
        '{"irrelevant": [{"id": "<id>", "reason": "<кратко почему>"}]}. '
        "Если все подходят — верни {\"irrelevant\": []}."
    )
