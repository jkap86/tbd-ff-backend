-- Create draft_derby table to track derby draft for position selection
CREATE TABLE IF NOT EXISTS draft_derby (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  derby_order JSONB, -- Array of roster_ids in derby selection order
  current_turn INTEGER DEFAULT 0,
  turn_deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(draft_id)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_draft_derby_draft_id ON draft_derby(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_status ON draft_derby(status) WHERE status = 'in_progress';