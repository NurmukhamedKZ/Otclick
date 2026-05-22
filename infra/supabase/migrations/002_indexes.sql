-- ============================================================
-- 002_indexes.sql — performance indexes
-- Run AFTER 001_init.sql
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_applications_user_created
  ON applications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_user_status
  ON applications(user_id, status);

CREATE INDEX IF NOT EXISTS idx_apply_counters_user_date
  ON apply_counters(user_id, date);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications(user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blacklist_user_employer
  ON blacklist(user_id, employer_id);

CREATE INDEX IF NOT EXISTS idx_resumes_user
  ON resumes(user_id);
