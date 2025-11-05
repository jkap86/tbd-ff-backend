-- Partition player_stats table by season for better query performance
-- This migration converts the existing player_stats table to a partitioned table

BEGIN;

-- 1. Rename the existing table
ALTER TABLE player_stats RENAME TO player_stats_old;

-- 2. Create new partitioned table with same structure
CREATE TABLE player_stats (
    id SERIAL,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    season VARCHAR(4) NOT NULL,
    season_type VARCHAR(20) DEFAULT 'regular',

    -- Passing stats
    passing_attempts INTEGER DEFAULT 0,
    passing_completions INTEGER DEFAULT 0,
    passing_yards INTEGER DEFAULT 0,
    passing_touchdowns INTEGER DEFAULT 0,
    passing_interceptions INTEGER DEFAULT 0,
    passing_2pt_conversions INTEGER DEFAULT 0,

    -- Rushing stats
    rushing_attempts INTEGER DEFAULT 0,
    rushing_yards INTEGER DEFAULT 0,
    rushing_touchdowns INTEGER DEFAULT 0,
    rushing_2pt_conversions INTEGER DEFAULT 0,

    -- Receiving stats
    receiving_targets INTEGER DEFAULT 0,
    receiving_receptions INTEGER DEFAULT 0,
    receiving_yards INTEGER DEFAULT 0,
    receiving_touchdowns INTEGER DEFAULT 0,
    receiving_2pt_conversions INTEGER DEFAULT 0,

    -- Fumbles
    fumbles_lost INTEGER DEFAULT 0,

    -- Kicking stats
    field_goals_made INTEGER DEFAULT 0,
    field_goals_attempted INTEGER DEFAULT 0,
    field_goals_made_0_19 INTEGER DEFAULT 0,
    field_goals_made_20_29 INTEGER DEFAULT 0,
    field_goals_made_30_39 INTEGER DEFAULT 0,
    field_goals_made_40_49 INTEGER DEFAULT 0,
    field_goals_made_50_plus INTEGER DEFAULT 0,
    extra_points_made INTEGER DEFAULT 0,
    extra_points_attempted INTEGER DEFAULT 0,

    -- Defense/Special Teams
    defensive_touchdowns INTEGER DEFAULT 0,
    special_teams_touchdowns INTEGER DEFAULT 0,
    defensive_interceptions INTEGER DEFAULT 0,
    defensive_fumbles_recovered INTEGER DEFAULT 0,
    defensive_sacks DECIMAL(5, 1) DEFAULT 0,
    defensive_safeties INTEGER DEFAULT 0,
    defensive_points_allowed INTEGER DEFAULT 0,
    defensive_yards_allowed INTEGER DEFAULT 0,

    -- IDP stats
    tackles_solo INTEGER DEFAULT 0,
    tackles_assisted INTEGER DEFAULT 0,
    tackles_for_loss INTEGER DEFAULT 0,
    quarterback_hits INTEGER DEFAULT 0,
    passes_defended INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id, season)
) PARTITION BY LIST (season);

-- 3. Create partitions for recent seasons (last 3 years + current + next)
CREATE TABLE player_stats_2023 PARTITION OF player_stats FOR VALUES IN ('2023');
CREATE TABLE player_stats_2024 PARTITION OF player_stats FOR VALUES IN ('2024');
CREATE TABLE player_stats_2025 PARTITION OF player_stats FOR VALUES IN ('2025');
CREATE TABLE player_stats_2026 PARTITION OF player_stats FOR VALUES IN ('2026');

-- 4. Create default partition for any other seasons
CREATE TABLE player_stats_default PARTITION OF player_stats DEFAULT;

-- 5. Create indexes on each partition (inherits from parent but explicit for clarity)
CREATE INDEX idx_player_stats_2023_player ON player_stats_2023(player_id);
CREATE INDEX idx_player_stats_2023_week_season ON player_stats_2023(week, season, season_type);

CREATE INDEX idx_player_stats_2024_player ON player_stats_2024(player_id);
CREATE INDEX idx_player_stats_2024_week_season ON player_stats_2024(week, season, season_type);

CREATE INDEX idx_player_stats_2025_player ON player_stats_2025(player_id);
CREATE INDEX idx_player_stats_2025_week_season ON player_stats_2025(week, season, season_type);

CREATE INDEX idx_player_stats_2026_player ON player_stats_2026(player_id);
CREATE INDEX idx_player_stats_2026_week_season ON player_stats_2026(week, season, season_type);

CREATE INDEX idx_player_stats_default_player ON player_stats_default(player_id);
CREATE INDEX idx_player_stats_default_week_season ON player_stats_default(week, season, season_type);

-- 6. Add unique constraint within each partition
ALTER TABLE player_stats_2023 ADD CONSTRAINT unique_player_week_season_2023
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_stats_2024 ADD CONSTRAINT unique_player_week_season_2024
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_stats_2025 ADD CONSTRAINT unique_player_week_season_2025
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_stats_2026 ADD CONSTRAINT unique_player_week_season_2026
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_stats_default ADD CONSTRAINT unique_player_week_season_default
    UNIQUE (player_id, week, season, season_type);

-- 7. Migrate data from old table to new partitioned table (if any exists)
INSERT INTO player_stats (
    player_id, week, season, season_type,
    passing_attempts, passing_completions, passing_yards, passing_touchdowns, passing_interceptions, passing_2pt_conversions,
    rushing_attempts, rushing_yards, rushing_touchdowns, rushing_2pt_conversions,
    receiving_targets, receiving_receptions, receiving_yards, receiving_touchdowns, receiving_2pt_conversions,
    fumbles_lost,
    field_goals_made, field_goals_attempted, field_goals_made_0_19, field_goals_made_20_29, field_goals_made_30_39, field_goals_made_40_49, field_goals_made_50_plus,
    extra_points_made, extra_points_attempted,
    defensive_touchdowns, special_teams_touchdowns, defensive_interceptions, defensive_fumbles_recovered, defensive_sacks, defensive_safeties, defensive_points_allowed, defensive_yards_allowed,
    tackles_solo, tackles_assisted, tackles_for_loss, quarterback_hits, passes_defended,
    created_at, updated_at
)
SELECT
    player_id, week, season, season_type,
    passing_attempts, passing_completions, passing_yards, passing_touchdowns, passing_interceptions, passing_2pt_conversions,
    rushing_attempts, rushing_yards, rushing_touchdowns, rushing_2pt_conversions,
    receiving_targets, receiving_receptions, receiving_yards, receiving_touchdowns, receiving_2pt_conversions,
    fumbles_lost,
    field_goals_made, field_goals_attempted, field_goals_made_0_19, field_goals_made_20_29, field_goals_made_30_39, field_goals_made_40_49, field_goals_made_50_plus,
    extra_points_made, extra_points_attempted,
    defensive_touchdowns, special_teams_touchdowns, defensive_interceptions, defensive_fumbles_recovered, defensive_sacks, defensive_safeties, defensive_points_allowed, defensive_yards_allowed,
    tackles_solo, tackles_assisted, tackles_for_loss, quarterback_hits, passes_defended,
    created_at, updated_at
FROM player_stats_old;

-- 8. Drop old table
DROP TABLE player_stats_old;

-- 9. Recreate trigger for updated_at
CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE
    ON player_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Notes:
-- - Each query for a specific season will only scan that partition
-- - New partitions should be added each year (e.g., 2027, 2028, etc.)
-- - The default partition catches any unexpected seasons
-- - Queries without season filter will scan all partitions (partition pruning won't help)
-- - For optimal performance, always include 'season' in WHERE clauses
