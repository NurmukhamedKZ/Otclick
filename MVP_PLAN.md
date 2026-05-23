# MVP автокликер для hh.kz/hh.ru — Web версия

> Обновлено после ревью. Mobile OAuth заменил Playwright-логин, asyncio вместо Celery, добавлены резюме, дневной лимит, антибан-сессии, защита webhook.
>
> **UPDATE Day 1 POC (2026-05-22):** Mobile OAuth password grant **НЕ работает** — hh отдаёт `unsupported_grant_type` на всех 3 проверенных client_id (ANDROID + закомменченный direct auth key из репо). Playwright **обязателен** на login, не опциональный fallback. POC `backend/poc_day1_playwright.py` подтвердил end-to-end: OAuth code → `access_token` (TTL 1209599s ≈ **14 дней**) + `refresh_token` → `GET /me` → `GET /resumes/mine`. Капча триггерится на первом логине с новым UA → handoff на юзера нужен с day 1.

## Что забираем из `hh-applicant-tool` (s3rgeym)

Копируем напрямую — не пишем заново:

| Откуда | Что | Зачем |
|---|---|---|
| `api/client.py` | HTTP-клиент `api.hh.ru` + retry + error mapping | Готовый wrapper |
| `api/client_keys.py` | `ANDROID_CLIENT_ID` + `ANDROID_CLIENT_SECRET` для обмена auth code на token | Без этих ключей `/oauth/token` не отдаст access |
| `operations/authorize.py` | **Playwright OAuth-флоу** (Galaxy A55 emulation → fill login/password → перехват `hhandroid://?code=...` → обмен на token) | Единственный рабочий способ login (password grant закрыт) |
| `operations/refresh_token.py` | Обновление access через refresh_token (TTL 14 дней) | Cron избегает повторного login + капчи |
| `api/user_agent.py` | Ротация мобильных UA | Антибан basic |
| `api/datatypes.py` | TypedDict для `SearchVacancy`, `Resume`, `Employer` | Типизация даром |
| `operations/apply_vacancies.py` | Фильтр-пайплайн (relations/archived/has_test), `_get_search_params`, `_is_excluded`, `_solve_vacancy_test` (парсинг + сабмит тестов hh) | Реверс-инжиниринг скрытых эндпоинтов hh |
| `operations/apply_vacancies.py` | `_solve_captcha_async` — селекторы капчи, поток cookies браузер→session | База для captcha handoff |
| `operations/reply_employers.py` | Авто-ответ HR через API сообщений | Для v2 |
| `ai/base.py` + `ai/openai.py` | `ChatOpenAI` с rate-limit, retry на 429, `AIError` | OpenAI-совместимый клиент |
| `utils/string.py` | `rand_text` (`{a|b}` синтаксис), `strip_tags`, `unescape_string` | Шаблоны писем |
| `utils/json.py` | `JSONDecoder.raw_decode` | Парс JSON из HTML hh |

AI-промпты light/heavy фильтра вакансий — уже отлажены, копируем как baseline.

## Core (без этого нет продукта)

### 1. Авторизация юзера
- **Supabase Auth** — email/password + Google OAuth
- **hh аккаунт: Playwright OAuth-флоу** (password grant закрыт — проверено в POC):
  - Headless Chromium + Galaxy A55 device emulation → `https://hh.ru/oauth/authorize?client_id=<ANDROID>&response_type=code`
  - Fill `input[name="username"]` → click `button[data-qa="expand-login-by-password"]` → fill `input[name="password"]` → Enter
  - Перехват redirect `hhandroid://oauthresponse?code=...` (в `page.on("request")`)
  - POST `https://hh.ru/oauth/token` с `grant_type=authorization_code` + ANDROID client_id/secret → `{access_token, refresh_token, expires_in: 1209599}`
- **Капча на login** реальна с первого входа на новом UA → handoff юзеру через UI (см. §7) **с дня 1**, не v2
- **Хранение токенов:** отдельная таблица `hh_credentials` с **полным denial RLS** (читает только service_role). Шифрование Fernet/AES. Пароль юзера НЕ сохраняем после первого обмена на token.
- **Refresh-токен hh живёт 14 дней** (подтверждено: `expires_in=1209599s`) → cron на ежедневный refresh всех активных юзеров; пока refresh живой — повторный login (+ капча) не нужен
- **Persist Playwright `storage_state`** (cookies + localStorage) в Supabase Storage per-user → next login через 14+ дней может пройти без капчи если сессия hh жива

### 2. Поиск вакансий
- `api.hh.ru/vacancies` через access_token юзера (берём `api/client.py`)
- Фильтры: `area` (40=KZ, 113=RU), `text`, `salary`, `experience`, `schedule`, `employment`, `professional_role`
- Pagination, Redis-кэш на 1 час по hash(filters)

### 3. Резюме юзера (новое — было дыркой)
- Sync `/resumes/mine` после OAuth
- Таблица `resumes` (id, user_id, hh_resume_id, title, status)
- В `filters` выбор какое резюме слать (по умолчанию все опубликованные)

### 4. Auto-apply engine
- **access_token → `POST /negotiations` напрямую** через `requests` (без браузера на отклик).
  - Payload: `{resume_id, vacancy_id, message}` → ответ `{}` со статусом 201
  - Headers: `Authorization: Bearer <USER...>`, `User-Agent: ru.hh.android/...`, `X-HH-App-Active: true`
- Playwright поднимается **только на onboarding** + **на капчу** (ленивый запуск, 1 контекст, закрытие сразу).
- **Throttle log-normal**, не uniform: задержка `lognorm(mean=8s, sigma=0.5)`, обрезана [3, 30s]
- **Кластеры сессий**: 15-30 откликов подряд → пауза 1-2h → следующий кластер. Не ровный шаг 8 часов.
- **Лимит:** 100-150/день hard cap (hh реальный лимит ~200, не упираемся)
- Счётчик в БД `apply_counters(user_id, date, count)` — синк с `LimitExceeded` из API
- Retry 1 раз при transient fail

### 5. Cover letter generator
- GPT-4o-mini через `ChatOpenAI` из репо
- Prompt: вакансия + резюме → письмо, RU/KZ авто-детект по `area`
- Кэш по `(vacancy_id, resume_id)` — не генерим дважды
- ~$0.001/штука

### 6. Очередь задач
- **asyncio.Queue + TaskGroup**, без Celery. Redis оставляем только для кэша вакансий.
- 1 background worker process на VPS, async tasks per user
- Job: `(user_id, resume_id, vacancy_id) → apply`
- Statuses: queued / sent / failed / captcha / skipped
- Retry policy: 1 retry при network/5xx, 0 retry при 4xx
- Celery вернёмся к v2 если >50 активных юзеров

### 7. Captcha handoff (web)
- **Проверить на день 1: `X-Frame-Options` от hh.** Если DENY → iframe не работает.
- План A: iframe hh.ru в модалке
- **План B (default):** redirect new tab → юзер решает на hh → worker poll'ит `/me` каждые 5с → как только запрос проходит, помечает `solved`
- Detect капчи → screenshot в Supabase Storage → запись в `captcha_requests` → Realtime push в UI
- Запасной канал: email + TG (если привязан)

### 8. Web UI

**Стек фронт**:
- Next.js 15 (App Router) + TypeScript
- Tailwind + shadcn/ui
- TanStack Query для API
- **Supabase SSR** (`@supabase/ssr`) — auth + данные

**Страницы**:
- `/` — лендинг (фичи, цена, CTA)
- `/signup` `/login` — Supabase Auth (email + Google OAuth)
- `/onboarding` — подключить hh аккаунт (форма логин/пароль → mobile OAuth)
- `/dashboard` — счётчик откликов, статус worker, последние 10 откликов, дневной лимит
- `/filters` — критерии поиска + выбор резюме + blacklist
- `/applications` — таблица всех откликов
- `/billing` — тариф, trial, история
- `/settings` — переподключить hh, TG-привязка, смена пароля, удаление аккаунта

**Real-time**:
- **Supabase Realtime** (Postgres Changes на `applications`, `captcha_requests`, `notifications`)
- Fallback polling 5с

### 9. Биллинг
- **CloudPayments** (KZ+RU нативный, виджет JS на фронт)
- 1 тариф: 999₽/мес (или ~5000₸)
- 7-дневный trial без CC
- **Webhook hardening:** HMAC signature check (`Content-HMAC` header) + idempotency key (`provider_payment_id` UNIQUE в БД) — двойной webhook не активирует двойной trial
- Рекуррентные платежи через CloudPayments subscriptions API
- Customer portal — **не делаем в MVP**, отмена через support вручную (первые ~20 платежей)

## Безопасность аккаунта (не опционально)

### 10. Rate limiting
- ≤150 откликов/день per юзер
- ≤20 откликов/час
- Не работать ночью локального времени юзера (`profiles.timezone`)
- **Log-normal задержки + кластеры сессий** (см. §4)

### 11. Human-like behavior
- Log-normal задержки 3-30с
- Не отвечать на одну компанию дважды (auto-blacklist по `employer_id`)
- При капче — кластер прерывается, длинная пауза

### 12. Blacklist
- Юзер задаёт список компаний → skip
- Auto-blacklist если уже откликался (из `relations` API)
- Excluded-filter regex по name+description (берём из `_is_excluded` репо)

## БД — Supabase (Postgres + Realtime + Auth)

### Структура (RLS включён на всё)

```sql
-- Управляется Supabase Auth: auth.users

profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text DEFAULT 'trial',
  trial_ends timestamptz,
  timezone text DEFAULT 'Asia/Almaty',
  tg_chat_id bigint,
  created_at timestamptz DEFAULT now()
);

-- Отдельная таблица: RLS = полный DENY для всех, читает ТОЛЬКО service_role
hh_credentials (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  access_token_encrypted text,    -- Fernet
  refresh_token_encrypted text,   -- Fernet
  expires_at timestamptz,
  hh_user_id text,
  last_refreshed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hh_resume_id text NOT NULL,
  title text,
  status text,                    -- published / not_published
  synced_at timestamptz,
  UNIQUE(user_id, hh_resume_id)
);

filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id) ON DELETE CASCADE,
  text text,
  area int,                       -- 40=KZ, 113=RU
  salary_min int,
  experience text,
  schedule text,
  employment text,
  professional_role int[],
  excluded_regex text,            -- из _is_excluded репо
  enabled bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id),
  vacancy_id text NOT NULL,
  employer_id text,
  status text DEFAULT 'queued',   -- queued / sent / failed / captcha / skipped
  cover_letter text,
  applied_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, vacancy_id)
);

apply_counters (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  date date,
  count int DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  employer_id text NOT NULL,
  employer_name text,
  reason text,                    -- manual / auto_already_applied
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, employer_id)
);

payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  provider_payment_id text UNIQUE NOT NULL,  -- идемпотентность webhook
  amount int,
  provider text DEFAULT 'cloudpayments',
  status text DEFAULT 'pending',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

captcha_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text,
  captcha_url text,
  solved bool DEFAULT false,
  created_at timestamptz DEFAULT now(),
  solved_at timestamptz
);

notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text,                      -- apply_success / captcha / worker_stop / limit_reached
  payload jsonb,
  read bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Кэш найденных вакансий (Redis fallback для аналитики)
vacancy_cache (
  vacancy_id text PRIMARY KEY,
  payload jsonb,
  fetched_at timestamptz DEFAULT now()
);
```

### Политики RLS
- `profiles`: `auth.uid() = id` — read/write
- `hh_credentials`: **DENY ALL для anon+authenticated**, только service_role
- `resumes`, `filters`, `applications`, `blacklist`, `payments`, `captcha_requests`, `notifications`: `auth.uid() = user_id` read; write — через service_role (бэкенд)
- `apply_counters`, `vacancy_cache`: service_role only

## API endpoints (FastAPI)

**Auth:** все защищённые роуты — `Authorization: Bearer <supabase_jwt>`. Middleware валидирует JWT через Supabase JWKS, кладёт `user_id` в request.

**Принцип разделения:**
- **Бэк (service_role)** — всё что меняет данные + всё что требует hh API (Playwright, токены, отклики)
- **Фронт напрямую в Supabase (anon/authenticated)** — read-only списков с RLS `auth.uid() = user_id` (notifications, applications, resumes, filters, blacklist) + Realtime подписки

### Auth & onboarding hh

| Method | Path | Описание |
|---|---|---|
| `POST` | `/api/hh/connect` | Body: `{username, password}`. Запускает Playwright onboarding job → `{job_id, status: "running"}`. Пароль НЕ сохраняем. |
| `GET` | `/api/hh/connect/{job_id}` | Poll: `running / captcha_required / success / failed`. При `captcha_required` → `{captcha_url, captcha_image_url}`. |
| `POST` | `/api/hh/connect/{job_id}/captcha` | Body: `{solution}`. Отправляет решение в Playwright-сессию. |
| `POST` | `/api/hh/disconnect` | Стереть `hh_credentials`, остановить worker. |
| `POST` | `/api/hh/refresh` | Принудительный refresh access_token. |
| `GET` | `/api/hh/status` | `{connected, expires_at, last_refreshed_at}`. |

### Резюме

| Method | Path | Описание |
|---|---|---|
| `POST` | `/api/resumes/sync` | `GET /resumes/mine` на hh → upsert в `resumes`. |
| `GET` | `/api/resumes` | Список из БД (можно читать напрямую из Supabase). |

### Фильтры

| Method | Path | Описание |
|---|---|---|
| `GET` | `/api/filters` | Список. |
| `POST` | `/api/filters` | Body: `{resume_id, text, area, salary_min, experience, schedule, employment, professional_role, excluded_regex}`. |
| `PATCH` | `/api/filters/{id}` | Обновить (включая `enabled`). |
| `DELETE` | `/api/filters/{id}` | |
| `GET` | `/api/filters/{id}/preview` | Прогнать поиск без сохранения → `{found, items: top-20}`. |

### Worker (auto-apply)

| Method | Path | Описание |
|---|---|---|
| `POST` | `/api/worker/start` | Запустить async-таск для юзера. |
| `POST` | `/api/worker/stop` | Остановить. |
| `GET` | `/api/worker/status` | `{state: running/stopped/paused_captcha/paused_limit, today_count, daily_limit, next_run_at}`. |

### Отклики

| Method | Path | Описание |
|---|---|---|
| `GET` | `/api/applications` | Query: `status, from, to, employer_id, page`. Пагинация. (Realtime → Supabase напрямую.) |
| `GET` | `/api/applications/{id}` | Детали. |
| `POST` | `/api/applications/{id}/retry` | Повторить failed. |

### Blacklist

| Method | Path | Описание |
|---|---|---|
| `GET` | `/api/blacklist` | |
| `POST` | `/api/blacklist` | Body: `{employer_id, employer_name?, reason?}`. |
| `DELETE` | `/api/blacklist/{id}` | |

### Captcha handoff

| Method | Path | Описание |
|---|---|---|
| `GET` | `/api/captcha/pending` | Активные `captcha_requests` (fallback если Realtime упал). |
| `POST` | `/api/captcha/{id}/solve` | Body: `{solution}`. |
| `POST` | `/api/captcha/{id}/dismiss` | Юзер закрыл → worker `paused`. |

### Биллинг

| Method | Path | Описание |
|---|---|---|
| `POST` | `/api/billing/subscribe` | Создать подписку → данные для CP widget. |
| `POST` | `/api/billing/cancel` | Отмена. |
| `GET` | `/api/billing/status` | `{plan, trial_ends, next_charge_at, history}`. |
| `POST` | `/api/webhooks/cloudpayments` | **PUBLIC**. HMAC check (`Content-HMAC`) + idempotency по `provider_payment_id`. |

### Профиль / settings

| Method | Path | Описание |
|---|---|---|
| `GET` | `/api/profile` | `{plan, trial_ends, timezone, tg_chat_id, hh_connected}`. |
| `PATCH` | `/api/profile` | Body: `{timezone?, daily_limit?}`. |
| `POST` | `/api/profile/telegram/link` | → `{deep_link: "tg://...?start=<token>"}`. |
| `DELETE` | `/api/profile/telegram` | Отвязать TG. |
| `DELETE` | `/api/profile` | Удалить аккаунт (cascade: токены, отклики, всё). |

### Notifications

| Method | Path | Описание |
|---|---|---|
| `GET` | `/api/notifications?unread=true` | Fallback если Realtime упал. |
| `POST` | `/api/notifications/{id}/read` | |

### Internal (cron / webhooks)

| Method | Path | Описание |
|---|---|---|
| `POST` | `/internal/cron/refresh-tokens` | Ежедневный refresh всех `hh_credentials`. Auth: header `X-Internal-Token`. |
| `POST` | `/internal/cron/reset-counters` | В 00:00 локального TZ юзера обнулить `apply_counters`. |
| `POST` | `/internal/tg/webhook` | Telegram webhook (v2, MVP — polling). |

### Health

| Method | Path | Описание |
|---|---|---|
| `GET` | `/health` | `{status, db, redis, hh_reachable}` |

**Итого ~35 endpoints.** Все защищённые роуты используют service_role для записи в БД (RLS deny-all для anon/authenticated на write-таблицах).

## Полный стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 15 + TS + Tailwind + shadcn |
| Auth юзеров | **Supabase Auth** (email + Google OAuth) |
| Auth hh | **Playwright OAuth** (Galaxy A55 emulation, перехват `hhandroid://` redirect, обмен code → token) |
| Backend API | FastAPI |
| Worker | asyncio + TaskGroup, **Playwright только на капчу** |
| DB | **Supabase Postgres** |
| Cache | Redis (кэш вакансий, locks) |
| Queue | asyncio.Queue (Celery — v2) |
| Real-time | **Supabase Realtime** (Postgres Changes) |
| Storage | **Supabase Storage** (скрины капчи) |
| Биллинг | **CloudPayments** (KZ+RU) |
| AI | OpenAI gpt-4o-mini через `ChatOpenAI` из репо |
| Хостинг фронт | Vercel (free tier) |
| Хостинг бэк | **Contabo VPS** (€5.99/мес — 4 vCPU, 8GB, 200GB SSD) |
| Мониторинг | логи в файл + journald на MVP; Sentry перед публичным запуском |
| Аналитика | Plausible (после запуска) |

### Расчёт памяти
Playwright поднимается на **onboarding** (раз в 14 дней per юзер при истечении refresh_token) + **на капчу** (handoff редкий). В остальное время worker = чистый async + `requests` → no browser. 8GB VPS держит сотни одновременных async-юзеров. Браузер ~300MB только в момент login/капчи, закрывается сразу.

**Пиковая нагрузка:** N новых юзеров onboarding одновременно → N браузеров. На 8GB лимит ~20 параллельных Playwright-сессий. Решение: очередь onboarding'а с concurrency=5.

## Что НЕ делать в MVP

- ❌ Fit-score (v2)
- ❌ Interview prep
- ❌ Resume builder
- ❌ TG bot UI (только notifications опционально)
- ❌ Множественные тарифы
- ❌ Test-answers AI (есть `_solve_vacancy_test` в репо — можно включить, но скрыть за флагом)
- ❌ HR chat auto-reply (v2 — есть `reply_employers.py`)
- ❌ Referral
- ❌ Multi-account на юзера
- ❌ Customer portal биллинга (вручную через support)
- ❌ Sentry в день 1 (логи в файл достаточно)

## Порядок постройки (реалистично 25-30 дней)

| День | Задача |
|---|---|
| 1 | ✅ **DONE** — POC `backend/poc_day1_playwright.py`. Mobile OAuth password grant мёртв → Playwright-флоу подтверждён end-to-end (OAuth code → access_token → `/me` → `/resumes/mine`). POST `/negotiations` верифицируется юзером вручную через `--apply --vacancy-id <id>`. |
| 2 | ✅ **DONE** — Проверка `X-Frame-Options` hh для iframe-капчи. План A/B на handoff. + актуализация селекторов login form (Magritte UI: `input[name="username"]`, `button[data-qa="expand-login-by-password"]`, `input[name="password"]`). |
| 3 | ✅ **DONE** — Supabase проект `Otclick` (eu-central-1, org: Nureke). Миграции `001_init` + `002_indexes` применены через MCP. 11 таблиц + RLS + auth trigger + Realtime. `hh_credentials` DENY ALL (0 политик). Storage bucket `captcha-screenshots` (private) + SELECT policy per-user. Smoke test: все 11 таблиц OK, Fernet OK. |
| 4 | ✅ **DONE** — FastAPI скелет: `app/config.py` (pydantic-settings + Fernet), `app/hh/` (ApiClient, OAuthClient, errors, user_agent, datatypes — адаптировано из hh-applicant-tool; `authorize.py` — адаптировано из POC с актуальными селекторами Magritte UI), `app/services/hh_auth.py` (in-memory job manager, Fernet encrypt/decrypt, Supabase write), `app/api/deps.py` (Supabase JWT → user_id), `app/api/auth.py` (5 эндпоинтов: POST /connect, GET /connect/{id}, POST /connect/{id}/captcha, POST /disconnect, GET /status). Исправлено по code review: sync calls → `run_in_executor`, captcha timeout 300 s, validate access_token not None, signed URL guard. 3 теста green. |
| 5 | ✅ **DONE** — Resume sync + filters CRUD. `app/services/hh_credentials.py` (decrypt токенов → ApiClient, TZ-defensive `expires_at` parsing, persist при auto-refresh). `app/services/resume_sync.py` (`GET /resumes/mine` → upsert + cleanup пропавших резюме через `NOT IN seen_ids`). `app/services/filters_service.py` (CRUD + `_filter_to_search_params` → hh `/vacancies` params + preview с применением `excluded_regex` клиент-сайд по name/employer/snippet). `app/schemas/{resumes,filters}.py`, `app/api/{resumes,filters}.py`. 7 новых endpoints: `POST /api/resumes/sync`, `GET /api/resumes`, `GET/POST /api/filters`, `PATCH/DELETE /api/filters/{id}`, `GET /api/filters/{id}/preview`. Sync supabase calls обёрнуты в `loop.run_in_executor`. Resume ownership проверяется перед привязкой к фильтру. 17 тестов green (CRUD + edge cases + regex). |
| 6-7 | ✅ **DONE** — Next.js 16 + TS + Tailwind 4 + App Router в `frontend/`. `@supabase/ssr` + `@supabase/supabase-js`. `src/lib/supabase/{client,server,middleware}.ts` (browser/SSR/proxy). `proxy.ts` (Next 16 renamed `middleware` → `proxy`) — refresh session + guard `/dashboard` + redirect авторизованных с `/login|/signup`. Страницы: `/` landing, `/(auth)/login`, `/(auth)/signup` (email/password + Google OAuth), `/auth/callback` (code exchange), `/dashboard` (protected + sign out + debug access_token `<details>`). `.env.local.example` с `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/API_URL`. Build green: 6 routes, 0 errors. Минимальный дизайн (голые формы, дефолтный Tailwind) — стилизация v2. Юзер настраивает: Supabase Dashboard Redirect URLs `http://localhost:3000/auth/callback` + Site URL `http://localhost:3000` + Google OAuth provider; Google Cloud Console Authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`. |
| 8 | ✅ **DONE** — `/onboarding` page. Backend: `CORSMiddleware` с `settings.cors_origins_list` (env `CORS_ORIGINS`, comma-separated, default `http://localhost:3000`). Frontend: `src/lib/api.ts` (`apiFetch` с auto `Authorization: Bearer <supabase_jwt>`, `ApiError`), `src/hooks/useHHConnect.ts` (state machine: `idle/running/captcha_required/success/failed` + poll 2s + `start`/`submitCaptcha`/`reset`, cleanup interval on unmount), `src/app/onboarding/page.tsx` (status check on mount → already connected branch с Disconnect; форма login/password → phase render: spinner / captcha img + input / success → redirect `/dashboard` 1.5s / failed + retry), `src/app/dashboard/hh-status-banner.tsx` + интеграция в dashboard (жёлтый "Подключить" / зелёный "подключён"), `proxy.ts` middleware guard расширен на `/onboarding`. Playwright-флоу (mobile OAuth password grant мёртв — используется headless Chromium с Galaxy A55 emulation). Type-check green. |
| 9 | ✅ **DONE** — `/dashboard` + `/filters` UI. `src/lib/types.ts` (Resume, Filter, FilterCreate, FilterPreview, VacancyPreviewItem). `proxy.ts` guard расширен на `/filters`. Dashboard: header + nav-кнопка "Фильтры" + `ResumesCard` (`GET /api/resumes` on mount, `POST /api/resumes/sync` по кнопке, список title/status). `/filters`: `useFilters` хук (CRUD + preview через `apiFetch`), `FilterForm` (text, resume select, area KZ/RU, salary_min, experience, schedule, employment, excluded_regex — все enum-селекты статичные), `FilterRow` (tags inline + toggle `enabled` checkbox → PATCH, delete с confirm, Preview-кнопка → top-20 вакансий с salary fmt + ссылка на hh). `globals.css`: дроп `prefers-color-scheme: dark` override + `color-scheme: light` lock (формы были невидимы в dark OS). Дизайн минимальный (белые карточки, серые бордеры, чёрная primary) — стилизация v2. Type-check green. |
| 10 | ✅ **DONE** — Auto-apply worker — фундамент. **10.1** `app/worker/queue.py` — `asyncio.Queue` singleton + job dataclass `{user_id, resume_id, vacancy_id, filter_id}`. **10.2** `app/worker/throttle.py` — log-normal задержка `lognorm(mean=8, sigma=0.5)` clamp [3, 30s] + кластер сессий (15-30 откликов → пауза 1-2h). **10.3** `app/worker/limiter.py` — `apply_counters` read/increment, 150/day + 20/hour cap, TZ из `profiles.timezone`, returns `allowed / limit_day / limit_hour`. **10.4** `app/services/apply.py` — `apply_one(user_id, resume_id, vacancy_id) → status`: load creds → POST `/negotiations` → `persist_if_refreshed` → запись в `applications` (sent/failed/captcha) → auto-blacklist по 4xx "already applied". Cover letter — статичная заглушка (реальный день 13). |
| 11 | ✅ **DONE** — Auto-apply worker runner + API. **11.1** `app/worker/runner.py` — `RunnerHandle` (state/today_count/next_run_at/captcha_event/cluster/last_error) + `_run_loop`: captcha pause (`captcha_event.wait()`) → `limiter.check` (limit_day → sleep до локальной полуночи; limit_hour → 1h cooldown) → empty queue → `produce_jobs` refill → `SessionCluster` break → `queue.get(timeout=30)` → `throttle.next_delay` → `_maybe_apply_with_retry` (1 retry на `InternalServerError`/`BadGateway`/`requests.ConnectionError`/`Timeout`, 0 на `ClientError`). State machine `running / paused_captcha / paused_limit / stopped`. `WorkerRegistry` singleton с `start/stop/get/resume_captcha/stop_all`. **11.2** `app/services/vacancy_producer.py` — `produce_jobs(user_id)`: enabled filters → hh `/vacancies` per_page=50 → batch dedup через `applications.vacancy_id IN (…)` + `blacklist.employer_id IN (…)` + клиент-сайд `excluded_regex` → push `ApplyJob` в per-user queue с cap `MAX_PUSH_PER_RUN=100`. `persist_if_refreshed` уважается. **11.3** `app/api/worker.py` — `POST /api/worker/start` (idempotent spawn), `POST /api/worker/stop` (cancel + `drop_user_queue`), `GET /api/worker/status` (`state, today_count, daily_limit, queued, next_run_at, last_error`). `worker/queue.py` рефакторнут singleton → per-user (`get_user_queue` / `drop_user_queue`). |
| 12 | ✅ **DONE** — Worker hardening + entrypoint + тесты. **12.1** `backend/worker_main.py` для systemd: грузит `hh_credentials WHERE invalid_at IS NULL` → spawn runner per user; `SIGTERM/SIGINT` → `stop_all()` (cancel + drain queues). **12.2** Edge cases в `services/apply.py`: `LimitExceeded` → `"limit_day"`, runner синкает локальный счётчик через сон до полуночи; `Forbidden` → `mark_invalid(hh_credentials)` + `"token_dead"`; `HHCredentialsInvalid` при `load_api_client` → ранний `"token_dead"`; resume отсутствует → `"resume_missing"`. Миграция `003_hh_credentials_invalid.sql` (`invalid_at`, `invalid_reason`). Новый `services/hh_credentials.HHCredentialsInvalid` + `mark_invalid()`. **12.3** Тесты: `test_throttle.py` (log-normal bounds + clamp + cluster target/break range), `test_limiter.py` (TZ default/fallback + day/hour caps + increment), `test_apply.py` (sent/captcha/limit_day/token_dead двумя путями/resume_missing/already_applied/failed), `test_runner.py` (retry once on transient, no retry on 4xx, transient classification, registry start/stop/resume_captcha). 24 новых теста, всего 41 green. **12.4** `services/notifications.notify()` (insert в `notifications` через `run_in_executor`). Runner шлёт `apply_success` / `captcha` / `limit_reached` (источник `local_day` или `hh`) / `token_dead` / `worker_stop` / `resume_missing`. Realtime-подхват UI — день 14. |
| 13 | Cover letter generator + кэш (берём `ChatOpenAI` из репо) |
| 14 | Supabase Realtime подписки в UI |
| 15-16 | Captcha handoff (план B: new tab + poll) + Supabase Storage + screenshot detection |
| 17 | Refresh-token cron (14 дней — критично) |
| 18 | Blacklist + auto-blacklist по `relations` + excluded-regex (из `_is_excluded`) |
| 19 | **CloudPayments** интеграция + webhook HMAC + idempotency |
| 20 | Trial логика + plan gating |
| 21 | `/applications` page + поиск/фильтры |
| 22 | TG notifications (опц.) — простой bot для push |
| 23 | Edge cases: токен умер, hh лимит, аккаунт забанен, резюме удалено |
| 24 | Deploy: Vercel + Contabo + домен + nginx + systemd для worker |
| 25-27 | Beta тест 3 юзера + фиксы |
| 28-30 | Запас на блокеры (всегда есть) |

## Опционально (гибрид web + TG)

- TG bot **только для уведомлений**, не UI:
  - Юзер привязывает TG chat_id в `/settings`
  - Push: «новый отклик», «captcha нужна», «worker остановлен», «лимит дня»
- aiogram 3.x, polling (без webhook на MVP)

## Критерий «MVP готов»

3 юзера независимо: signup → Google OAuth ИЛИ email → connect hh (mobile OAuth) → выбор резюме → set filters → start → получают 50 откликов/день → видят real-time updates в dashboard → платят через CloudPayments. Без банов hh за 7 дней непрерывной работы. После этого — Habr-статья и публичный запуск.

## Риски (что может убить продукт)

1. ~~**hh закроет mobile OAuth**~~ — **уже закрыт** (password grant отдаёт `unsupported_grant_type` 2026-05). Playwright-флоу — единственный путь. Риск теперь: hh сменит селекторы login form (Magritte) → автоматизация ломается. Митигация: `name="..."` атрибуты вместо `data-qa`, мониторинг ошибок onboarding.
2. **Капча на login** — триггерится с первого входа на новом UA (подтверждено в POC). Если на каждый отклик → продукт неюзабелен → нужен антибан на стероидах (residential proxy per-user, $$$). Митигация day 1: persist `storage_state` Playwright → reuse сессии 14 дней.
3. **Бан аккаунтов** — юзеры теряют hh-аккаунт → репутационный risk → обязательно log-normal + кластеры с первого дня
4. **iframe заблокирован** (`X-Frame-Options: DENY`) — план B (new tab + poll) обязателен. Проверить день 2.
5. **CloudPayments отклонит юр-лицо** (автоклик = серая зона) → готовь второй PSP (ЮKassa/Kaspi) резервом
6. **hh поменяет селекторы login form** — Magritte UI уже отличается от того что в `authorize.py` репо (`data-qa="login-input-username"` → `data-qa="applicant-login-input-email"` параллельно существуют). Стратегия: `input[name="username"]` / `input[name="password"]` стабильнее.

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
