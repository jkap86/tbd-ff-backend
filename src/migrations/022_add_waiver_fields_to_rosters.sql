-- Add FAAB budget and waiver priority to rosters table
ALTER TABLE rosters
ADD COLUMN IF NOT EXISTS faab_budget INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS waiver_priority INTEGER DEFAULT 1;

-- Create index for waiver priority
CREATE INDEX IF NOT EXISTS idx_rosters_waiver_priority ON rosters(waiver_priority);
