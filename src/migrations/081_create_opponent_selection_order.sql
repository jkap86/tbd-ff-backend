-- Create opponent_selection_order table for tracking opponent selection draft order
CREATE TABLE IF NOT EXISTS opponent_selection_order (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  selection_position INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure unique roster per league
  UNIQUE (league_id, roster_id),

  -- Ensure unique selection position per league
  UNIQUE (league_id, selection_position)
);

-- Add indexes for efficient queries
CREATE INDEX idx_opponent_selection_order_league_id ON opponent_selection_order(league_id);
CREATE INDEX idx_opponent_selection_order_roster_id ON opponent_selection_order(roster_id);
CREATE INDEX idx_opponent_selection_order_league_position ON opponent_selection_order(league_id, selection_position);

-- Add comment to table
COMMENT ON TABLE opponent_selection_order IS 'Stores the draft order for opponent selection in head-to-head leagues';
