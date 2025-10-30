-- Add bid_increment column to drafts table
ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS bid_increment INTEGER NOT NULL DEFAULT 1;

-- Update existing auction/slow_auction drafts to have bid_increment = 1
UPDATE drafts
SET bid_increment = 1
WHERE draft_type IN ('auction', 'slow_auction') AND bid_increment IS NULL;
