-- Create matchups table
CREATE TABLE IF NOT EXISTS matchups (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    season VARCHAR(4) NOT NULL,
    roster1_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
    roster2_id INTEGER REFERENCES rosters(id) ON DELETE SET NULL, -- NULL for bye week
    roster1_score DECIMAL(10, 2) DEFAULT 0,
    roster2_score DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique matchup per week
    CONSTRAINT unique_matchup_per_week UNIQUE (league_id, week, roster1_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_matchups_roster1 ON matchups(roster1_id);
CREATE INDEX IF NOT EXISTS idx_matchups_roster2 ON matchups(roster2_id);
CREATE INDEX IF NOT EXISTS idx_matchups_status ON matchups(status);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_matchups_updated_at ON matchups;

CREATE TRIGGER update_matchups_updated_at BEFORE UPDATE
    ON matchups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
