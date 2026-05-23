-- ============================================================
-- 003_hh_credentials_invalid.sql — mark credentials as dead (token revoked,
--   refresh expired, account banned). Worker stops, user must reconnect.
-- Run AFTER 002_indexes.sql
-- ============================================================

ALTER TABLE hh_credentials
  ADD COLUMN IF NOT EXISTS invalid_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalid_reason text;
