-- Manual migration to fix derby schema
-- Run this directly in your PostgreSQL database

-- Step 1: Add the new derby_skipped_user_time_limit_seconds field to drafts table
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS derby_skipped_user_time_limit_seconds INTEGER;

COMMENT ON COLUMN drafts.derby_skipped_user_time_limit_seconds IS
  'Time limit in seconds for skipped users when only skipped users remain. If NULL, uses derby_time_limit_seconds.';

-- Step 2: Transform draft_derby table from old schema to new schema
-- Add new columns
ALTER TABLE draft_derby
  ADD COLUMN IF NOT EXISTS selection_order JSONB,
  ADD COLUMN IF NOT EXISTS current_turn_roster_id INTEGER REFERENCES rosters(id),
  ADD COLUMN IF NOT EXISTS current_turn_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS skipped_roster_ids JSONB DEFAULT '[]';

-- Step 3: Migrate data from old columns to new columns (only if old columns exist)
DO $$
BEGIN
  -- Check if old columns exist and migrate data
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'draft_derby' AND column_name = 'derby_order') THEN

    UPDATE draft_derby
    SET
      selection_order = derby_order,
      current_turn_roster_id = (
        CASE
          WHEN derby_order IS NOT NULL AND current_turn IS NOT NULL
            AND current_turn < jsonb_array_length(derby_order)
          THEN (derby_order->>current_turn)::INTEGER
          ELSE NULL
        END
      ),
      current_turn_started_at = COALESCE(current_turn_started_at, updated_at),
      skipped_roster_ids = COALESCE(skipped_roster_ids, '[]'::jsonb)
    WHERE selection_order IS NULL AND derby_order IS NOT NULL;

  END IF;
END $$;

-- Step 4: Handle the NOT NULL constraint for selection_order
-- First, set a default empty array for any NULL values
UPDATE draft_derby
SET selection_order = '[]'::jsonb
WHERE selection_order IS NULL;

-- Now make it NOT NULL
ALTER TABLE draft_derby
  ALTER COLUMN selection_order SET NOT NULL;

-- Step 5: Drop old columns if they exist
ALTER TABLE draft_derby
  DROP COLUMN IF EXISTS derby_order,
  DROP COLUMN IF EXISTS current_turn,
  DROP COLUMN IF EXISTS turn_deadline;

-- Step 6: Create indexes
CREATE INDEX IF NOT EXISTS idx_draft_derby_current_turn ON draft_derby(current_turn_roster_id);

-- Step 7: Add comments
COMMENT ON COLUMN draft_derby.selection_order IS 'Randomized array of roster IDs determining the order managers select their draft slots';
COMMENT ON COLUMN draft_derby.skipped_roster_ids IS 'Array of roster IDs that were skipped due to timeout, can pick out of turn (NFL-style)';
COMMENT ON COLUMN draft_derby.current_turn_roster_id IS 'The roster ID that is currently selecting their draft position (NULL when only skipped users remain)';
COMMENT ON COLUMN draft_derby.current_turn_started_at IS 'When the current turn started, used for calculating timeout';

-- Verify the changes
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'draft_derby'
ORDER BY ordinal_position;
