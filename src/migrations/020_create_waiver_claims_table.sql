-- Create waiver_claims table
CREATE TABLE IF NOT EXISTS waiver_claims (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL,
    drop_player_id INTEGER,
    bid_amount INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    processed_at TIMESTAMP,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_waiver_claims_league ON waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_roster ON waiver_claims(roster_id);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_status ON waiver_claims(status);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_player ON waiver_claims(player_id);

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_waiver_claims_updated_at ON waiver_claims;

CREATE TRIGGER update_waiver_claims_updated_at BEFORE
UPDATE
    ON waiver_claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
