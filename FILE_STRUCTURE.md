# File Structure

```
AIautoclicker/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app + lifespan
│   │   ├── config.py                  # Settings (env vars, Fernet key)
│   │   │
│   │   ├── api/                       # HTTP routes
│   │   │   ├── __init__.py
│   │   │   ├── router.py              # APIRouter сборка всех роутеров
│   │   │   ├── deps.py                # get_current_user, get_supabase, require_active_plan
│   │   │   ├── auth.py                # /auth/hh/connect, /auth/hh/refresh
│   │   │   ├── resumes.py             # GET /resumes/sync
│   │   │   ├── vacancies.py           # GET /vacancies/search (с Redis cache)
│   │   │   ├── filters.py             # CRUD /filters
│   │   │   ├── applications.py        # GET /applications
│   │   │   ├── blacklist.py           # CRUD /blacklist
│   │   │   ├── notifications.py       # GET /notifications, PATCH /notifications/{id}/read
│   │   │   ├── worker.py              # POST /worker/start|stop
│   │   │   ├── billing.py             # POST /billing/webhook (CloudPayments)
│   │   │   └── captcha.py             # POST /captcha/{id}/solved
│   │   │
│   │   ├── hh/                        # Код из hh-applicant-tool (копируем)
│   │   │   ├── __init__.py
│   │   │   ├── client.py              # ← api/client.py
│   │   │   ├── client_keys.py         # ← api/client_keys.py
│   │   │   ├── user_agent.py          # ← api/user_agent.py
│   │   │   ├── datatypes.py           # ← api/datatypes.py
│   │   │   ├── authorize.py           # ← operations/authorize.py
│   │   │   ├── refresh_token.py       # ← operations/refresh_token.py
│   │   │   ├── apply_vacancies.py     # ← operations/apply_vacancies.py
│   │   │   └── utils/
│   │   │       ├── string.py          # ← utils/string.py (rand_text, strip_tags)
│   │   │       └── json.py            # ← utils/json.py
│   │   │
│   │   ├── schemas/                   # Pydantic request/response models
│   │   │   ├── __init__.py
│   │   │   ├── auth.py                # HHConnectRequest, TokenResponse
│   │   │   ├── filters.py             # FilterCreate, FilterUpdate, FilterResponse
│   │   │   ├── applications.py        # ApplicationResponse, ApplicationStatus
│   │   │   ├── vacancies.py           # VacancySearchParams, VacancyResponse
│   │   │   └── billing.py             # CloudPaymentsWebhookPayload
│   │   │
│   │   ├── services/                  # Бизнес-логика
│   │   │   ├── __init__.py
│   │   │   ├── hh_auth.py             # mobile OAuth + Fernet encrypt/decrypt
│   │   │   ├── resume_sync.py         # /resumes/mine → Supabase
│   │   │   ├── vacancy_search.py      # поиск + Redis cache
│   │   │   ├── cover_letter.py        # GPT-4o-mini + cache по (vacancy_id, resume_id)
│   │   │   ├── apply.py               # один отклик: filter → letter → POST /negotiations
│   │   │   ├── blacklist.py           # проверка + auto-blacklist
│   │   │   ├── notifications.py       # создание записей в notifications table
│   │   │   └── billing.py             # HMAC verify + idempotency + plan activate
│   │   │
│   │   ├── worker/
│   │   │   ├── __init__.py
│   │   │   ├── queue.py               # asyncio.Queue singleton
│   │   │   ├── runner.py              # TaskGroup worker loop
│   │   │   ├── throttle.py            # log-normal delays + кластеры сессий
│   │   │   ├── limiter.py             # 150/day, 20/hour counter
│   │   │   └── cron.py                # token refresh cron (14-day)
│   │   │
│   │   ├── notifications/             # опциональный TG push
│   │   │   ├── __init__.py
│   │   │   └── telegram.py            # aiogram 3.x polling bot
│   │   │
│   │   ├── ai/
│   │   │   ├── __init__.py
│   │   │   └── openai.py              # ← ai/base.py + ai/openai.py (ChatOpenAI)
│   │   │
│   │   └── db/
│   │       ├── __init__.py
│   │       └── supabase.py            # service_role client + anon client
│   │
│   ├── worker_main.py                 # entrypoint для systemd (запускает runner.py)
│   │
│   ├── tests/
│   │   ├── conftest.py                # fixtures: supabase mock, hh client mock
│   │   ├── test_hh_auth.py
│   │   ├── test_apply.py
│   │   ├── test_throttle.py
│   │   ├── test_blacklist.py
│   │   └── test_billing_webhook.py
│   │
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/                       # Next.js 15 App Router
│   │   │   ├── layout.tsx
│   │   │   ├── global.css             # Tailwind base + shadcn CSS vars
│   │   │   ├── page.tsx               # / лендинг
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── signup/page.tsx
│   │   │   │   └── callback/route.ts  # Supabase Google OAuth callback (ОБЯЗАТЕЛЬНО)
│   │   │   ├── onboarding/page.tsx    # подключить hh
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── filters/page.tsx
│   │   │   ├── applications/page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   └── settings/page.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui (auto-generated)
│   │   │   ├── dashboard/
│   │   │   │   ├── StatsCard.tsx
│   │   │   │   ├── ApplicationsFeed.tsx
│   │   │   │   └── WorkerStatus.tsx
│   │   │   ├── filters/
│   │   │   │   ├── FilterForm.tsx
│   │   │   │   └── ResumeSelector.tsx
│   │   │   ├── captcha/
│   │   │   │   └── CaptchaModal.tsx   # Plan B: redirect new tab
│   │   │   └── billing/
│   │   │       └── CloudPaymentsWidget.tsx
│   │   │
│   │   ├── hooks/                     # TanStack Query hooks
│   │   │   ├── useApplications.ts
│   │   │   ├── useFilters.ts
│   │   │   ├── useResumes.ts
│   │   │   ├── useWorker.ts
│   │   │   └── useNotifications.ts    # Supabase Realtime подписка
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts          # browser client
│   │   │   │   ├── server.ts          # SSR client (@supabase/ssr)
│   │   │   │   └── middleware.ts
│   │   │   ├── api.ts                 # fetch-wrapper к FastAPI
│   │   │   └── realtime.ts            # Supabase Realtime подписки
│   │   │
│   │   └── types/
│   │       └── index.ts               # Application, Resume, Filter, Notification, etc.
│   │
│   ├── public/
│   ├── middleware.ts                  # Supabase auth middleware
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── infra/
│   ├── nginx.conf                     # reverse proxy Contabo VPS
│   ├── worker.service                 # systemd unit для asyncio worker
│   ├── docker-compose.yml             # local dev: Redis + backend
│   └── supabase/
│       └── migrations/
│           ├── 001_init.sql           # CREATE TABLE + RLS политики
│           └── 002_indexes.sql        # индексы (user_id, date, vacancy_id)
│
├── hh-applicant-tool/                 # git submodule (только reference)
├── MVP_PLAN.md
├── FILE_STRUCTURE.md
├── .gitignore
└── README.md
```

## Ключевые решения

| Что | Почему |
|---|---|
| `backend/app/hh/` — копия, не submodule | Нужна модификация (убрать CLI, адаптировать к async) |
| `worker/` внутри app | Запускается как отдельный процесс через systemd, но shared code с FastAPI |
| `infra/supabase/migrations/` | SQL миграции в git — воспроизводимый Supabase setup |
| `(auth)/` группа маршрутов | Next.js route group — не влияет на URL, общий layout |
