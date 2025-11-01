-- Create draft_derby_selections table to track position selections in derby
CREATE TABLE IF NOT EXISTS draft_derby_selections (
  id SERIAL PRIMARY KEY,
  derby_id INTEGER NOT NULL REFERENCES draft_derby(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  draft_position INTEGER NOT NULL CHECK (draft_position > 0),
  selection_order INTEGER NOT NULL CHECK (selection_order > 0), -- Order in which they selected
  selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(derby_id, roster_id),
  UNIQUE(derby_id, draft_position)
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_derby_selections_derby_id ON draft_derby_selections(derby_id);
CREATE INDEX IF NOT EXISTS idx_derby_selections_roster_id ON draft_derby_selections(roster_id);