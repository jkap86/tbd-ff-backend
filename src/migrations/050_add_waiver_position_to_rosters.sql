-- Add waiver_position column to rosters table
-- Note: waiver_priority already exists (from migration 022), this adds waiver_position for current waiver order
ALTER TABLE rosters
ADD COLUMN IF NOT EXISTS waiver_position INTEGER DEFAULT 1;

-- Create index for waiver position
CREATE INDEX IF NOT EXISTS idx_rosters_waiver_position ON rosters(waiver_position);

-- Add comment
COMMENT ON COLUMN rosters.waiver_position IS 'Current position in waiver order (resets weekly or after claims)';
COMMENT ON COLUMN rosters.waiver_priority IS 'Initial/base waiver priority for the season';
