-- Create draft_pick_trades table for trading future draft picks
CREATE TABLE IF NOT EXISTS draft_pick_trades (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  from_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  to_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  season VARCHAR(10) NOT NULL, -- Season of the pick being traded (e.g., '2025')
  round INTEGER NOT NULL, -- Draft round (1-20)
  original_roster_id INTEGER REFERENCES rosters(id) ON DELETE SET NULL, -- Original owner of pick
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined, cancelled
  proposed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT valid_round CHECK (round >= 1 AND round <= 20),
  CONSTRAINT different_rosters CHECK (from_roster_id != to_roster_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_league ON draft_pick_trades(league_id);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_from_roster ON draft_pick_trades(from_roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_to_roster ON draft_pick_trades(to_roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_season ON draft_pick_trades(season);
CREATE INDEX IF NOT EXISTS idx_draft_pick_trades_status ON draft_pick_trades(status);

-- Comments
COMMENT ON TABLE draft_pick_trades IS 'Tracks draft pick trades between rosters in dynasty leagues';
COMMENT ON COLUMN draft_pick_trades.original_roster_id IS 'Original owner of the pick (NULL if from_roster is original owner)';
COMMENT ON COLUMN draft_pick_trades.status IS 'Trade status: pending, accepted, declined, cancelled';
