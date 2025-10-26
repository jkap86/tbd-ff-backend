-- Add finalized flag to matchups table
ALTER TABLE matchups ADD COLUMN IF NOT EXISTS finalized BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_matchups_finalized ON matchups(finalized);
