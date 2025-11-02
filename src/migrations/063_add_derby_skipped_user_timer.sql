-- Migration: Add derby_skipped_user_time_limit_seconds to drafts table
-- This timer is used when only skipped users remain in the derby
-- Allows commissioner to set a different (usually longer) timer for skipped users to make their picks

ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS derby_skipped_user_time_limit_seconds INTEGER;

-- Add comment explaining the column
COMMENT ON COLUMN drafts.derby_skipped_user_time_limit_seconds IS
  'Time limit in seconds for skipped users when only skipped users remain. If NULL, uses derby_time_limit_seconds.';
