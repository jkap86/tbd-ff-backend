-- Add derby configuration columns to drafts table
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS derby_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS derby_time_limit_seconds INTEGER, -- NULL = no time limit
  ADD COLUMN IF NOT EXISTS derby_timeout_behavior VARCHAR(10) DEFAULT 'auto' CHECK (derby_timeout_behavior IN ('auto', 'skip'));

-- Add comment explaining the columns
COMMENT ON COLUMN drafts.derby_enabled IS 'Whether draft slot selection derby is enabled for this draft';
COMMENT ON COLUMN drafts.derby_time_limit_seconds IS 'Time limit in seconds for each manager to make their derby selection. NULL means no limit.';
COMMENT ON COLUMN drafts.derby_timeout_behavior IS 'What happens when a manager times out: auto (randomly assign available slot) or skip (lose turn, get priority later)';
