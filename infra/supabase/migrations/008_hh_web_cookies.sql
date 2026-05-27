-- ============================================================
-- 008_hh_web_cookies.sql — store the hh.ru web session (cookies) captured
--   during the OAuth Playwright login. Reused by the form-filler to solve
--   vacancy tests over the web endpoint without re-logging in (no per-form
--   captcha). Fernet-encrypted JSON, service_role only — same as the tokens.
-- Run AFTER 007_trial_plan.sql
-- ============================================================

ALTER TABLE hh_credentials
  ADD COLUMN IF NOT EXISTS web_cookies_encrypted text;
