-- Migration: Transform draft_derby table from old schema to new schema
-- Old schema: derby_order, current_turn, turn_deadline
-- New schema: selection_order, current_turn_roster_id, current_turn_started_at, skipped_roster_ids

-- Step 1: Add new columns if they don't exist
ALTER TABLE draft_derby
  ADD COLUMN IF NOT EXISTS selection_order JSONB,
  ADD COLUMN IF NOT EXISTS current_turn_roster_id INTEGER REFERENCES rosters(id),
  ADD COLUMN IF NOT EXISTS current_turn_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS skipped_roster_ids JSONB DEFAULT '[]';

-- Step 2: Migrate data from old columns to new columns (only if old columns exist)
DO $$
BEGIN
  -- Check if old column exists before trying to migrate
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'draft_derby' AND column_name = 'derby_order'
  ) THEN
    -- Migrate data from old schema to new schema
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
  ELSE
    -- Old columns don't exist, ensure new columns have defaults
    UPDATE draft_derby
    SET
      selection_order = COALESCE(selection_order, '[]'::jsonb),
      skipped_roster_ids = COALESCE(skipped_roster_ids, '[]'::jsonb)
    WHERE selection_order IS NULL;
  END IF;
END $$;

-- Step 3: Make selection_order NOT NULL after migration (only if there's data or set default)
DO $$
BEGIN
  -- Only set NOT NULL if column exists and either has data or we can set a default
  IF EXISTS (SELECT 1 FROM draft_derby WHERE selection_order IS NOT NULL) OR
     NOT EXISTS (SELECT 1 FROM draft_derby LIMIT 1) THEN
    ALTER TABLE draft_derby ALTER COLUMN selection_order SET NOT NULL;
  END IF;
END $$;

-- Step 4: Drop old columns if they exist
ALTER TABLE draft_derby
  DROP COLUMN IF EXISTS derby_order,
  DROP COLUMN IF EXISTS current_turn,
  DROP COLUMN IF EXISTS turn_deadline;

-- Step 5: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_draft_derby_current_turn ON draft_derby(current_turn_roster_id);

-- Step 6: Add comments
COMMENT ON COLUMN draft_derby.selection_order IS 'Randomized array of roster IDs determining the order managers select their draft slots';
COMMENT ON COLUMN draft_derby.skipped_roster_ids IS 'Array of roster IDs that were skipped due to timeout, can pick out of turn (NFL-style)';
COMMENT ON COLUMN draft_derby.current_turn_roster_id IS 'The roster ID that is currently selecting their draft position (NULL when only skipped users remain)';
COMMENT ON COLUMN draft_derby.current_turn_started_at IS 'When the current turn started, used for calculating timeout';
