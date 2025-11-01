-- Drop and recreate draft_derby_selections table with correct schema
DROP TABLE IF EXISTS draft_derby_selections CASCADE;

CREATE TABLE draft_derby_selections (
  id SERIAL PRIMARY KEY,
  derby_id INTEGER NOT NULL REFERENCES draft_derby(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL,
  draft_position INTEGER NOT NULL,
  selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(derby_id, roster_id),
  UNIQUE(derby_id, draft_position)
);

CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_derby_id ON draft_derby_selections(derby_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_roster_id ON draft_derby_selections(roster_id);
