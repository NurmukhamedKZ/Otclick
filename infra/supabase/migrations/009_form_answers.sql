-- ============================================================
-- 009_form_answers.sql — store the vacancy-test questions and the answers the
--   AI filler submitted, per application. Audit / transparency / debugging.
--   Shape: [{task_id, question, type:"choice"|"text", options?, answer_id?, answer}]
-- Run AFTER 008_hh_web_cookies.sql
-- ============================================================

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS form_answers jsonb;
