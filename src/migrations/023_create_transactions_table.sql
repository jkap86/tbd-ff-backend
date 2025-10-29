-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'processed',
    adds JSONB DEFAULT '[]',
    drops JSONB DEFAULT '[]',
    waiver_bid INTEGER,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_transactions_roster ON transactions(roster_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_processed_at ON transactions(processed_at DESC);
