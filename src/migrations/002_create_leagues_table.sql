-- Create leagues table
CREATE TABLE IF NOT EXISTS leagues (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pre_draft',
    settings JSONB,
    scoring_settings JSONB,
    season VARCHAR(4) NOT NULL,
    season_type VARCHAR(20) DEFAULT 'regular',
    roster_positions JSONB,
    total_rosters INTEGER DEFAULT 12,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on season for faster queries
CREATE INDEX IF NOT EXISTS idx_leagues_season ON leagues(season);

-- Create index on status for faster queries
CREATE INDEX IF NOT EXISTS idx_leagues_status ON leagues(status);

-- Create trigger to automatically update updated_at (drop first if exists)
DROP TRIGGER IF EXISTS update_leagues_updated_at ON leagues;

CREATE TRIGGER update_leagues_updated_at BEFORE
UPDATE
    ON leagues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();