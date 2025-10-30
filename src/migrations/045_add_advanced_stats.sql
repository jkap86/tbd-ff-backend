-- Add advanced stat tracking fields to player_stats table
-- This enables first down tracking, big play tracking, and bonus thresholds

-- Add first down tracking
ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS rushing_first_downs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS receiving_first_downs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS passing_first_downs INTEGER DEFAULT 0;

-- Add big play tracking
ALTER TABLE player_stats
ADD COLUMN IF NOT EXISTS rush_40plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rec_40plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pass_40plus INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN player_stats.rushing_first_downs IS 'First downs gained rushing';
COMMENT ON COLUMN player_stats.receiving_first_downs IS 'First downs gained receiving';
COMMENT ON COLUMN player_stats.passing_first_downs IS 'First downs gained passing';
COMMENT ON COLUMN player_stats.rush_40plus IS 'Rushes of 40+ yards';
COMMENT ON COLUMN player_stats.rec_40plus IS 'Receptions of 40+ yards';
COMMENT ON COLUMN player_stats.pass_40plus IS 'Pass completions of 40+ yards';
