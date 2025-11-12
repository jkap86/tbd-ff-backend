-- Add record tracking columns to rosters table
ALTER TABLE rosters
ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ties INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS points_for DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS points_against DECIMAL(10, 2) DEFAULT 0.00;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rosters_wins ON rosters(wins DESC);
CREATE INDEX IF NOT EXISTS idx_rosters_points_for ON rosters(points_for DESC);

-- Add comments
COMMENT ON COLUMN rosters.wins IS 'Total wins for the season';
COMMENT ON COLUMN rosters.losses IS 'Total losses for the season';
COMMENT ON COLUMN rosters.ties IS 'Total ties for the season';
COMMENT ON COLUMN rosters.points_for IS 'Total points scored by this roster';
COMMENT ON COLUMN rosters.points_against IS 'Total points scored against this roster';
