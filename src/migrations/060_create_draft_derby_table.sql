-- Create draft_derby table to track the derby selection phase
-- This migration supports both new installations and existing tables with old schema
CREATE TABLE IF NOT EXISTS draft_derby (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER UNIQUE NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  derby_order JSONB, -- OLD SCHEMA: kept for backwards compatibility, will be migrated in 064
  current_turn INTEGER, -- OLD SCHEMA: kept for backwards compatibility, will be migrated in 064
  turn_deadline TIMESTAMP, -- OLD SCHEMA: kept for backwards compatibility, will be migrated in 064
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes (safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_draft_derby_draft_id ON draft_derby(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_derby_status ON draft_derby(status);

-- Add comments
COMMENT ON TABLE draft_derby IS 'Tracks the draft slot selection derby phase where managers pick their draft positions';
