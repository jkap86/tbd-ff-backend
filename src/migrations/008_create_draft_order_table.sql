-- Create draft_order table
CREATE TABLE IF NOT EXISTS draft_order (
    id SERIAL PRIMARY KEY,
    draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
    draft_position INTEGER NOT NULL, -- 1-based position in draft order (1 = first pick)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(draft_id, roster_id), -- Each roster appears once per draft
    UNIQUE(draft_id, draft_position) -- Each position is unique per draft
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_draft_order_draft_id ON draft_order(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_order_roster_id ON draft_order(roster_id);
CREATE INDEX IF NOT EXISTS idx_draft_order_position ON draft_order(draft_id, draft_position);
