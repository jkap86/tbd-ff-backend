-- Create player_projections table (partitioned by season from the start)
CREATE TABLE IF NOT EXISTS player_projections (
    id SERIAL,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    season VARCHAR(4) NOT NULL,
    season_type VARCHAR(20) DEFAULT 'regular',

    -- Passing projections
    passing_attempts DECIMAL(6, 2) DEFAULT 0,
    passing_completions DECIMAL(6, 2) DEFAULT 0,
    passing_yards DECIMAL(8, 2) DEFAULT 0,
    passing_touchdowns DECIMAL(6, 2) DEFAULT 0,
    passing_interceptions DECIMAL(6, 2) DEFAULT 0,
    passing_2pt_conversions DECIMAL(6, 2) DEFAULT 0,

    -- Rushing projections
    rushing_attempts DECIMAL(6, 2) DEFAULT 0,
    rushing_yards DECIMAL(8, 2) DEFAULT 0,
    rushing_touchdowns DECIMAL(6, 2) DEFAULT 0,
    rushing_2pt_conversions DECIMAL(6, 2) DEFAULT 0,

    -- Receiving projections
    receiving_targets DECIMAL(6, 2) DEFAULT 0,
    receiving_receptions DECIMAL(6, 2) DEFAULT 0,
    receiving_yards DECIMAL(8, 2) DEFAULT 0,
    receiving_touchdowns DECIMAL(6, 2) DEFAULT 0,
    receiving_2pt_conversions DECIMAL(6, 2) DEFAULT 0,

    -- Fumbles
    fumbles_lost DECIMAL(6, 2) DEFAULT 0,

    -- Kicking projections
    field_goals_made DECIMAL(6, 2) DEFAULT 0,
    field_goals_attempted DECIMAL(6, 2) DEFAULT 0,
    field_goals_made_0_19 DECIMAL(6, 2) DEFAULT 0,
    field_goals_made_20_29 DECIMAL(6, 2) DEFAULT 0,
    field_goals_made_30_39 DECIMAL(6, 2) DEFAULT 0,
    field_goals_made_40_49 DECIMAL(6, 2) DEFAULT 0,
    field_goals_made_50_plus DECIMAL(6, 2) DEFAULT 0,
    extra_points_made DECIMAL(6, 2) DEFAULT 0,
    extra_points_attempted DECIMAL(6, 2) DEFAULT 0,

    -- Defense/Special Teams
    defensive_touchdowns DECIMAL(6, 2) DEFAULT 0,
    special_teams_touchdowns DECIMAL(6, 2) DEFAULT 0,
    defensive_interceptions DECIMAL(6, 2) DEFAULT 0,
    defensive_fumbles_recovered DECIMAL(6, 2) DEFAULT 0,
    defensive_sacks DECIMAL(6, 2) DEFAULT 0,
    defensive_safeties DECIMAL(6, 2) DEFAULT 0,
    defensive_points_allowed DECIMAL(6, 2) DEFAULT 0,
    defensive_yards_allowed DECIMAL(8, 2) DEFAULT 0,

    -- IDP projections
    tackles_solo DECIMAL(6, 2) DEFAULT 0,
    tackles_assisted DECIMAL(6, 2) DEFAULT 0,
    tackles_for_loss DECIMAL(6, 2) DEFAULT 0,
    quarterback_hits DECIMAL(6, 2) DEFAULT 0,
    passes_defended DECIMAL(6, 2) DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id, season)
) PARTITION BY LIST (season);

-- Create partitions for recent seasons
CREATE TABLE player_projections_2023 PARTITION OF player_projections FOR VALUES IN ('2023');
CREATE TABLE player_projections_2024 PARTITION OF player_projections FOR VALUES IN ('2024');
CREATE TABLE player_projections_2025 PARTITION OF player_projections FOR VALUES IN ('2025');
CREATE TABLE player_projections_2026 PARTITION OF player_projections FOR VALUES IN ('2026');
CREATE TABLE player_projections_default PARTITION OF player_projections DEFAULT;

-- Create indexes on each partition
CREATE INDEX idx_player_projections_2023_player ON player_projections_2023(player_id);
CREATE INDEX idx_player_projections_2023_week_season ON player_projections_2023(week, season, season_type);

CREATE INDEX idx_player_projections_2024_player ON player_projections_2024(player_id);
CREATE INDEX idx_player_projections_2024_week_season ON player_projections_2024(week, season, season_type);

CREATE INDEX idx_player_projections_2025_player ON player_projections_2025(player_id);
CREATE INDEX idx_player_projections_2025_week_season ON player_projections_2025(week, season, season_type);

CREATE INDEX idx_player_projections_2026_player ON player_projections_2026(player_id);
CREATE INDEX idx_player_projections_2026_week_season ON player_projections_2026(week, season, season_type);

CREATE INDEX idx_player_projections_default_player ON player_projections_default(player_id);
CREATE INDEX idx_player_projections_default_week_season ON player_projections_default(week, season, season_type);

-- Add unique constraints
ALTER TABLE player_projections_2023 ADD CONSTRAINT unique_player_week_season_2023
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_projections_2024 ADD CONSTRAINT unique_player_week_season_2024
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_projections_2025 ADD CONSTRAINT unique_player_week_season_2025
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_projections_2026 ADD CONSTRAINT unique_player_week_season_2026
    UNIQUE (player_id, week, season, season_type);
ALTER TABLE player_projections_default ADD CONSTRAINT unique_player_week_season_default
    UNIQUE (player_id, week, season, season_type);

-- Create trigger for updated_at
CREATE TRIGGER update_player_projections_updated_at BEFORE UPDATE
    ON player_projections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
