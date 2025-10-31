-- Add traded_to_roster_id column to draft_picks table for tracking traded picks
ALTER TABLE draft_picks
ADD COLUMN IF NOT EXISTS traded_to_roster_id INTEGER DEFAULT NULL REFERENCES rosters(id) ON DELETE SET NULL;

-- Create index for traded pick queries
CREATE INDEX IF NOT EXISTS idx_draft_picks_traded_to ON draft_picks(traded_to_roster_id);

-- Comment
COMMENT ON COLUMN draft_picks.traded_to_roster_id IS 'If this pick was traded, the roster_id that now owns it (NULL = not traded)';
