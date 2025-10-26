-- Create player_stats table
CREATE TABLE IF NOT EXISTS player_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    season VARCHAR(4) NOT NULL,
    season_type VARCHAR(20) DEFAULT 'regular', -- regular, post, pre

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

    -- Ensure unique player stat per week/season
    CONSTRAINT unique_player_week_season UNIQUE (player_id, week, season, season_type)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_week_season ON player_stats(week, season, season_type);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_player_stats_updated_at ON player_stats;

CREATE TRIGGER update_player_stats_updated_at BEFORE UPDATE
    ON player_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
