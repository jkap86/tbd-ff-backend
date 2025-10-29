-- Add time tracking fields to draft_order table for chess timer mode
-- Tracks how much time each team has remaining and used during the draft

-- Add time_remaining_seconds column to track remaining time budget
ALTER TABLE draft_order
ADD COLUMN IF NOT EXISTS time_remaining_seconds INTEGER;

-- Add comment to time_remaining_seconds column
COMMENT ON COLUMN draft_order.time_remaining_seconds IS 'Time remaining in seconds for this roster (chess mode only). Decrements as picks are made.';

-- Add time_used_seconds column to track total time used
ALTER TABLE draft_order
ADD COLUMN IF NOT EXISTS time_used_seconds INTEGER DEFAULT 0;

-- Add comment to time_used_seconds column
COMMENT ON COLUMN draft_order.time_used_seconds IS 'Total time used in seconds by this roster across all picks (chess mode only).';

-- Add index for querying time remaining (useful for checking timeouts)
CREATE INDEX IF NOT EXISTS idx_draft_order_time_remaining ON draft_order(draft_id, time_remaining_seconds);

-- Add check constraint to ensure time values are non-negative when set
ALTER TABLE draft_order
ADD CONSTRAINT check_time_remaining_non_negative
CHECK (time_remaining_seconds IS NULL OR time_remaining_seconds >= 0);

ALTER TABLE draft_order
ADD CONSTRAINT check_time_used_non_negative
CHECK (time_used_seconds >= 0);
