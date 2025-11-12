-- Add buy_in column to leagues table
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS buy_in DECIMAL(10, 2);

-- Add comment for the column
COMMENT ON COLUMN leagues.buy_in IS 'League buy-in amount in dollars';
