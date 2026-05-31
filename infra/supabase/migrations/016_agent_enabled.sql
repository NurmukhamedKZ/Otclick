-- Persisted "user pressed Start" intent for the AI recruiter agent, split from
-- the auto-apply worker flag (011_worker_enabled). The standalone worker polls
-- both flags and runs the apply loop and the recruiter loop independently, so a
-- user can run the AI agent without auto-apply (or vice versa).

alter table profiles
    add column if not exists agent_enabled boolean not null default false;
