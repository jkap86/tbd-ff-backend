-- Add scheduled_start_time and auto_start fields to drafts table
-- scheduled_start_time: When the draft is scheduled to automatically start (if auto_start is true)
-- auto_start: Whether the draft should automatically start at scheduled_start_time or require manual commissioner start

ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS auto_start BOOLEAN DEFAULT false;

-- Add index for scheduled drafts that need to auto-start
CREATE INDEX IF NOT EXISTS idx_drafts_scheduled_start
ON drafts(scheduled_start_time, auto_start)
WHERE status = 'not_started' AND auto_start = true;

COMMENT ON COLUMN drafts.scheduled_start_time IS 'Scheduled time for draft to start (optional)';
COMMENT ON COLUMN drafts.auto_start IS 'If true, draft will automatically start at scheduled_start_time. If false, commissioner must manually start.';
