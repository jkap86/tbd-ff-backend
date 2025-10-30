-- Migration 034: Rename max_simultaneous_nominations to nominations_per_manager
-- Changes the column name to better reflect that this is per-manager, not total

-- Only rename if the old column exists and new column doesn't
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts' AND column_name = 'max_simultaneous_nominations'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts' AND column_name = 'nominations_per_manager'
  ) THEN
    ALTER TABLE drafts
    RENAME COLUMN max_simultaneous_nominations TO nominations_per_manager;
  END IF;
END $$;

-- Update default value to 3 for existing rows that have 1
UPDATE drafts
SET nominations_per_manager = 3
WHERE nominations_per_manager = 1 AND draft_type IN ('auction', 'slow_auction');
