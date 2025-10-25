-- Create draft_picks table
CREATE TABLE IF NOT EXISTS draft_picks (
    id SERIAL PRIMARY KEY,
    draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    pick_number INTEGER NOT NULL, -- Overall pick number (1-180 for 12 team, 15 round draft)
    round INTEGER NOT NULL,
    pick_in_round INTEGER NOT NULL, -- Pick number within the round (1-12 for 12 team league)
    roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    is_auto_pick BOOLEAN DEFAULT FALSE, -- Whether this was an auto-pick due to timer expiration
    picked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pick_time_seconds INTEGER, -- How many seconds the pick took
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(draft_id, pick_number), -- Each pick number is unique per draft
    UNIQUE(draft_id, player_id) -- Each player can only be drafted once per draft
);

-- Create indexes
CREATE INDEX idx_draft_picks_draft_id ON draft_picks(draft_id);
CREATE INDEX idx_draft_picks_roster_id ON draft_picks(roster_id);
CREATE INDEX idx_draft_picks_player_id ON draft_picks(player_id);
CREATE INDEX idx_draft_picks_pick_number ON draft_picks(draft_id, pick_number);
CREATE INDEX idx_draft_picks_round ON draft_picks(draft_id, round);
