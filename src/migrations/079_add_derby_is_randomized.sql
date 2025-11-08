-- Migration: Add is_randomized flag to draft_derby table
-- Purpose: Track whether derby selection order has been randomized
-- This allows UI to show "Randomize Order" vs "Start Derby" button

-- Add is_randomized column (defaults to false for existing derbies)
ALTER TABLE draft_derby
ADD COLUMN IF NOT EXISTS is_randomized BOOLEAN DEFAULT FALSE NOT NULL;

-- Set existing derbies to is_randomized = true (they were auto-randomized)
-- This ensures existing derbies show "Start Derby" button
UPDATE draft_derby
SET is_randomized = TRUE
WHERE is_randomized = FALSE;

-- Add comment to document the column
COMMENT ON COLUMN draft_derby.is_randomized IS 'Whether the selection order has been randomized (vs draft order)';
