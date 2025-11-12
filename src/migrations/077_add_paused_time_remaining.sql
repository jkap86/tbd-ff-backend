-- Add column to store time remaining when draft is paused
-- This allows the timer to resume from where it left off

ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS paused_time_remaining_seconds INTEGER;

COMMENT ON COLUMN drafts.paused_time_remaining_seconds IS 'Seconds remaining on pick timer when draft was paused. Used to resume timer from same point.';
