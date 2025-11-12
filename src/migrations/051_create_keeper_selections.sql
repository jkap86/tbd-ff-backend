-- Create keeper_selections table for dynasty/keeper leagues
CREATE TABLE IF NOT EXISTS keeper_selections (
  id SERIAL PRIMARY KEY,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  player_id VARCHAR(50) NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  season VARCHAR(10) NOT NULL, -- Season player is being kept for (e.g., '2025')
  kept_from_season VARCHAR(10) NOT NULL, -- Season player was originally on roster (e.g., '2024')
  draft_round_penalty INTEGER DEFAULT NULL, -- Round keeper counts as (NULL = no penalty)
  is_finalized BOOLEAN DEFAULT FALSE, -- Locked in by commissioner
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(roster_id, player_id, season) -- Can't keep same player twice in same season
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_keeper_selections_roster ON keeper_selections(roster_id);
CREATE INDEX IF NOT EXISTS idx_keeper_selections_player ON keeper_selections(player_id);
CREATE INDEX IF NOT EXISTS idx_keeper_selections_season ON keeper_selections(season);
CREATE INDEX IF NOT EXISTS idx_keeper_selections_finalized ON keeper_selections(is_finalized);

-- Comments
COMMENT ON TABLE keeper_selections IS 'Tracks which players are kept from previous seasons in dynasty/keeper leagues';
COMMENT ON COLUMN keeper_selections.draft_round_penalty IS 'Draft round this keeper counts as (NULL = free keeper, no penalty)';
COMMENT ON COLUMN keeper_selections.is_finalized IS 'True when keeper deadline passes or commissioner locks selections';
