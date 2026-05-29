-- 015_relevance_cache.sql
-- AI vacancy relevance verdicts cache + per-filter toggle.

create table if not exists relevance_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  resume_id uuid references resumes(id) on delete cascade,
  vacancy_id text not null,
  relevant bool not null,
  reason text,
  created_at timestamptz default now(),
  unique (resume_id, vacancy_id)
);

create index if not exists relevance_cache_lookup
  on relevance_cache (resume_id, vacancy_id);

alter table relevance_cache enable row level security;
-- service_role only; no policies = full RLS denial (matches form_drafts).

alter table filters add column if not exists ai_filter_enabled bool default true;
