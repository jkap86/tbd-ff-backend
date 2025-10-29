-- Add chess timer mode support to drafts table
-- This allows drafts to operate in either 'traditional' (per-pick timer) or 'chess' (team time budget) mode

-- Add timer_mode column to track which timer system is in use
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS timer_mode VARCHAR(20) NOT NULL DEFAULT 'traditional';

-- Add comment to timer_mode column
COMMENT ON COLUMN drafts.timer_mode IS 'Timer mode: ''traditional'' (per-pick timer) or ''chess'' (team time budget)';

-- Add team_time_budget_seconds column for chess timer mode
-- This is the total time budget each team gets for the entire draft (in seconds)
-- NULL for traditional mode, required for chess mode
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS team_time_budget_seconds INTEGER;

-- Add comment to team_time_budget_seconds column
COMMENT ON COLUMN drafts.team_time_budget_seconds IS 'Total time budget per team in seconds (chess mode only). Example: 3600 = 1 hour';

-- Add check constraint to ensure chess mode requires a time budget
ALTER TABLE drafts
ADD CONSTRAINT check_chess_timer_has_budget
CHECK (
    (timer_mode = 'traditional') OR
    (timer_mode = 'chess' AND team_time_budget_seconds IS NOT NULL AND team_time_budget_seconds > 0)
);

-- Add index for timer_mode queries
CREATE INDEX IF NOT EXISTS idx_drafts_timer_mode ON drafts(timer_mode);
