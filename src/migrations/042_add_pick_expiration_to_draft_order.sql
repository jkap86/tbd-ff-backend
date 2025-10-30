-- Add pick_expiration and pick_number to draft_order table for timer synchronization
-- This enables server-side deadline tracking instead of client-side countdowns

ALTER TABLE draft_order
ADD COLUMN IF NOT EXISTS pick_expiration TIMESTAMP,
ADD COLUMN IF NOT EXISTS pick_number INTEGER;

-- Create index for efficient deadline queries
CREATE INDEX IF NOT EXISTS idx_draft_order_pick_expiration
ON draft_order(draft_id, pick_number, pick_expiration);

-- Add comment explaining the purpose
COMMENT ON COLUMN draft_order.pick_expiration IS 'Server-side timestamp when this pick expires. Used to synchronize timers across all clients.';
COMMENT ON COLUMN draft_order.pick_number IS 'Which pick number this row represents (1-based). Used to track the current pick deadline.';
