-- Create drafts table
CREATE TABLE IF NOT EXISTS drafts (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    draft_type VARCHAR(20) NOT NULL DEFAULT 'snake', -- 'snake' or 'linear'
    third_round_reversal BOOLEAN DEFAULT FALSE, -- For snake drafts: reverse order in round 3
    status VARCHAR(20) NOT NULL DEFAULT 'not_started', -- 'not_started', 'in_progress', 'paused', 'completed'
    current_pick INTEGER DEFAULT 1, -- Current overall pick number
    current_round INTEGER DEFAULT 1,
    current_roster_id INTEGER, -- Which roster is currently picking
    pick_time_seconds INTEGER DEFAULT 90, -- Time limit per pick in seconds
    pick_deadline TIMESTAMP, -- Deadline for current pick
    rounds INTEGER NOT NULL DEFAULT 15, -- Number of rounds in the draft
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    settings JSONB DEFAULT '{}', -- Additional draft settings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id) -- One draft per league
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_drafts_league_id ON drafts(league_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
