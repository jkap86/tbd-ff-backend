-- Create ADP tracking table
CREATE TABLE IF NOT EXISTS player_adp (
  id SERIAL PRIMARY KEY,
  player_id VARCHAR(50) NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  season VARCHAR(10) NOT NULL, -- '2024', '2025', etc.
  draft_type VARCHAR(20) NOT NULL, -- 'snake', 'auction', 'all'
  league_size INTEGER, -- NULL for all sizes, or 10, 12, 14, etc.
  adp DECIMAL(5,2) NOT NULL, -- Average Draft Position
  min_pick INTEGER, -- Earliest pick
  max_pick INTEGER, -- Latest pick
  times_drafted INTEGER NOT NULL DEFAULT 0, -- Number of times drafted
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, season, draft_type, league_size)
);

-- Indexes for efficient queries
CREATE INDEX idx_player_adp_player ON player_adp(player_id);
CREATE INDEX idx_player_adp_season ON player_adp(season);
CREATE INDEX idx_player_adp_adp ON player_adp(adp);
CREATE INDEX idx_player_adp_draft_type ON player_adp(draft_type);
CREATE INDEX idx_player_adp_league_size ON player_adp(league_size);

-- Comments
COMMENT ON TABLE player_adp IS 'Tracks average draft position from actual app drafts';
COMMENT ON COLUMN player_adp.adp IS 'Calculated average pick number (lower is better)';
COMMENT ON COLUMN player_adp.times_drafted IS 'How many drafts player was selected in';
