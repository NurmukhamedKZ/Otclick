-- Worker heartbeat: standalone worker container writes runtime status here,
-- the API reads it for /api/worker/status. service_role only.

create table if not exists worker_runtime (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'stopped',
  queued int not null default 0,
  today_count int not null default 0,
  next_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table worker_runtime enable row level security;
