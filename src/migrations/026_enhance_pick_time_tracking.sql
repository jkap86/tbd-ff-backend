-- Enhance draft_picks table to track when each pick started
-- This is crucial for chess timer mode to calculate time used for each pick

-- Add pick_started_at column to track when the pick timer started
ALTER TABLE draft_picks
ADD COLUMN IF NOT EXISTS pick_started_at TIMESTAMP;

-- Add comment to pick_started_at column
COMMENT ON COLUMN draft_picks.pick_started_at IS 'Timestamp when this pick started (timer began). Used to calculate time_used in chess mode.';

-- Add index for querying picks by start time
CREATE INDEX IF NOT EXISTS idx_draft_picks_started_at ON draft_picks(draft_id, pick_started_at);
