-- Migration 076: Add bid timer for auction drafts
-- Adds bid_timer_seconds column to separate nomination time from bidding time

-- Add bid_timer_seconds column for auction drafts
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS bid_timer_seconds INTEGER DEFAULT 30;

-- Add comment for documentation
COMMENT ON COLUMN drafts.bid_timer_seconds IS 'Time in seconds for bidding phase after a player is nominated in auction drafts (default 30 seconds)';
COMMENT ON COLUMN drafts.pick_time_seconds IS 'For regular drafts: pick timer. For auctions: nomination timer (how long to nominate a player)';
