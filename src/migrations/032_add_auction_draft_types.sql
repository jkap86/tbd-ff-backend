-- Add auction-specific columns to drafts table
-- draft_type is VARCHAR(20), so 'auction' and 'slow_auction' can be used directly
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS starting_budget INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS min_bid INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_simultaneous_nominations INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS nomination_timer_hours INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reserve_budget_per_slot BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN drafts.starting_budget IS 'Starting budget for each team in auction drafts (default $200)';
COMMENT ON COLUMN drafts.min_bid IS 'Minimum bid amount for auction drafts (default $1)';
COMMENT ON COLUMN drafts.max_simultaneous_nominations IS 'Max players that can be nominated at once (1=regular auction, 20-30=slow auction)';
COMMENT ON COLUMN drafts.nomination_timer_hours IS 'Hours until player is won in slow auction (NULL for regular auction with pick_time_seconds)';
COMMENT ON COLUMN drafts.reserve_budget_per_slot IS 'Whether to reserve $1 per remaining roster spot (prevents teams from running out of money)';
