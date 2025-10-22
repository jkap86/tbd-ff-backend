-- Create league_invites table
CREATE TABLE IF NOT EXISTS league_invites (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    inviter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Ensure user can't be invited to same league multiple times
    CONSTRAINT unique_league_invite UNIQUE(league_id, invited_user_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_league_invites_league_id ON league_invites(league_id);

CREATE INDEX IF NOT EXISTS idx_league_invites_invited_user_id ON league_invites(invited_user_id);

CREATE INDEX IF NOT EXISTS idx_league_invites_status ON league_invites(status);

-- Create trigger to automatically update updated_at (drop first if exists)
DROP TRIGGER IF EXISTS update_league_invites_updated_at ON league_invites;

CREATE TRIGGER update_league_invites_updated_at BEFORE
UPDATE
    ON league_invites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();