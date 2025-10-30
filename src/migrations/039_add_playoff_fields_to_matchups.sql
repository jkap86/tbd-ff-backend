-- Add playoff fields to matchups table

-- Add playoff-related columns to matchups table
ALTER TABLE matchups
ADD COLUMN IF NOT EXISTS is_playoff BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS playoff_round VARCHAR(20),
ADD COLUMN IF NOT EXISTS bracket_position VARCHAR(20),
ADD COLUMN IF NOT EXISTS is_championship BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_consolation BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS seed1 INTEGER,
ADD COLUMN IF NOT EXISTS seed2 INTEGER,
ADD COLUMN IF NOT EXISTS tiebreaker_used VARCHAR(50),
ADD COLUMN IF NOT EXISTS tiebreaker_notes TEXT,
ADD COLUMN IF NOT EXISTS manual_winner_selected_by INTEGER REFERENCES users(id);

-- Add comments to document each column
COMMENT ON COLUMN matchups.is_playoff IS 'Indicates if this is a playoff matchup';
COMMENT ON COLUMN matchups.playoff_round IS 'Playoff round name: wildcard, quarterfinal, semifinal, final, third_place';
COMMENT ON COLUMN matchups.bracket_position IS 'Position identifier in bracket (e.g., "1v8", "winner_1v8")';
COMMENT ON COLUMN matchups.is_championship IS 'Indicates if this is the championship game';
COMMENT ON COLUMN matchups.is_consolation IS 'Indicates if this is a consolation bracket game';
COMMENT ON COLUMN matchups.seed1 IS 'Playoff seed number for roster1 (1-12)';
COMMENT ON COLUMN matchups.seed2 IS 'Playoff seed number for roster2 (1-12)';
COMMENT ON COLUMN matchups.tiebreaker_used IS 'Which tiebreaker method determined the winner (e.g., "bench_points", "season_points_for")';
COMMENT ON COLUMN matchups.tiebreaker_notes IS 'Detailed explanation of how the tiebreaker was applied';
COMMENT ON COLUMN matchups.manual_winner_selected_by IS 'User ID of commissioner who manually selected winner, if applicable';

-- Create index for playoff queries
CREATE INDEX IF NOT EXISTS idx_matchups_playoff ON matchups(league_id, is_playoff, playoff_round);

-- Add check constraint for valid playoff rounds
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_playoff_round'
    ) THEN
        ALTER TABLE matchups
        ADD CONSTRAINT valid_playoff_round
        CHECK (playoff_round IS NULL OR playoff_round IN ('wildcard', 'quarterfinal', 'semifinal', 'final', 'third_place'));
    END IF;
END $$;

-- Add check constraint for valid seed numbers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_seed_numbers'
    ) THEN
        ALTER TABLE matchups
        ADD CONSTRAINT valid_seed_numbers
        CHECK (
            (seed1 IS NULL OR (seed1 >= 1 AND seed1 <= 12)) AND
            (seed2 IS NULL OR (seed2 >= 1 AND seed2 <= 12))
        );
    END IF;
END $$;
