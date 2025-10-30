-- Add injury status to players table
ALTER TABLE players
ADD COLUMN injury_status VARCHAR(20), -- 'Out', 'Doubtful', 'Questionable', 'IR', 'PUP', 'Healthy'
ADD COLUMN injury_designation TEXT, -- Description of injury (e.g., "Ankle", "Hamstring")
ADD COLUMN injury_return_date DATE, -- Expected return date (nullable)
ADD COLUMN injury_updated_at TIMESTAMP; -- When injury status last changed

-- Create index for querying injured players
CREATE INDEX IF NOT EXISTS idx_players_injury_status ON players(injury_status) WHERE injury_status IS NOT NULL;

-- Add comments
COMMENT ON COLUMN players.injury_status IS 'Current injury status from NFL injury report';
COMMENT ON COLUMN players.injury_designation IS 'Body part or type of injury';
COMMENT ON COLUMN players.injury_return_date IS 'Estimated return date';
COMMENT ON COLUMN players.injury_updated_at IS 'Timestamp of last injury status change';
