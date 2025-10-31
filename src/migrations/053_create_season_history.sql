-- Create season_history table to track roster performance across seasons
CREATE TABLE IF NOT EXISTS season_history (
  id SERIAL PRIMARY KEY,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season VARCHAR(10) NOT NULL, -- Season year (e.g., '2024')
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points_for DECIMAL(10, 2) DEFAULT 0.00,
  points_against DECIMAL(10, 2) DEFAULT 0.00,
  final_rank INTEGER DEFAULT NULL, -- Final standing (1 = champion)
  playoff_result VARCHAR(50) DEFAULT NULL, -- 'champion', 'runner_up', 'semifinals', 'wildcard', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(roster_id, season) -- One record per roster per season
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_season_history_roster ON season_history(roster_id);
CREATE INDEX IF NOT EXISTS idx_season_history_league ON season_history(league_id);
CREATE INDEX IF NOT EXISTS idx_season_history_season ON season_history(season);
CREATE INDEX IF NOT EXISTS idx_season_history_wins ON season_history(wins DESC);
CREATE INDEX IF NOT EXISTS idx_season_history_final_rank ON season_history(final_rank);

-- Comments
COMMENT ON TABLE season_history IS 'Historical record of roster performance for each completed season in dynasty leagues';
COMMENT ON COLUMN season_history.final_rank IS 'Final standings position (1 = champion, 2 = runner-up, etc.)';
COMMENT ON COLUMN season_history.playoff_result IS 'Playoff finish description';
