-- Add ADP (Average Draft Position) and search rank to players table
ALTER TABLE players
ADD COLUMN IF NOT EXISTS search_rank INTEGER,
ADD COLUMN IF NOT EXISTS fantasy_data_id VARCHAR(50);

-- Create index for ADP sorting
CREATE INDEX IF NOT EXISTS idx_players_search_rank ON players(search_rank);

-- Update the updated_at trigger if it exists
COMMENT ON COLUMN players.search_rank IS 'Sleeper search rank - lower is better (used as ADP proxy)';
