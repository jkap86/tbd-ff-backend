-- Create weekly_lineups table for managing lineups per week
CREATE TABLE IF NOT EXISTS weekly_lineups (
  id SERIAL PRIMARY KEY,
  roster_id INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  season VARCHAR(4) NOT NULL,
  starters JSONB NOT NULL DEFAULT '[]', -- Array of {slot: string, player_id: number | null}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(roster_id, week, season)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_roster_week ON weekly_lineups(roster_id, week, season);

-- Add comment
COMMENT ON TABLE weekly_lineups IS 'Stores lineup configurations for each roster per week';
COMMENT ON COLUMN weekly_lineups.starters IS 'Array of starter slot assignments: [{slot: "QB", player_id: 123}, ...]';
