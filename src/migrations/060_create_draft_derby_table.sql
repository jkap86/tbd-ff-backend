-- Create draft_derby table to track the derby selection phase
CREATE TABLE IF NOT EXISTS draft_derby (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER UNIQUE NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  current_turn_roster_id INTEGER REFERENCES rosters(id), -- Which roster is currently selecting
  current_turn_started_at TIMESTAMP, -- When current turn started (for timeout tracking)
  selection_order JSONB NOT NULL, -- Array of roster IDs in randomized selection order
  skipped_roster_ids JSONB DEFAULT '[]', -- Array of roster IDs that were skipped (for priority queue)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_draft_derby_draft_id ON draft_derby(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_status ON draft_derby(status);
CREATE INDEX IF NOT EXISTS idx_draft_derby_current_turn ON draft_derby(current_turn_roster_id);

-- Add comments
COMMENT ON TABLE draft_derby IS 'Tracks the draft slot selection derby phase where managers pick their draft positions';
COMMENT ON COLUMN draft_derby.selection_order IS 'Randomized array of roster IDs determining the order managers select their draft slots';
COMMENT ON COLUMN draft_derby.skipped_roster_ids IS 'Array of roster IDs that were skipped due to timeout, get priority on next round';
COMMENT ON COLUMN draft_derby.current_turn_roster_id IS 'The roster ID that is currently selecting their draft position';
COMMENT ON COLUMN draft_derby.current_turn_started_at IS 'When the current turn started, used for calculating timeout';
