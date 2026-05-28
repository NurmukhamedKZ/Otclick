-- ============================================================
-- 012_form_drafts.sql — AI-filled vacancy form/test answers awaiting
-- user approval. The worker stops at the AI-generated answers and writes
-- a row here; user approves in the UI; backend then re-fetches xsrf and
-- submits to hh. No autonomous form submission.
-- Run AFTER 011_worker_enabled.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS form_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  vacancy_id text NOT NULL,
  resume_id uuid REFERENCES resumes(id) ON DELETE CASCADE,
  vacancy_title text,
  employer_name text,
  vacancy_url text,
  answers jsonb NOT NULL,                     -- per-task [{task_id, question, type, options?, answer_id?, answer}]
  letter text,
  status text NOT NULL DEFAULT 'pending',     -- 'pending'|'sent'|'discarded'|'failed'
  error text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (user_id, vacancy_id)
);

CREATE INDEX IF NOT EXISTS idx_form_drafts_user_status
  ON form_drafts (user_id, status);

ALTER TABLE form_drafts ENABLE ROW LEVEL SECURITY;  -- service_role only
