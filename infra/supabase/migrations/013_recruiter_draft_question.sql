-- ============================================================
-- 013_recruiter_draft_question.sql — store the recruiter message the AI
-- escalated about, so the user can review the question alongside the draft
-- reply on the Todo screen.
-- ============================================================

ALTER TABLE recruiter_drafts
  ADD COLUMN IF NOT EXISTS question_text text;
