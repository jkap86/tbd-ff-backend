-- Migration 077: Add bid deadline to nominations
-- Adds bid_deadline column to track when bidding window closes (separate from nomination deadline)

-- Add bid_deadline column to auction_nominations
ALTER TABLE auction_nominations
ADD COLUMN IF NOT EXISTS bid_deadline TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN auction_nominations.bid_deadline IS 'When the bidding window closes (for regular auctions). NULL for slow auctions.';
COMMENT ON COLUMN auction_nominations.deadline IS 'When the nomination expires (nomination timer). In slow auctions, this is the main timer.';
