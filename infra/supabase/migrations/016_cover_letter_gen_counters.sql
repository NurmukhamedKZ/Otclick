-- 016_cover_letter_gen_counters.sql
-- Per-user daily counter for free manual cover-letter generations (5/day cap).
-- Pro users (plan.has_access) are not counted. Cache hits are not counted.

create table if not exists cover_letter_gen_counters (
  user_id uuid references profiles(id) on delete cascade,
  date date not null,
  count int default 0,
  primary key (user_id, date)
);

alter table cover_letter_gen_counters enable row level security;
-- no policies = full RLS denial (service_role only; matches apply_counters)
