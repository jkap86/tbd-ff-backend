-- Fix draft_derby status constraint to use 'pending' instead of 'not_started'
-- The constraint was incorrectly created with 'not_started' instead of 'pending'

-- Drop the old constraint
ALTER TABLE draft_derby
  DROP CONSTRAINT IF EXISTS draft_derby_status_check;

-- Add the correct constraint
ALTER TABLE draft_derby
  ADD CONSTRAINT draft_derby_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed'));

-- Update any existing records with 'not_started' to 'pending'
UPDATE draft_derby
SET status = 'pending'
WHERE status = 'not_started';
