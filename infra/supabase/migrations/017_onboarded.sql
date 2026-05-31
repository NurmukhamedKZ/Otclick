-- 017_onboarded.sql
-- Track whether the user has completed the dashboard onboarding flow.
-- Read/written client-side via the existing profiles RLS (user reads/writes own row).

alter table profiles
  add column if not exists onboarded boolean not null default false;
