-- Add League Median scoring settings to leagues and matchups tables

-- ============================================================================
-- ROLLBACK COMMANDS (commented out - uncomment to rollback)
-- ============================================================================
-- DROP INDEX IF EXISTS idx_matchups_median;
-- ALTER TABLE matchups DROP COLUMN IF EXISTS median_score;
-- ALTER TABLE matchups DROP COLUMN IF EXISTS is_median_matchup;
-- ALTER TABLE leagues DROP COLUMN IF EXISTS median_matchup_week_end;
-- ALTER TABLE leagues DROP COLUMN IF EXISTS median_matchup_week_start;
-- ALTER TABLE leagues DROP COLUMN IF EXISTS enable_league_median;

-- ============================================================================
-- LEAGUES TABLE: Add League Median settings
-- ============================================================================

-- Add league median feature toggle and week range settings
ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS enable_league_median BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS median_matchup_week_start INTEGER,
ADD COLUMN IF NOT EXISTS median_matchup_week_end INTEGER;

-- Add comments to document the league median settings
COMMENT ON COLUMN leagues.enable_league_median IS 'Enables League Median scoring where each team plays against the league median score each week in addition to their normal matchup';
COMMENT ON COLUMN leagues.median_matchup_week_start IS 'First week where median matchups are calculated (typically same as regular season start_week)';
COMMENT ON COLUMN leagues.median_matchup_week_end IS 'Last week where median matchups are calculated (typically playoff_week_start - 1 to exclude playoffs)';

-- ============================================================================
-- MATCHUPS TABLE: Add League Median tracking fields
-- ============================================================================

-- Add columns to track median matchups and store the league median score
ALTER TABLE matchups
ADD COLUMN IF NOT EXISTS is_median_matchup BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS median_score DECIMAL(10, 2);

-- Add comments to document the median matchup fields
COMMENT ON COLUMN matchups.is_median_matchup IS 'Indicates if this is a median matchup (team vs league median) rather than a regular head-to-head matchup. For median matchups, roster2_id will be NULL and roster1_score is compared to median_score';
COMMENT ON COLUMN matchups.median_score IS 'The calculated league median score for this week. Only populated on median matchup records (is_median_matchup = TRUE). This is the 50th percentile score across all teams that week';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Create index for efficient median matchup queries
CREATE INDEX IF NOT EXISTS idx_matchups_median ON matchups(league_id, week, is_median_matchup);

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Add check constraint for valid median matchup week start
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_median_week_start'
    ) THEN
        ALTER TABLE leagues
        ADD CONSTRAINT valid_median_week_start
        CHECK (median_matchup_week_start IS NULL OR (median_matchup_week_start >= 1 AND median_matchup_week_start <= 18));
    END IF;
END $$;

-- Add check constraint for valid median matchup week range
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_median_week_range'
    ) THEN
        ALTER TABLE leagues
        ADD CONSTRAINT valid_median_week_range
        CHECK (
            median_matchup_week_end IS NULL OR
            median_matchup_week_start IS NULL OR
            (median_matchup_week_end >= median_matchup_week_start AND median_matchup_week_end <= 18)
        );
    END IF;
END $$;
