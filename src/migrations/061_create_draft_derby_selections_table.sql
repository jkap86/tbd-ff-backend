-- Create draft_derby_selections table to track which roster selected which draft position
CREATE TABLE IF NOT EXISTS draft_derby_selections (
  id SERIAL PRIMARY KEY,
  derby_id INTEGER NOT NULL REFERENCES draft_derby(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  draft_position INTEGER NOT NULL, -- The slot they selected (1, 2, 3...)
  selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(derby_id, roster_id), -- Each roster can only select once per derby
  UNIQUE(derby_id, draft_position) -- Each draft position can only be selected once per derby
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_derby_id ON draft_derby_selections(derby_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_roster_id ON draft_derby_selections(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_position ON draft_derby_selections(derby_id, draft_position);

-- Add comments
COMMENT ON TABLE draft_derby_selections IS 'Records which roster selected which draft position during the derby';
COMMENT ON COLUMN draft_derby_selections.draft_position IS 'The draft slot number the roster selected (1-N where N is number of teams)';
