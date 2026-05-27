# Recruiter Chat Agent — Design

**Date:** 2026-05-27
**Status:** Approved for planning

## Goal

An AI agent that reads recruiter/bot messages in hh.ru negotiations (chats) and
either answers them directly or escalates a draft for the user to approve. One
chat = one agent thread (`thread_id = negotiation_id`). The agent is grounded in
the user's resume and a system prompt.

## Scope

- Poll recruiter chats inside the existing per-user worker runner loop.
- Decide per incoming recruiter message: **answer**, **escalate**, or **skip**.
- Answer closed questions whose answer is already in the resume.
- Escalate everything ambiguous (scheduling, decisions, info not in the resume)
  as a draft for user approval.
- Create a todo when the recruiter asks for an action **outside** hh (fill a
  Google form, message a Telegram handle, call a number).
- Skip noise (rejections, archived vacancy, "resume under review, we'll contact
  you") — both by code pre-filtering and by the system prompt telling the agent
  to call no tool.

Out of scope: full chat-history UI, recruiter-initiated outbound campaigns,
multi-resume routing per chat (uses the same resume selection as the apply path).

## Architecture

### Data flow (added to `worker/runner.py::_run_loop`)

```
_run_loop (per user)
  └─ poll_recruiter_chats(handle)                 # NEW step, once per loop iteration
       ├─ load_api_client(user_id); original_access = client.access_token
       ├─ GET /negotiations  (filter: unread_messages > 0)
       ├─ for each chat (throttle.next_delay between chats):
       │    ├─ recruiter_chats row → last_handled_message_id
       │    ├─ GET /negotiations/{nid}/messages → messages after last_handled
       │    ├─ no new employer message → skip
       │    ├─ code-filter system/service messages (by author.participant_type)
       │    ├─ HHAgent.answer_recruiter(negotiation_id, message_id, history, client)
       │    │     → agent calls a tool (or none):
       │    │        send_message_recruiter  → POST to hh    (tool side effect)
       │    │        escalate_to_human       → insert draft  (tool side effect)
       │    │        make_todo               → insert todo   (tool side effect)
       │    │        (no tool)               → skip
       │    └─ poller updates recruiter_chats.last_handled_message_id (covers skip too)
       └─ persist_if_refreshed(user_id, client, original_access)
```

Cadence: once per existing loop iteration. `GET /negotiations` is a single cheap
call; per-chat calls are throttled with the existing `throttle.next_delay`.

### Components

**1. `HHAgent` becomes user-aware (`ai/agent.py`)**

Currently `HHAgent()` takes no args and is built via
`field(default_factory=HHAgent)` in `RunnerHandle`. Change to `HHAgent(user_id)`
so it can ground the recruiter agent in the user's resume.

- On construction (or lazily on first recruiter call), load the resume summary
  via the existing `form_filler.load_resume` + `_resume_summary` (reuse, do not
  duplicate). Cache it on the instance.
- Build the recruiter agent once with `create_agent(llm, tools=[...],
  system_prompt=<resume-grounded prompt>, context_schema=RecruiterContext,
  checkpointer=InMemorySaver())`.
- The resume is baked into the **static** system prompt (the agent is per-user,
  per-runner, so this is correct). Per-chat data travels via `context`, not the
  prompt.

`RunnerHandle.agent` changes from `field(default_factory=HHAgent)` to construction
with `handle.user_id`.

**2. Tools — side-effecting, context-injected (`ai/recruiter_tools.py`)**

Tools perform their own I/O (per user's explicit decision). They read per-chat
context through LangChain v1 `ToolRuntime`, which is hidden from the model:

```python
from dataclasses import dataclass
from langchain.tools import tool, ToolRuntime
from app.hh.client import ApiClient

@dataclass
class RecruiterContext:
    user_id: str
    negotiation_id: str
    message_id: str          # the recruiter message being answered (for dedup/draft)
    client: ApiClient        # user's hh client, already loaded by the poller

@tool
async def send_message_recruiter(message: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Send a reply to the recruiter. Use ONLY when the question is closed and
    the answer is already present in the candidate's resume."""
    ctx = runtime.context
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: ctx.client.post(f"/negotiations/{ctx.negotiation_id}/messages",
                                {"message": message}),
    )
    return "sent"

@tool
async def escalate_to_human(draft: str, reason: str, runtime: ToolRuntime[RecruiterContext]) -> str:
    """Save a suggested reply as a draft for the user to approve/edit/send. Use
    for anything ambiguous, scheduling, or information not in the resume."""
    ctx = runtime.context
    # insert recruiter_drafts(pending) via service_client (run_in_executor)
    # insert notifications row type="recruiter_draft"
    return "escalated"

@tool
async def make_todo(title: str, detail: str, link: str | None,
                    runtime: ToolRuntime[RecruiterContext]) -> str:
    """Create a todo for an action the user must take OUTSIDE hh — fill a Google
    form, message a Telegram handle, call a number. `link` is the form/profile URL
    if the recruiter gave one, else None."""
    ctx = runtime.context
    # insert recruiter_todos(open) via service_client (run_in_executor)
    # insert notifications row type="recruiter_todo"
    return "todo_created"
```

- `service_client` is the module-global Supabase client (import), not part of
  context.
- The hh `ApiClient` is sync and rate-limited; tool calls wrap it in
  `run_in_executor` to avoid blocking the event loop (same pattern as the rest of
  the codebase).
- Tools do **not** advance the dedup cursor — the poller owns that, so a `skip`
  (no tool) is still recorded.

**3. `answer_recruiter` (`ai/agent.py`)**

```python
async def answer_recruiter(self, negotiation_id, message_id, history, client) -> None:
    ctx = RecruiterContext(self.user_id, negotiation_id, message_id, client)
    config = {"configurable": {"thread_id": negotiation_id}}
    await self.recruiter_agent.ainvoke(
        {"messages": history}, config=config, context=ctx
    )
```

`history` is the full hh message thread (hh is the source of truth), so the agent
survives restarts even while `InMemorySaver` only holds within-session memory.
Return value is unused by the runner (tools did the work); log the outcome.

**4. System prompt (`ai/prompt.py::RECRUITER_SYSTEM_PROMPT`)** — currently empty.

Persona: a job candidate's assistant replying to recruiters, grounded in the
resume (interpolated). Rules:
- Closed question + answer in resume → `send_message_recruiter`.
- Ambiguous / interview scheduling / request for info not in resume →
  `escalate_to_human` with a suggested draft and a short reason.
- Recruiter asks for an action outside hh (fill a form/link, write Telegram, call)
  → `make_todo` with a clear title, detail, and the link if given.
- Rejection / archived vacancy / "resume under review, we'll contact you" → call
  **no tool** (no reply needed).
- Never invent experience not in the resume.
- Reply in the recruiter's language (default Russian).

Embed the real rejection / "resume under review" samples (see Appendix) as
few-shot examples of the **no-tool** case so the agent reliably recognizes them.

**5. Tables (`infra/supabase/migrations/010_recruiter_chats.sql`)**

```sql
CREATE TABLE IF NOT EXISTS recruiter_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  vacancy_id text,
  employer_name text,
  last_handled_message_id text,
  last_polled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, negotiation_id)              -- dedup key
);

CREATE TABLE IF NOT EXISTS recruiter_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  message_id text,                              -- recruiter message answered
  draft_text text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',       -- 'pending'|'sent'|'discarded'
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS recruiter_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  message_id text,                              -- recruiter message that spawned it
  title text NOT NULL,
  detail text,
  link text,                                    -- form/profile URL, nullable
  status text NOT NULL DEFAULT 'open',          -- 'open'|'done'|'dismissed'
  created_at timestamptz DEFAULT now(),
  done_at timestamptz
);

ALTER TABLE recruiter_chats  ENABLE ROW LEVEL SECURITY;  -- service_role only, no policies
ALTER TABLE recruiter_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiter_todos  ENABLE ROW LEVEL SECURITY;
-- (frontend reads drafts/todos through the backend API, not direct Supabase)
```

**6. API (`api/recruiter.py`, mounted in `api/router.py`)** — JWT-protected via
`deps.get_current_user`:

- `GET  /api/recruiter/drafts` — list pending drafts for the user.
- `POST /api/recruiter/drafts/{id}/send` — body `{message?: str}` (optional edit);
  POST to hh `/negotiations/{nid}/messages`, set status `sent`, `resolved_at`.
- `POST /api/recruiter/drafts/{id}/discard` — set status `discarded`,
  `resolved_at`.
- `GET  /api/recruiter/todos` — list open todos for the user.
- `POST /api/recruiter/todos/{id}/done` — set status `done`, `done_at`.
- `POST /api/recruiter/todos/{id}/dismiss` — set status `dismissed`, `done_at`.

**7. Notifications** — `escalate_to_human` inserts a `notifications` row
`type="recruiter_draft"`; `make_todo` inserts `type="recruiter_todo"`. UI surfaces
both via Realtime (existing pattern).

**8. Frontend** — a todo list surface under `app/(app)/` showing open
`recruiter_todos` (title, detail, link, source chat) with done/dismiss actions,
alongside the drafts approval queue. Both read through the backend API
(`lib/api.ts` `apiFetch`), not direct Supabase.

## Dedup / idempotency

- `recruiter_chats.last_handled_message_id` is the cursor. Poller fetches only
  messages after it, processes the latest employer message, then advances the
  cursor — regardless of outcome (send/escalate/skip).
- `send` path: our reply becomes the last message → next poll's last author is the
  applicant → not re-triggered even before the cursor write.
- `escalate` path: the draft is pending and the recruiter message is still last;
  the advanced cursor prevents re-drafting on the next poll.

## Error handling

- No resume available → resume summary empty; agent still runs (less grounded).
- Empty `OPENAI_API_KEY` → recruiter agent is skipped entirely (no-op fallback,
  same convention as `form_filler`/`cover_letter`). Never crash the loop.
- hh `POST /messages` fails (network/403) → log; do **not** advance the cursor for
  that chat so it retries next poll. A token-dead/banned error surfaces through the
  existing client error mapping; the poller logs and moves on.
- Draft send via API hits hh error → return the error to the frontend; leave the
  draft `pending`.

## Future (noted, not in this build)

- Swap `InMemorySaver` → `AsyncPostgresSaver` (LangGraph Postgres checkpointer)
  for cross-restart short-term memory. Single-line change at agent construction in
  `HHAgent`.

## Testing

- `answer_recruiter` with a mock LLM that calls each tool → assert
  `send_message_recruiter` POSTs to hh, `escalate_to_human` inserts a draft,
  `make_todo` inserts a todo, no tool call → no side effects.
- Code-filter drops system/service messages before the LLM.
- Skip cases: feed the real rejection / "resume under review" samples (see
  appendix) → agent calls no tool.
- Poller dedup: re-poll the same message → no second agent call, no duplicate send.
- `POST /api/recruiter/drafts/{id}/send` → POSTs to hh (mock client), marks `sent`.
- `discard` → marks `discarded`, no hh call.
- `POST /api/recruiter/todos/{id}/done` → marks `done`.

Tests are unit-level (mock Supabase + hh client), matching existing conventions.
```

## Open follow-ups

- Exact hh `/negotiations` query params + message JSON shape: confirm against
  `hh-applicant-tool/docs/hhapi/openapi.yml` (`get-negotiations`,
  `get-negotiation-messages`, `send-negotiation-message`) during implementation.
- `author.participant_type` values for the system-message code filter: confirm
  from a real message payload.


## Appendix: real message samples (no-tool / skip cases)

Examples of rejection:
1)
Отказ

Здравствуйте!
Благодарим вас за интерес к вакансии!
Мы внимательно рассмотрели ваше резюме, но, к сожалению, сейчас мы не готовы пригласить вас на следующий этап.
Желаем вам успехов в поиске подходящей позиции и профессиональной реализации!

С уважением,
ЮК Импульс

2)
Отказ

Нұрмұхамед , добрый день!

Благодарим за интерес к вакансии и направленный отклик. Мы внимательно изучили резюме.

На данный момент мы не готовы продолжить общение по вакансии. Для этой позиции ищем кандидата, чей опыт более близок к задачам, которые стоят перед нашей командой.

Мы ценим желание развиваться в МТС. Будем рады получать отклики по другим вакансиям на нашем карьерном сайте: https://job.mts.ru/.

Команда подбора МТС

3)
Отказ

Нұрмұхамед, здравствуйте!

Большое спасибо за интерес к нашей компании! К сожалению, сейчас мы не готовы пригласить вас на следующий этап. Ценим ваше внимание и будем рады взаимодействию в будущем.

Зяблова Ольга



Examples of you CV in review:
1)
Нұрмұхамед, здравствуйте!

Рассмотрим ваше резюме. Если навыки и опыт подойдут для позиции, мы свяжемся с вами.

Баган Анастасия Юрьевна

2)
Нұрмұхамед , добрый день!

Благодарим за интерес и отклик на нашу вакансию.
Мы внимательно изучим резюме и позже вернемся к вам, если будем готовы продолжить диалог.


Хорошего дня!
Команда подбора МТС

3)
Нұрмұхамед, здравствуйте!

Рассмотрим ваше резюме. Если навыки и опыт подойдут для позиции, мы свяжемся с вами.

Галиуллина Рината

---

Examples of vacancy in archive:

1)
Спасибо за интерес к вакансии! Мы ценим ваше желание работать с нами, но уже закрыли эту позицию.

Возможно, скоро снова появится подходящая для вас позиция — можете подписаться на вакансии компании, чтобы не пропустить.

С уважением, Мальцева Алёна

---

Examples when bot should reply immediatly:

1)
Нұрмұхамед , добрый день!
Спасибо за отклик 😌

Мы рассмотрели ваше резюме и хотим пригласить на следующий этап — выполнение тестового задания и запись видеовизитки. Будете готовы выполнить?

Коммуникацию далее предлагаем вести в Телеграм, продублируйте, пожалуйста, контакт в чат. Спасибо!

2) (в этом пример зависит от резюме пользователя)
Здравствуйте! Спасибо за отклик.
Подскажите, работали ли вы с Generative AI (генерация изображений/видео)?
Если да, то пожалуйста кратко расскажите о ваших задачах

3)
Здравствуйте!
Спасибо за интерес к вакансии. Чтобы работодатель узнал о вас больше, пожалуйста, ответьте на несколько вопросов. Это займет всего пару минут.
Начнем?

У Вас есть проекты в портфолио, которые позволяют оценить Ваши навыки?

---

Examples when bot should escalate to human:

1)
Здравствуйте!
Приглашаем вас на собеседование завтра, 19 мая, в 12:30.
Адрес: ул. Луганского, 1, ЖК «Арман», офис 275.
Подскажите, пожалуйста, сможете подойти?

2)
Собеседование

Добрый день! Спасибо за отклик. Хотела бы обратить ваше внимание на то, что мы ищем человека на роль спикера для съемок онлайн-курса. Вакансия предполагает очные съемки в Петербурге. Правильно ли поняла, что ваш отклик означает, что вы готовы принять участие в таком проекте? Приехать к нам, чтоб отснять материалы к курсу в студии?

---
Examples when bot should make a new todo task:

1)
Собеседование

Здравствуйте, Нұрмұхамед!

Благодарим вас за интерес к нашей вакансии.
Прежде чем мы перейдем к следующему этапу, заполните, пожалуйста, анкету по ссылке:
https://docs.google.com/forms/d/e/1FAIpQLSfuoGzRmZ1uLhSv074mAgDi8NH4reQAWwh0UKF0Ps4iYQaTYg/viewform?usp=dialog

После этого, мы свяжемся с вами и пригласим на собеседование, если ваш опыт соответствует вакансии.

С уважением,
Абаскулиева Ульяна

2)
Собеседование

Нұрмұхамед, добрый день! Спасибо, что выбрали для старта своей карьеры компанию Sapiens solutions!

Для того чтобы пройти на стажерскую программу Вам необходимо пройти регистрацию по ссылке👉🏻: https://internarenadata.sapiens.solutions и выполнить вступительные задания! В течение 3 рабочих дней мы с Вами свяжемся о дальнейшем прохождении на следующий этап (обучение).

Мустафа Кристина Юрьевна

3)
Собеседование

Нұрмұхамед, здравствуйте!

У вас интересное резюме. Прошу пройти анкету по ссылке чтобы пройти на следующий этап: https://forms.gle/xP4eeaaWBnMiGxzP8

Алдонгаров Жаслан