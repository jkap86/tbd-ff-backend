-- Create opponent_selection_drafts table for managing opponent selection draft state
CREATE TABLE IF NOT EXISTS opponent_selection_drafts (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  current_turn_roster_id INTEGER REFERENCES rosters(id) ON DELETE SET NULL,
  time_limit_seconds INTEGER NOT NULL DEFAULT 120,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Ensure one draft per league
  UNIQUE (league_id)
);

-- Create opponent_selection_draft_picks table for tracking selections
CREATE TABLE IF NOT EXISTS opponent_selection_draft_picks (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES opponent_selection_drafts(id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  opponent_roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  pick_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure unique roster-opponent-week combinations
  UNIQUE (draft_id, roster_id, opponent_roster_id, week),

  -- Ensure unique pick numbers per draft
  UNIQUE (draft_id, pick_number)
);

-- Add indexes for efficient queries
CREATE INDEX idx_opponent_selection_drafts_league_id ON opponent_selection_drafts(league_id);
CREATE INDEX idx_opponent_selection_drafts_status ON opponent_selection_drafts(status);
CREATE INDEX idx_opponent_selection_draft_picks_draft_id ON opponent_selection_draft_picks(draft_id);
CREATE INDEX idx_opponent_selection_draft_picks_roster_id ON opponent_selection_draft_picks(roster_id);

-- Add comments to tables
COMMENT ON TABLE opponent_selection_drafts IS 'Stores the state of opponent selection drafts for head-to-head leagues';
COMMENT ON TABLE opponent_selection_draft_picks IS 'Stores the opponent-week selections made during opponent selection drafts';
