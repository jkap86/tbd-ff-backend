-- Create rosters table
CREATE TABLE IF NOT EXISTS rosters (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roster_id INTEGER NOT NULL,
    settings JSONB,
    starters JSONB DEFAULT '[]',
    bench JSONB DEFAULT '[]',
    taxi JSONB DEFAULT '[]',
    ir JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_league_user UNIQUE(league_id, user_id),
    CONSTRAINT unique_league_roster UNIQUE(league_id, roster_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_rosters_league_id ON rosters(league_id);

CREATE INDEX IF NOT EXISTS idx_rosters_user_id ON rosters(user_id);

CREATE INDEX IF NOT EXISTS idx_rosters_roster_id ON rosters(roster_id);

-- Create trigger to automatically update updated_at (drop first if exists)
DROP TRIGGER IF EXISTS update_rosters_updated_at ON rosters;

CREATE TRIGGER update_rosters_updated_at BEFORE
UPDATE
    ON rosters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();