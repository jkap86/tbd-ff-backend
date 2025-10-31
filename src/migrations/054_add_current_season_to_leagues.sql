-- Add current_season column to leagues table for dynasty season tracking
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS current_season VARCHAR(10) DEFAULT NULL;

-- Create index for current_season queries
CREATE INDEX IF NOT EXISTS idx_leagues_current_season ON leagues(current_season);

-- Comment
COMMENT ON COLUMN leagues.current_season IS 'Current active season for dynasty leagues (NULL for redraft, same as season column for dynasty)';

-- Backfill current_season for dynasty leagues
-- For dynasty leagues, set current_season = season (they are in their first season)
UPDATE leagues
SET current_season = season
WHERE league_type = 'dynasty' AND current_season IS NULL;
