-- Day 14: Realtime UPDATE payloads must include all columns (not only PK).
-- Default REPLICA IDENTITY = DEFAULT → payload.new on UPDATE only includes PK columns.
-- FULL = payload.new has every column. Required for status transitions
-- (applications.status queued→sent/failed, captcha_requests.solved false→true).

ALTER TABLE applications REPLICA IDENTITY FULL;
ALTER TABLE captcha_requests REPLICA IDENTITY FULL;
