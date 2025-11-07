-- Migration 072: Re-add roster_id foreign key to draft_derby_selections
-- Lost in migration 061_recreate_draft_derby_selections.sql
--
-- ISSUE: Migration 061 (recreate) dropped and recreated the draft_derby_selections
-- table but removed the foreign key constraint on roster_id. This breaks referential
-- integrity and prevents proper CASCADE DELETE behavior when rosters are deleted.

-- ============================================================================
-- ADD FOREIGN KEY CONSTRAINT
-- ============================================================================

ALTER TABLE draft_derby_selections
  DROP CONSTRAINT IF EXISTS draft_derby_selections_roster_id_fkey;

ALTER TABLE draft_derby_selections
  ADD CONSTRAINT draft_derby_selections_roster_id_fkey
  FOREIGN KEY (roster_id)
  REFERENCES rosters(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT draft_derby_selections_roster_id_fkey ON draft_derby_selections
  IS 'CASCADE: Delete derby selection when roster deleted (per TRUTHS.md Section 1)';

-- ============================================================================
-- CREATE INDEX FOR FOREIGN KEY
-- ============================================================================

-- Ensure index exists for efficient JOINs and CASCADE DELETE performance
CREATE INDEX IF NOT EXISTS idx_draft_derby_selections_roster_id
  ON draft_derby_selections(roster_id);

COMMENT ON INDEX idx_draft_derby_selections_roster_id
  IS 'Performance index for roster foreign key lookups';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- After running this migration, verify with:
-- SELECT * FROM information_schema.table_constraints
-- WHERE table_name = 'draft_derby_selections'
--   AND constraint_type = 'FOREIGN KEY';
