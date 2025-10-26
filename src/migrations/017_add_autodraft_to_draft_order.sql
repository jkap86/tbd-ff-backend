-- Add autodraft column to draft_order table
ALTER TABLE draft_order
ADD COLUMN IF NOT EXISTS is_autodrafting BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_draft_order_autodraft ON draft_order(draft_id, is_autodrafting);
