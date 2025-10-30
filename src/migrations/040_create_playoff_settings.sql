-- Create playoff_settings table
CREATE TABLE IF NOT EXISTS playoff_settings (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE UNIQUE,
    playoff_teams INTEGER NOT NULL DEFAULT 6,
    playoff_week_start INTEGER NOT NULL DEFAULT 15,
    playoff_week_end INTEGER NOT NULL DEFAULT 17,
    matchup_duration INTEGER DEFAULT 1,
    include_consolation_bracket BOOLEAN DEFAULT FALSE,
    reseed_rounds BOOLEAN DEFAULT FALSE,
    tiebreaker_priority JSONB DEFAULT '["bench_points", "season_points_for", "higher_seed"]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add comments to document the table and columns
COMMENT ON TABLE playoff_settings IS 'Stores playoff configuration settings for each league';
COMMENT ON COLUMN playoff_settings.league_id IS 'Foreign key to leagues table (one setting per league)';
COMMENT ON COLUMN playoff_settings.playoff_teams IS 'Number of teams that make playoffs (4, 6, 8, 10, or 12)';
COMMENT ON COLUMN playoff_settings.playoff_week_start IS 'Week number when playoffs begin';
COMMENT ON COLUMN playoff_settings.playoff_week_end IS 'Week number when playoffs end';
COMMENT ON COLUMN playoff_settings.matchup_duration IS 'Number of weeks per playoff matchup (1 or 2)';
COMMENT ON COLUMN playoff_settings.include_consolation_bracket IS 'Whether to run a consolation bracket for eliminated teams';
COMMENT ON COLUMN playoff_settings.reseed_rounds IS 'Whether to reseed teams after each round (highest seed plays lowest)';
COMMENT ON COLUMN playoff_settings.tiebreaker_priority IS 'Ordered array of tiebreaker methods: bench_points, season_points_for, higher_seed, etc.';

-- Create index for faster league lookups
CREATE INDEX IF NOT EXISTS idx_playoff_settings_league ON playoff_settings(league_id);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_playoff_settings_updated_at ON playoff_settings;

CREATE TRIGGER update_playoff_settings_updated_at BEFORE UPDATE
    ON playoff_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add check constraint for valid playoff team counts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_playoff_teams'
    ) THEN
        ALTER TABLE playoff_settings
        ADD CONSTRAINT valid_playoff_teams
        CHECK (playoff_teams IN (4, 6, 8, 10, 12));
    END IF;
END $$;

-- Add check constraint for valid matchup duration
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_matchup_duration'
    ) THEN
        ALTER TABLE playoff_settings
        ADD CONSTRAINT valid_matchup_duration
        CHECK (matchup_duration IN (1, 2));
    END IF;
END $$;

-- Add check constraint for valid week ranges
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_playoff_weeks'
    ) THEN
        ALTER TABLE playoff_settings
        ADD CONSTRAINT valid_playoff_weeks
        CHECK (
            playoff_week_start > 0 AND
            playoff_week_end > 0 AND
            playoff_week_end >= playoff_week_start
        );
    END IF;
END $$;
