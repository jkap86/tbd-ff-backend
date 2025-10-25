-- Add league_type column and migrate existing season_type data
-- Step 1: Add league_type column
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS league_type VARCHAR(20) DEFAULT 'redraft';

-- Step 2: Copy current season_type values to league_type (they were mislabeled)
UPDATE leagues
SET league_type = season_type
WHERE season_type IN ('redraft', 'keeper', 'dynasty');

-- Step 3: Reset season_type to 'regular' for all leagues (default regular season phase)
UPDATE leagues
SET season_type = 'regular';

-- Step 4: Create index on league_type for faster queries
CREATE INDEX IF NOT EXISTS idx_leagues_league_type ON leagues(league_type);

COMMENT ON COLUMN leagues.league_type IS 'Type of league: redraft, keeper, or dynasty';
COMMENT ON COLUMN leagues.season_type IS 'Phase of season: pre, regular, or post';
