-- ============================================================
-- 004_cover_letters_cache.sql — cache GPT-generated cover letters
--   keyed by (vacancy_id, resume_id). Skip re-generation across runs and
--   across producer/apply boundary.
-- Run AFTER 003_hh_credentials_invalid.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS cover_letters_cache (
  vacancy_id text NOT NULL,
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  model text,
  source text NOT NULL DEFAULT 'ai',  -- 'ai' | 'fallback'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vacancy_id, resume_id)
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_cache_user
  ON cover_letters_cache(user_id);

ALTER TABLE cover_letters_cache ENABLE ROW LEVEL SECURITY;
-- No policies = full DENY for anon + authenticated. service_role bypasses RLS.
