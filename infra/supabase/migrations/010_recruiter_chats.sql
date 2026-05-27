-- ============================================================
-- 010_recruiter_chats.sql — recruiter-chat AI agent state.
--   recruiter_chats: per-negotiation dedup cursor.
--   recruiter_drafts: AI-suggested replies awaiting user approval.
--   recruiter_todos:  out-of-hh actions for the user (form/telegram/call).
-- Run AFTER 009_form_answers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS recruiter_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  vacancy_id text,
  employer_name text,
  last_handled_message_id text,
  last_polled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, negotiation_id)
);

CREATE TABLE IF NOT EXISTS recruiter_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  message_id text,
  draft_text text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',   -- 'pending'|'sent'|'discarded'
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS recruiter_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  negotiation_id text NOT NULL,
  message_id text,
  title text NOT NULL,
  detail text,
  link text,
  status text NOT NULL DEFAULT 'open',       -- 'open'|'done'|'dismissed'
  created_at timestamptz DEFAULT now(),
  done_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_recruiter_drafts_user_status
  ON recruiter_drafts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_recruiter_todos_user_status
  ON recruiter_todos (user_id, status);

ALTER TABLE recruiter_chats  ENABLE ROW LEVEL SECURITY;  -- service_role only, no policies
ALTER TABLE recruiter_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiter_todos  ENABLE ROW LEVEL SECURITY;
