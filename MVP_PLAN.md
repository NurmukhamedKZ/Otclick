# MVP автокликер для hh.kz/hh.ru — Web версия

> Обновлено после ревью. Mobile OAuth заменил Playwright-логин, asyncio вместо Celery, добавлены резюме, дневной лимит, антибан-сессии, защита webhook.

## Что забираем из `hh-applicant-tool` (s3rgeym)

Копируем напрямую — не пишем заново:

| Откуда | Что | Зачем |
|---|---|---|
| `api/client.py` | HTTP-клиент `api.hh.ru` + retry + error mapping | Готовый wrapper |
| `api/client_keys.py` + `operations/authorize.py` + `operations/refresh_token.py` | **Mobile OAuth (логин/пароль → access_token)** | Убирает Playwright из логина |
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
- **hh аккаунт: mobile OAuth (s3rgeym)** — логин/пароль → `POST oauth/token` mobile client_id → `access_token` + `refresh_token`. Без Playwright, без cookies.
- **Хранение токенов:** отдельная таблица `hh_credentials` с **полным denial RLS** (читает только service_role). Шифрование Fernet/AES. Пароль юзера НЕ сохраняем после первого обмена на токен.
- Refresh-токен hh живёт ~14 дней → cron на ежедневный refresh всех активных юзеров.

### 2. Поиск вакансий
- `api.hh.ru/vacancies` через access_token юзера (берём `api/client.py`)
- Фильтры: `area` (40=KZ, 113=RU), `text`, `salary`, `experience`, `schedule`, `employment`, `professional_role`
- Pagination, Redis-кэш на 1 час по hash(filters)

### 3. Резюме юзера (новое — было дыркой)
- Sync `/resumes/mine` после OAuth
- Таблица `resumes` (id, user_id, hh_resume_id, title, status)
- В `filters` выбор какое резюме слать (по умолчанию все опубликованные)

### 4. Auto-apply engine
- **Mobile OAuth → `POST /negotiations` напрямую**. Без браузера в норме.
- Playwright **только на капчу** (ленивый запуск).
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

## Полный стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 15 + TS + Tailwind + shadcn |
| Auth юзеров | **Supabase Auth** (email + Google OAuth) |
| Auth hh | **Mobile OAuth** (s3rgeym, без Playwright) |
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
Mobile OAuth = no browser в норме. Playwright поднимается лениво на капчу, 1 контекст, закрывается сразу. 8GB VPS держит сотни одновременных async-юзеров. Браузер ~300MB только в момент решения капчи.

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
| 1 | **Mobile OAuth POC**: логин/пароль hh → access_token → `POST /negotiations` → 201. Если не работает — fallback на Playwright. |
| 2 | Проверка `X-Frame-Options` hh для iframe. План A/B на капчу. |
| 3 | **Supabase**: проект, таблицы, RLS, Storage bucket. `hh_credentials` DENY ALL. |
| 4 | FastAPI скелет + Service Role Key + интеграция кода из репо (`api/client.py`, authorize) |
| 5 | Resume sync + filters CRUD endpoints |
| 6-7 | Next.js init + Supabase SSR + лендинг + signup/login (email + Google) |
| 8 | `/onboarding` — форма логин/пароль hh → mobile OAuth → сохранение токенов |
| 9 | `/dashboard` + `/filters` UI |
| 10-12 | Auto-apply worker: asyncio.Queue + log-normal throttle + кластеры сессий + дневной счётчик + retry |
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

1. **hh закроет mobile OAuth** — fallback на Playwright-логин (медленнее, дороже по RAM)
2. **Капча на каждом 5-м отклике** — продукт неюзабелен → нужен антибан на стероидах (residential proxy per-user, $$$)
3. **Бан аккаунтов** — юзеры теряют hh-аккаунт → репутационный risk → обязательно log-normal + кластеры с первого дня
4. **iframe заблокирован** — план B (new tab) обязателен
5. **CloudPayments отклонит юр-лицо** (автоклик = серая зона) → готовь второй PSP (ЮKassa/Kaspi) резервом
