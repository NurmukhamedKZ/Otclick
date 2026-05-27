-- Persisted "user pressed Start" intent for the auto-apply worker.
-- The standalone worker container (worker_main.py) polls this flag and starts/
-- stops a runner per user. Dashboard Start/Stop just flips the flag — no more
-- auto-applying for every connected user at container boot.

alter table profiles
    add column if not exists worker_enabled boolean not null default false;
